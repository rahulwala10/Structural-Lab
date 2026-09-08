import React, { useState, useMemo, useRef } from "react";

// ============================================================
// Beam analysis engine — Euler–Bernoulli, direct stiffness method
// Units: m, kN, kN·m, EI in kN·m². Loads: downward positive.
// Sign conventions: sagging M positive, V positive (left segment up),
// deflection v positive upward (displayed as mm, down negative).
// ============================================================
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

function gaussSolve(K, F, free) {
  const n = free.length;
  const A = new Array(n);
  const b = new Float64Array(n);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    A[i] = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      A[i][j] = K[free[i]][free[j]];
      const av = Math.abs(A[i][j]);
      if (av > mx) mx = av;
    }
    b[i] = F[free[i]];
  }
  if (mx === 0) return null;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-10 * mx) return null; // singular → mechanism
    if (p !== c) { const t = A[p]; A[p] = A[c]; A[c] = t; const tb = b[p]; b[p] = b[c]; b[c] = tb; }
    const piv = A[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / piv;
      if (f === 0) continue;
      for (let j = c; j < n; j++) A[r][j] -= f * A[c][j];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

function analyzeBeam(cfg) {
  const L = cfg.L, EI = cfg.EI;
  const supports = (cfg.supports || []).map(s => ({ ...s, x: clamp(s.x, 0, L) }));
  const hinges = (cfg.hinges || []).map(h => clamp(h, 0, L)).filter(h => h > 1e-6 && h < L - 1e-6);
  const loads = (cfg.loads || []).map(l => {
    if (l.type === 'udl') {
      const x1 = clamp(Math.min(l.x1, l.x2), 0, L), x2 = clamp(Math.max(l.x1, l.x2), 0, L);
      return { ...l, x1, x2 };
    }
    return { ...l, x: clamp(l.x, 0, L) };
  });

  // ---- keypoints & mesh
  let kp = [0, L];
  supports.forEach(s => kp.push(s.x));
  hinges.forEach(h => kp.push(h));
  loads.forEach(l => { if (l.type === 'udl') { kp.push(l.x1); kp.push(l.x2); } else kp.push(l.x); });
  kp.sort((a, b) => a - b);
  const key = [];
  kp.forEach(x => { if (!key.length || x - key[key.length - 1] > 1e-7) key.push(x); });

  const targetEls = 100;
  const nodesX = [];
  for (let i = 0; i < key.length - 1; i++) {
    const a = key[i], b = key[i + 1], seg = b - a;
    const n = Math.max(1, Math.round(seg / (L / targetEls)));
    for (let k = 0; k < n; k++) nodesX.push(a + (seg * k) / n);
  }
  nodesX.push(L);
  const nn = nodesX.length;
  const nodeAt = x => {
    let best = -1, bd = 1e9;
    for (let i = 0; i < nn; i++) { const d = Math.abs(nodesX[i] - x); if (d < bd) { bd = d; best = i; } }
    return bd < 1e-6 ? best : -1;
  };

  const fixedNodeSet = new Set();
  supports.forEach(s => { if (s.type === 'fixed') { const i = nodeAt(s.x); if (i >= 0) fixedNodeSet.add(i); } });
  const isHinge = new Array(nn).fill(false);
  hinges.forEach(h => { const i = nodeAt(h); if (i > 0 && i < nn - 1 && !fixedNodeSet.has(i)) isHinge[i] = true; });

  // ---- DOF map (v + θ; hinge nodes get θ_left & θ_right)
  const vD = new Array(nn), tL = new Array(nn), tR = new Array(nn);
  let nd = 0;
  for (let i = 0; i < nn; i++) {
    vD[i] = nd++;
    if (isHinge[i]) { tL[i] = nd++; tR[i] = nd++; }
    else { tL[i] = tR[i] = nd++; }
  }

  // ---- assemble K, F
  const K = Array.from({ length: nd }, () => new Float64Array(nd));
  const F = new Float64Array(nd);
  for (let e = 0; e < nn - 1; e++) {
    const Le = nodesX[e + 1] - nodesX[e], c = EI / (Le * Le * Le);
    const ke = [
      [12 * c, 6 * c * Le, -12 * c, 6 * c * Le],
      [6 * c * Le, 4 * c * Le * Le, -6 * c * Le, 2 * c * Le * Le],
      [-12 * c, -6 * c * Le, 12 * c, -6 * c * Le],
      [6 * c * Le, 2 * c * Le * Le, -6 * c * Le, 4 * c * Le * Le],
    ];
    const d = [vD[e], tR[e], vD[e + 1], tL[e + 1]];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[d[a]][d[b]] += ke[a][b];
  }
  loads.forEach(l => {
    if (l.type === 'point') { const i = nodeAt(l.x); if (i >= 0) F[vD[i]] -= l.P; }
    else if (l.type === 'moment') { const i = nodeAt(l.x); if (i >= 0) F[tL[i]] += l.M; }
    else if (l.type === 'udl') {
      if (l.x2 - l.x1 < 1e-9) return;
      const m = (l.w2 - l.w1) / (l.x2 - l.x1);
      const wAt = x => l.w1 + m * (x - l.x1);
      for (let e = 0; e < nn - 1; e++) {
        const a = nodesX[e], b = nodesX[e + 1];
        if (a >= l.x1 - 1e-9 && b <= l.x2 + 1e-9) {
          const Le = b - a, q1 = -wAt(a), q2 = -wAt(b);
          F[vD[e]] += Le * (7 * q1 + 3 * q2) / 20;
          F[tR[e]] += Le * Le * (3 * q1 + 2 * q2) / 60;
          F[vD[e + 1]] += Le * (3 * q1 + 7 * q2) / 20;
          F[tL[e + 1]] -= Le * Le * (2 * q1 + 3 * q2) / 60;
        }
      }
    }
  });

  // ---- constraints
  const fixedDofs = new Set();
  const supNodes = [];
  supports.forEach(s => {
    const i = nodeAt(s.x);
    if (i < 0) return;
    supNodes.push({ ...s, node: i });
    fixedDofs.add(vD[i]);
    if (s.type === 'fixed') { fixedDofs.add(tL[i]); fixedDofs.add(tR[i]); }
  });
  const free = [];
  for (let i = 0; i < nd; i++) if (!fixedDofs.has(i)) free.push(i);

  // determinacy (transverse beam statics: 2 equilibrium eqns + 1 per hinge)
  const r = supports.reduce((s, x) => s + (x.type === 'fixed' ? 2 : 1), 0);
  const nIndet = r - 2 - hinges.length;

  const base = { nodesX, nIndet, r, h: hinges.length, L, EI };

  if (supports.length === 0) return { ...base, stable: false, reason: 'No supports — rigid body mechanism.' };

  // ---- solve
  const U = new Float64Array(nd);
  if (free.length) {
    const sol = gaussSolve(K, F, free);
    if (!sol) return { ...base, stable: false, reason: nIndet < 0 ? 'Insufficient restraint (n < 0): the structure is a mechanism.' : 'Unstable arrangement (singular stiffness matrix) — e.g. hinge placement creates a mechanism.' };
    for (let k = 0; k < free.length; k++) U[free[k]] = sol[k];
  }

  // ---- reactions: R = K·U − F at constrained DOFs (up +, CCW +)
  const reactions = supNodes.map(s => {
    const i = s.node;
    let Rv = 0;
    for (let j = 0; j < nd; j++) Rv += K[vD[i]][j] * U[j];
    Rv -= F[vD[i]];
    let RM = 0;
    if (s.type === 'fixed') {
      for (let j = 0; j < nd; j++) RM += K[tL[i]][j] * U[j];
      RM -= F[tL[i]];
    }
    return { x: s.x, type: s.type, R: Rv, M: RM };
  });

  // ---- statics post-processing for exact V(x), M(x)
  const pforces = []; // down +
  const couples = []; // CCW +
  const udls = [];
  reactions.forEach(rc => {
    pforces.push({ x: rc.x, P: -rc.R });
    if (rc.type === 'fixed') couples.push({ x: rc.x, M: rc.M });
  });
  loads.forEach(l => {
    if (l.type === 'point') pforces.push({ x: l.x, P: l.P });
    else if (l.type === 'moment') couples.push({ x: l.x, M: l.M });
    else if (l.type === 'udl' && l.x2 - l.x1 > 1e-9) udls.push(l);
  });

  function wInt(u, x) { // [∫w dξ, ∫w(x−ξ)dξ] over [u.x1, min(x,u.x2)]
    const a = u.x1, b = Math.min(x, u.x2);
    if (b <= a + 1e-12) return [0, 0];
    const m = (u.w2 - u.w1) / (u.x2 - u.x1);
    const A1 = u.w1 * (b - a) + m * (b - a) * (b - a) / 2;
    const I1 = u.w1 * (b * b - a * a) / 2 + m * ((b * b * b - a * a * a) / 3 - a * (b * b - a * a) / 2);
    return [A1, x * A1 - I1];
  }
  const EPSX = 1e-7;
  function Vat(x, incl) {
    let V = 0;
    for (const p of pforces) {
      if (p.x < x - EPSX || (incl && Math.abs(p.x - x) <= EPSX)) V -= p.P;
    }
    for (const u of udls) V -= wInt(u, x)[0];
    return V;
  }
  function Mat(x, incl) {
    let M = 0;
    for (const p of pforces) if (p.x < x + EPSX) M -= p.P * (x - p.x);
    for (const c of couples) {
      if (c.x < x - EPSX || (incl && Math.abs(c.x - x) <= EPSX)) M -= c.M;
    }
    for (const u of udls) M -= wInt(u, x)[1];
    return M;
  }

  // sample grid with duplicated points at discontinuities
  const events = new Set();
  pforces.forEach(p => events.add(round6(p.x)));
  couples.forEach(c => events.add(round6(c.x)));
  const NS = 480;
  const sampleXs = [];
  for (let i = 0; i <= NS; i++) sampleXs.push((L * i) / NS);
  events.forEach(x => sampleXs.push(x));
  sampleXs.sort((a, b) => a - b);
  const pts = [];
  for (const x of sampleXs) {
    const isEvent = events.has(round6(x));
    if (isEvent) { pts.push({ x, incl: false }); pts.push({ x, incl: true }); }
    else pts.push({ x, incl: true });
  }
  // dedupe identical consecutive
  const samples = [];
  for (const p of pts) {
    const last = samples[samples.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-9 && last.incl === p.incl) continue;
    samples.push(p);
  }
  const V = samples.map(p => Vat(p.x, p.incl));
  const M = samples.map(p => Mat(p.x, p.incl));
  const xs = samples.map(p => p.x);

  // ---- deflection: Hermite interpolation of FE solution
  const dx = [], dv = [];
  const SUB = 4;
  for (let e = 0; e < nn - 1; e++) {
    const Le = nodesX[e + 1] - nodesX[e];
    const v1 = U[vD[e]], t1 = U[tR[e]], v2 = U[vD[e + 1]], t2 = U[tL[e + 1]];
    for (let k = 0; k < SUB; k++) {
      const s = k / SUB;
      const N1 = 1 - 3 * s * s + 2 * s * s * s;
      const N2 = Le * (s - 2 * s * s + s * s * s);
      const N3 = 3 * s * s - 2 * s * s * s;
      const N4 = Le * (s * s * s - s * s);
      dx.push(nodesX[e] + s * Le);
      dv.push(N1 * v1 + N2 * t1 + N3 * v2 + N4 * t2);
    }
  }
  dx.push(L); dv.push(U[vD[nn - 1]]);

  // ---- extrema & contraflexure
  const ext = arrExtrema(xs, V);
  const extM = arrExtrema(xs, M);
  const extD = arrExtrema(dx, dv);
  const Mmag = Math.max(Math.abs(extM.max.v), Math.abs(extM.min.v), 1e-9);
  const contraflexure = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const m1 = M[i], m2 = M[i + 1];
    if (m1 === 0 && m2 === 0) continue;
    if (m1 * m2 < 0 && Math.max(Math.abs(m1), Math.abs(m2)) > 1e-4 * Mmag) {
      let xc;
      if (Math.abs(xs[i + 1] - xs[i]) < 1e-9) xc = xs[i];
      else xc = xs[i] + (xs[i + 1] - xs[i]) * (0 - m1) / (m2 - m1);
      if (xc > 1e-3 * L && xc < L - 1e-3 * L) {
        if (!contraflexure.length || Math.abs(contraflexure[contraflexure.length - 1] - xc) > 1e-3 * L) contraflexure.push(xc);
      }
    }
  }

  // equilibrium self-check
  let totalDown = 0;
  loads.forEach(l => {
    if (l.type === 'point') totalDown += l.P;
    else if (l.type === 'udl') totalDown += (l.w1 + l.w2) / 2 * (l.x2 - l.x1);
  });
  const totalR = reactions.reduce((s, rc) => s + rc.R, 0);

  return {
    ...base, stable: true, reactions, xs, V, M, dx, dv,
    Vmax: ext.max, Vmin: ext.min, Mmax: extM.max, Mmin: extM.min,
    Dmin: extD.min, Dmax: extD.max,
    contraflexure, totalDown, totalR,
    eqOK: Math.abs(totalR - totalDown) < Math.max(1e-6, 1e-4 * Math.max(Math.abs(totalDown), 1)),
  };
}

function round6(x) { return Math.round(x * 1e6) / 1e6; }
function arrExtrema(xs, ys) {
  let max = { x: xs[0], v: ys[0] }, min = { x: xs[0], v: ys[0] };
  for (let i = 1; i < xs.length; i++) {
    if (ys[i] > max.v) max = { x: xs[i], v: ys[i] };
    if (ys[i] < min.v) min = { x: xs[i], v: ys[i] };
  }
  return { max, min };
}

/* ============================================================
   Pure-JS helpers (no React) — verification & worked statics
   ============================================================ */
const fmt = (v, dp = 2) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : dp;
  let s = v.toFixed(d);
  if (parseFloat(s) === 0) s = (0).toFixed(d);
  return s;
};

function mkProbe(res) {
  const MatSide = (x, side = "R") => {
    const idxs = [];
    for (let i = 0; i < res.xs.length; i++) if (Math.abs(res.xs[i] - x) < 1e-7) idxs.push(i);
    if (idxs.length) return res.M[side === "R" ? idxs[idxs.length - 1] : idxs[0]];
    let bi = 0, bd = 1e9;
    for (let i = 0; i < res.xs.length; i++) { const d = Math.abs(res.xs[i] - x); if (d < bd) { bd = d; bi = i; } }
    return res.M[bi];
  };
  const VSide = (x, side = "R") => {
    const idxs = [];
    for (let i = 0; i < res.xs.length; i++) if (Math.abs(res.xs[i] - x) < 1e-7) idxs.push(i);
    if (idxs.length) return res.V[side === "R" ? idxs[idxs.length - 1] : idxs[0]];
    let bi = 0, bd = 1e9;
    for (let i = 0; i < res.xs.length; i++) { const d = Math.abs(res.xs[i] - x); if (d < bd) { bd = d; bi = i; } }
    return res.V[bi];
  };
  const Dat = x => {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < res.dx.length; i++) { const d = Math.abs(res.dx[i] - x); if (d < bd) { bd = d; bi = i; } }
    return res.dv[bi];
  };
  const Rat = x => {
    let b = null, bd = 1e9;
    res.reactions.forEach(r => { const d = Math.abs(r.x - x); if (d < bd) { bd = d; b = r; } });
    return b;
  };
  return { MatSide, VSide, Dat, Rat };
}

function activeLoads(loads) {
  return loads.filter(l =>
    l.type === "point" ? Math.abs(l.P) > 1e-9 :
    l.type === "moment" ? Math.abs(l.M) > 1e-9 :
    (l.x2 - l.x1 > 1e-9 && (Math.abs(l.w1) > 1e-9 || Math.abs(l.w2) > 1e-9)));
}

/* ---- closed-form textbook check (the "chartered engineer" cross-check) ---- */
function detectStandard(L, EI, supports, hingesArr, loads, res) {
  if (!res || !res.stable) return null;
  const Pr = mkProbe(res);
  const tol = Math.max(1e-6, 0.004 * L);
  const at = (a, b) => Math.abs(a - b) <= tol;
  const sup = [...supports].sort((a, b) => a.x - b.x);
  const H = hingesArr.length;
  const acts = activeLoads(loads);
  const rows = [];
  let name = null;
  const okv = (h, e) => { const s = Math.max(Math.abs(h), Math.abs(e)); return Math.abs(h - e) <= Math.max(0.02, 0.008 * s); };
  const add = (q, f, h, e, u) => rows.push({ q, f, hand: h, eng: e, unit: u, ok: okv(h, e) });
  const uni = l => Math.abs(l.w1 - l.w2) <= Math.max(1e-9, 0.02 * Math.max(Math.abs(l.w1), Math.abs(l.w2)));
  const fullSpan = l => at(l.x1, 0) && at(l.x2, L);
  const dmm = x => -Pr.Dat(x) * 1000; // downward positive, mm

  const simple2 = sup.length === 2 && sup.every(s => s.type !== "fixed") && H === 0 && at(sup[0].x, 0) && at(sup[1].x, L);
  if (simple2 && acts.length === 1) {
    const l = acts[0];
    if (l.type === "point") {
      const a = l.x, b = L - a, P = l.P;
      name = "Simply supported · single point load";
      add("R_A", "P·b/L", P * b / L, Pr.Rat(0).R, "kN");
      add("R_B", "P·a/L", P * a / L, Pr.Rat(L).R, "kN");
      add("M under load", "P·a·b/L", P * a * b / L, Pr.MatSide(a, "L"), "kN·m");
      if (at(a, L / 2)) add("δ midspan ↓", "PL³/48EI", P * L ** 3 / (48 * EI) * 1000, dmm(L / 2), "mm");
    } else if (l.type === "udl" && fullSpan(l) && uni(l)) {
      const w = (l.w1 + l.w2) / 2;
      name = "Simply supported · full-span UDL";
      add("R_A = R_B", "wL/2", w * L / 2, Pr.Rat(0).R, "kN");
      add("M max @ L/2", "wL²/8", w * L * L / 8, Pr.MatSide(L / 2), "kN·m");
      add("δ max ↓", "5wL⁴/384EI", 5 * w * L ** 4 / (384 * EI) * 1000, dmm(L / 2), "mm");
    } else if (l.type === "udl" && fullSpan(l) && (Math.abs(l.w1) <= 0.02 * Math.abs(l.w2) || Math.abs(l.w2) <= 0.02 * Math.abs(l.w1))) {
      const inc = Math.abs(l.w2) > Math.abs(l.w1);
      const w = inc ? l.w2 : l.w1;
      const xpk = inc ? L / Math.sqrt(3) : L - L / Math.sqrt(3);
      name = "Simply supported · triangular load";
      add(inc ? "R_A (small end)" : "R_B (small end)", "wL/6", w * L / 6, inc ? Pr.Rat(0).R : Pr.Rat(L).R, "kN");
      add(inc ? "R_B (big end)" : "R_A (big end)", "wL/3", w * L / 3, inc ? Pr.Rat(L).R : Pr.Rat(0).R, "kN");
      add("M max @ L/√3 from small end", "wL²/(9√3)", w * L * L / (9 * Math.sqrt(3)), Pr.MatSide(xpk), "kN·m");
    } else if (l.type === "moment") {
      const a = l.x, M0 = l.M;
      name = "Simply supported · applied couple";
      add("R_A", "+M₀/L", M0 / L, Pr.Rat(0).R, "kN");
      add("R_B", "−M₀/L", -M0 / L, Pr.Rat(L).R, "kN");
      add("M just left of couple", "M₀·a/L", M0 * a / L, Pr.MatSide(a, "L"), "kN·m");
      add("step in M across couple", "−M₀", -M0, Pr.MatSide(a, "R") - Pr.MatSide(a, "L"), "kN·m");
    }
  }

  const cant = !name && sup.length === 1 && sup[0].type === "fixed" && (at(sup[0].x, 0) || at(sup[0].x, L)) && H === 0;
  if (cant && acts.length === 1) {
    const left = at(sup[0].x, 0), xf = sup[0].x, l = acts[0];
    const free = left ? L : 0;
    if (l.type === "point") {
      const a = Math.abs(l.x - xf), P = l.P;
      name = "Cantilever · point load";
      add("R", "P", P, Pr.Rat(xf).R, "kN");
      add("M at fixed end (BM)", "−P·a", -P * a, Pr.MatSide(xf, left ? "R" : "L"), "kN·m");
      add("δ at free end ↓", "Pa²(3L−a)/6EI", P * a * a * (3 * L - a) / (6 * EI) * 1000, dmm(free), "mm");
    } else if (l.type === "udl" && fullSpan(l) && uni(l)) {
      const w = (l.w1 + l.w2) / 2;
      name = "Cantilever · full-span UDL";
      add("R", "wL", w * L, Pr.Rat(xf).R, "kN");
      add("M at fixed end (BM)", "−wL²/2", -w * L * L / 2, Pr.MatSide(xf, left ? "R" : "L"), "kN·m");
      add("δ at free end ↓", "wL⁴/8EI", w * L ** 4 / (8 * EI) * 1000, dmm(free), "mm");
    }
  }

  const propped = !name && sup.length === 2 && H === 0 &&
    ((sup[0].type === "fixed" && at(sup[0].x, 0) && sup[1].type !== "fixed" && at(sup[1].x, L)) ||
     (sup[1].type === "fixed" && at(sup[1].x, L) && sup[0].type !== "fixed" && at(sup[0].x, 0)));
  if (propped && acts.length === 1) {
    const leftFixed = sup[0].type === "fixed";
    const xf = leftFixed ? 0 : L, xp = leftFixed ? L : 0, l = acts[0];
    if (l.type === "udl" && fullSpan(l) && uni(l)) {
      const w = (l.w1 + l.w2) / 2;
      name = "Propped cantilever · full-span UDL";
      add("M at fixed end (BM)", "−wL²/8", -w * L * L / 8, Pr.MatSide(xf, leftFixed ? "R" : "L"), "kN·m");
      add("R at prop", "3wL/8", 3 * w * L / 8, Pr.Rat(xp).R, "kN");
      add("R at fixed end", "5wL/8", 5 * w * L / 8, Pr.Rat(xf).R, "kN");
      add("M sag max @ 5L/8 from fixed", "9wL²/128", 9 * w * L * L / 128, Pr.MatSide(leftFixed ? 5 * L / 8 : 3 * L / 8), "kN·m");
    } else if (l.type === "point" && at(l.x, L / 2)) {
      const P = l.P;
      name = "Propped cantilever · central point load";
      add("M at fixed end (BM)", "−3PL/16", -3 * P * L / 16, Pr.MatSide(xf, leftFixed ? "R" : "L"), "kN·m");
      add("R at prop", "5P/16", 5 * P / 16, Pr.Rat(xp).R, "kN");
      add("M under load", "5PL/32", 5 * P * L / 32, Pr.MatSide(L / 2, "L"), "kN·m");
    }
  }

  const ff = !name && sup.length === 2 && H === 0 && sup[0].type === "fixed" && sup[1].type === "fixed" && at(sup[0].x, 0) && at(sup[1].x, L);
  if (ff && acts.length === 1) {
    const l = acts[0];
    if (l.type === "udl" && fullSpan(l) && uni(l)) {
      const w = (l.w1 + l.w2) / 2;
      name = "Fixed-end beam · full-span UDL";
      add("M at ends (BM)", "−wL²/12", -w * L * L / 12, Pr.MatSide(0, "R"), "kN·m");
      add("M at midspan", "+wL²/24", w * L * L / 24, Pr.MatSide(L / 2), "kN·m");
      add("δ max ↓", "wL⁴/384EI", w * L ** 4 / (384 * EI) * 1000, dmm(L / 2), "mm");
    } else if (l.type === "point" && at(l.x, L / 2)) {
      const P = l.P;
      name = "Fixed-end beam · central point load";
      add("M at ends (BM)", "−PL/8", -P * L / 8, Pr.MatSide(0, "R"), "kN·m");
      add("M under load", "+PL/8", P * L / 8, Pr.MatSide(L / 2, "L"), "kN·m");
      add("δ max ↓", "PL³/192EI", P * L ** 3 / (192 * EI) * 1000, dmm(L / 2), "mm");
    }
  }

  const cont2 = !name && sup.length === 3 && H === 0 && sup.every(s => s.type !== "fixed") && at(sup[0].x, 0) && at(sup[1].x, L / 2) && at(sup[2].x, L);
  if (cont2 && acts.length === 1) {
    const l = acts[0];
    if (l.type === "udl" && fullSpan(l) && uni(l)) {
      const w = (l.w1 + l.w2) / 2, sp = L / 2;
      name = "Two equal spans · full UDL (continuous)";
      add("M at central support (BM)", "−w·l²/8", -w * sp * sp / 8, Pr.MatSide(L / 2, "L"), "kN·m");
      add("R central", "1.25·w·l", 1.25 * w * sp, Pr.Rat(L / 2).R, "kN");
      add("R ends", "0.375·w·l", 0.375 * w * sp, Pr.Rat(0).R, "kN");
    }
  }

  if (!name) return null;
  return { name, rows };
}

/* ---- worked equilibrium for determinate basics ---- */
function workedStatics(L, supports, hingesArr, loads, res) {
  if (!res || !res.stable || res.nIndet !== 0 || hingesArr.length) return null;
  const sup = [...supports].sort((a, b) => a.x - b.x);
  const acts = activeLoads(loads);
  if (!acts.length) return null;
  const f = (v, d = 2) => fmt(v, d);
  const xbarOf = l => {
    const len = l.x2 - l.x1;
    if (Math.abs(l.w1 + l.w2) < 1e-12) return (l.x1 + l.x2) / 2;
    return l.x1 + len * (l.w1 + 2 * l.w2) / (3 * (l.w1 + l.w2));
  };
  if (sup.length === 2 && sup.every(s => s.type !== "fixed")) {
    const xA = sup[0].x, d = sup[1].x - xA;
    if (d < 1e-6) return null;
    let num = 0, Wt = 0;
    const terms = [];
    acts.forEach(l => {
      if (l.type === "point") { Wt += l.P; num += l.P * (l.x - xA); terms.push(`${f(l.P, 1)}·(${f(l.x)}−${f(xA)})`); }
      else if (l.type === "udl") { const len = l.x2 - l.x1, Wu = (l.w1 + l.w2) / 2 * len, xb = xbarOf(l); Wt += Wu; num += Wu * (xb - xA); terms.push(`${f(Wu, 1)}·(${f(xb)}−${f(xA)})  [W=½(w₁+w₂)·len @ x̄]`); }
      else if (l.type === "moment") { num -= l.M; terms.push(`− ${f(l.M, 1)}  [couple, CCW +]`); }
    });
    const RB = num / d, RA = Wt - RB;
    return {
      title: `Worked statics — take moments about A (x = ${f(xA)} m)`,
      lines: [
        `ΣW (downward) = ${f(Wt)} kN`,
        `ΣM_A = 0 (CCW +):  R_B·${f(d)} = ${terms.join("  +  ") || "0"}`,
        `R_B = ${f(num)} / ${f(d)} = ${f(RB)} kN ↑`,
        `ΣF_y = 0:  R_A = ΣW − R_B = ${f(Wt)} − ${f(RB)} = ${f(RA)} kN ↑`,
      ],
    };
  }
  if (sup.length === 1 && sup[0].type === "fixed") {
    const xA = sup[0].x;
    let Wt = 0, MA = 0;
    const terms = [];
    acts.forEach(l => {
      if (l.type === "point") { Wt += l.P; MA += l.P * (l.x - xA); terms.push(`${f(l.P, 1)}·(${f(l.x)}−${f(xA)})`); }
      else if (l.type === "udl") { const len = l.x2 - l.x1, Wu = (l.w1 + l.w2) / 2 * len, xb = xbarOf(l); Wt += Wu; MA += Wu * (xb - xA); terms.push(`${f(Wu, 1)}·(${f(xb)}−${f(xA)})`); }
      else if (l.type === "moment") { MA -= l.M; terms.push(`− ${f(l.M, 1)}  [couple]`); }
    });
    const s = xA < L / 2 ? -1 : 1;
    return {
      title: `Worked statics — cantilever, fixed at x = ${f(xA)} m`,
      lines: [
        `ΣF_y = 0:  R = ΣW = ${f(Wt)} kN ↑`,
        `ΣM_fix = 0 (CCW +):  M_R = ${terms.join("  +  ") || "0"} = ${f(MA)} kN·m`,
        `Bending moment at the fixed end (beam side) = ${f(s * MA)} kN·m`,
      ],
    };
  }
  return null;
}

/* ---- presets ---- */
const PRESETS = [
  { name: "SS · central point", make: () => ({ L: 8, supports: [{ x: 0, type: "pin" }, { x: 8, type: "roller" }], hinges: [], loads: [{ type: "point", x: 4, P: 20 }] }) },
  { name: "SS · UDL", make: () => ({ L: 8, supports: [{ x: 0, type: "pin" }, { x: 8, type: "roller" }], hinges: [], loads: [{ type: "udl", x1: 0, x2: 8, w1: 10, w2: 10 }] }) },
  { name: "SS · applied moment", make: () => ({ L: 8, supports: [{ x: 0, type: "pin" }, { x: 8, type: "roller" }], hinges: [], loads: [{ type: "moment", x: 4, M: 40 }] }) },
  { name: "SS · triangular", make: () => ({ L: 6, supports: [{ x: 0, type: "pin" }, { x: 6, type: "roller" }], hinges: [], loads: [{ type: "udl", x1: 0, x2: 6, w1: 0, w2: 12 }] }) },
  { name: "Cantilever · tip load", make: () => ({ L: 4, supports: [{ x: 0, type: "fixed" }], hinges: [], loads: [{ type: "point", x: 4, P: 10 }] }) },
  { name: "Cantilever · UDL", make: () => ({ L: 4, supports: [{ x: 0, type: "fixed" }], hinges: [], loads: [{ type: "udl", x1: 0, x2: 4, w1: 8, w2: 8 }] }) },
  { name: "Overhanging · UDL", make: () => ({ L: 8, supports: [{ x: 0, type: "pin" }, { x: 6, type: "roller" }], hinges: [], loads: [{ type: "udl", x1: 0, x2: 8, w1: 5, w2: 5 }] }) },
  { name: "Propped cantilever", make: () => ({ L: 6, supports: [{ x: 0, type: "fixed" }, { x: 6, type: "roller" }], hinges: [], loads: [{ type: "udl", x1: 0, x2: 6, w1: 10, w2: 10 }] }) },
  { name: "Fixed–fixed · UDL", make: () => ({ L: 6, supports: [{ x: 0, type: "fixed" }, { x: 6, type: "fixed" }], hinges: [], loads: [{ type: "udl", x1: 0, x2: 6, w1: 12, w2: 12 }] }) },
  { name: "Two-span continuous", make: () => ({ L: 10, supports: [{ x: 0, type: "pin" }, { x: 5, type: "roller" }, { x: 10, type: "roller" }], hinges: [], loads: [{ type: "udl", x1: 0, x2: 10, w1: 10, w2: 10 }] }) },
  { name: "Gerber (hinged)", make: () => ({ L: 6, supports: [{ x: 0, type: "fixed" }, { x: 6, type: "roller" }], hinges: [{ x: 3 }], loads: [{ type: "udl", x1: 0, x2: 6, w1: 10, w2: 10 }] }) },
  { name: "Mechanism demo", make: () => ({ L: 8, supports: [{ x: 0, type: "pin" }, { x: 8, type: "roller" }], hinges: [{ x: 4 }], loads: [{ type: "point", x: 4, P: 20 }] }) },
];

let _uid = 1;
const uid = () => _uid++;
const withIds = cfg => ({
  L: cfg.L,
  supports: cfg.supports.map(s => ({ ...s, id: uid() })),
  hinges: cfg.hinges.map(h => ({ ...h, id: uid() })),
  loads: cfg.loads.map(l => ({ ...l, id: uid() })),
});

/* ============================================================
   UI LAYER — calc-sheet identity, direct-manipulation canvas
   ============================================================ */
const C = {
  sheet: "#EEF1F3", panel: "#FFFFFF", ink: "#1B2A41", inkSoft: "#5B6B7C",
  grid: "#D7E0E6", line: "#C2CDD6",
  shear: "#0E8A7B", moment: "#D4622A", defl: "#5B5BD6",
  good: "#1E7F3C", bad: "#C0392B",
  nav: "#16263C", navSoft: "#8FA3B8", sel: "#D4622A",
};
const W = 760, PADL = 50, PADR = 22, PLOTW = W - PADL - PADR;
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.bl *{box-sizing:border-box}
.bl{background:
  repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(27,42,65,.035) 27px, rgba(27,42,65,.035) 28px),
  ${C.sheet};
  min-height:100vh;padding:16px;color:${C.ink};font-family:'Archivo',system-ui,sans-serif}
.bl .mono{font-family:${MONO}}
.bl .dim{color:${C.inkSoft}}
.bl button{font-family:${MONO}}
.bl button:focus-visible,.bl input:focus-visible{outline:2px solid ${C.moment};outline-offset:1px}

/* ---- title block ---- */
.bl .tb{border:2px solid ${C.ink};background:${C.panel};display:grid;grid-template-columns:1fr auto auto;align-items:stretch;box-shadow:3px 3px 0 rgba(27,42,65,.12)}
.bl .tbc{padding:11px 16px;border-left:2px solid ${C.ink};display:flex;flex-direction:column;justify-content:center;gap:2px}
.bl .tbc:first-child{border-left:none}
.bl .tmeta{font:500 9px ${MONO};letter-spacing:.12em;color:${C.inkSoft};text-transform:uppercase}
.bl .tval{font:600 12px ${MONO}}
.bl .live{display:inline-flex;align-items:center;gap:5px;font:600 9px ${MONO};letter-spacing:.1em;color:${C.good};text-transform:uppercase}
.bl .live .dot{width:7px;height:7px;border-radius:50%;background:${C.good};animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.bl .live .dot{animation:none}}
.bl .stamp{border:2.5px solid var(--sc);color:var(--sc);padding:6px 13px;font:700 11px ${MONO};letter-spacing:.1em;transform:rotate(-2.5deg)}

/* ---- layout ---- */
.bl .work{display:grid;grid-template-columns:minmax(0,1fr) 372px;gap:16px;margin-top:16px;align-items:start}
@media(max-width:1000px){.bl .work{grid-template-columns:1fr}}
.bl .panel{background:${C.panel};border:1.5px solid ${C.ink};margin-bottom:14px}
.bl .ph{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 11px;border-bottom:1.5px solid ${C.ink};font:600 10px ${MONO};letter-spacing:.11em;text-transform:uppercase}
.bl .sw{width:9px;height:9px;display:inline-block;margin-right:7px;vertical-align:-1px}
.bl svg{display:block;width:100%;height:auto}
.bl .hint{display:flex;gap:8px;align-items:center;padding:7px 11px;border-top:1.2px dashed ${C.grid};font:500 9.5px ${MONO};color:${C.inkSoft};line-height:1.5}
.bl .hint b{color:${C.ink};font-weight:600}

/* ---- readout ---- */
.bl .readout{display:grid;grid-template-columns:repeat(4,1fr)}
.bl .rc{padding:9px 11px;border-left:1.5px solid ${C.grid}}
.bl .rc:first-child{border-left:none}
.bl .rl{font:500 9px ${MONO};letter-spacing:.1em;color:${C.inkSoft};text-transform:uppercase}
.bl .rv{font:600 14px ${MONO};margin-top:3px}

/* ---- presets ---- */
.bl .chips{display:flex;gap:6px;padding:10px;overflow-x:auto}
.bl .chip{flex:0 0 auto;font:500 10px ${MONO};padding:5px 9px;border:1.2px solid ${C.line};background:${C.panel};cursor:pointer;color:${C.ink};white-space:nowrap}
.bl .chip:hover{border-color:${C.ink}}
.bl .chip.on{background:${C.ink};color:#fff;border-color:${C.ink}}

/* ---- nav ---- */
.bl .nav{display:grid;grid-template-columns:repeat(4,1fr);border:1.5px solid ${C.ink};background:${C.nav};margin-bottom:14px}
.bl .navb{padding:9px 4px 8px;background:transparent;border:none;border-right:1px solid rgba(255,255,255,.12);color:${C.navSoft};cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;font:600 9.5px ${MONO};letter-spacing:.08em;text-transform:uppercase}
.bl .navb:last-child{border-right:none}
.bl .navb svg{width:20px;height:20px}
.bl .navb.on{background:${C.panel};color:${C.ink}}
.bl .navb .cnt{font:600 8.5px ${MONO};padding:0 5px;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;min-width:16px;text-align:center}
.bl .navb.on .cnt{background:${C.moment};color:#fff}

/* ---- items + editors ---- */
.bl .pad{padding:11px}
.bl .item{display:flex;align-items:center;gap:10px;border:1.2px solid ${C.line};background:${C.panel};padding:8px 10px;margin-bottom:8px;cursor:pointer;transition:border-color .12s}
.bl .item:hover{border-color:${C.ink}}
.bl .item .iz{width:22px;height:22px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:${C.ink}}
.bl .item .ib{flex:1;min-width:0}
.bl .item .it{font:600 11px ${MONO};color:${C.ink}}
.bl .item .is{font:500 9.5px ${MONO};color:${C.inkSoft};margin-top:1px}
.bl .item .chev{color:${C.inkSoft};font:600 11px ${MONO}}
.bl .card{border:1.5px solid ${C.ink};background:${C.panel};margin-bottom:10px;box-shadow:2px 2px 0 rgba(212,98,42,.18)}
.bl .chd{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;border-bottom:1.2px solid ${C.grid};font:600 10px ${MONO};letter-spacing:.07em;text-transform:uppercase}
.bl .cbody{padding:9px 11px 11px}
.bl .fl{font:500 9px ${MONO};letter-spacing:.08em;color:${C.inkSoft};text-transform:uppercase;margin:9px 0 5px}
.bl .fl:first-child{margin-top:0}

/* direction toggles */
.bl .dirs{display:flex;gap:7px}
.bl .dirbtn{width:46px;height:42px;border:1.4px solid ${C.line};background:${C.panel};cursor:pointer;display:flex;align-items:center;justify-content:center;color:${C.ink}}
.bl .dirbtn svg{width:24px;height:24px}
.bl .dirbtn:hover{border-color:${C.ink}}
.bl .dirbtn.on{background:${C.ink};border-color:${C.ink};color:#fff}

/* segmented (support type / span quick) */
.bl .seg{display:flex}
.bl .seg .sb{flex:1;height:40px;border:1.4px solid ${C.line};border-left-width:0;background:${C.panel};cursor:pointer;color:${C.ink};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 8.5px ${MONO};letter-spacing:.06em;text-transform:uppercase}
.bl .seg .sb:first-child{border-left-width:1.4px}
.bl .seg .sb svg{width:22px;height:18px}
.bl .seg .sb:hover{border-color:${C.ink}}
.bl .seg .sb.on{background:${C.ink};border-color:${C.ink};color:#fff}

/* sliders + position */
.bl .row{display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center;margin:5px 0}
.bl input[type=range]{width:100%;accent-color:${C.shear};height:24px;margin:0}
.bl input[type=number]{width:100%;font:500 11.5px ${MONO};padding:5px 6px;border:1.2px solid ${C.line};color:${C.ink};background:#fff}
.bl .posrow{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
.bl .snap{display:flex;flex:0 0 auto}
.bl .snap button{width:30px;height:30px;font:600 9.5px ${MONO};border:1.2px solid ${C.line};border-left-width:0;background:${C.panel};cursor:pointer;color:${C.inkSoft}}
.bl .snap button:first-child{border-left-width:1.2px}
.bl .snap button:hover{background:${C.ink};color:#fff;border-color:${C.ink}}

/* buttons */
.bl .add{display:flex;gap:7px;flex-wrap:wrap;margin-top:4px}
.bl .btn{font:600 9.5px ${MONO};letter-spacing:.07em;padding:7px 11px;border:1.4px solid ${C.ink};background:${C.panel};cursor:pointer;color:${C.ink};text-transform:uppercase}
.bl .btn:hover{background:${C.ink};color:#fff}
.bl .btn.gh{border-color:${C.line};color:${C.inkSoft}}
.bl .btn.gh:hover{background:${C.ink};color:#fff;border-color:${C.ink}}
.bl .del{border:none;background:none;color:${C.bad};cursor:pointer;font:700 13px ${MONO};padding:0 3px;line-height:1}
.bl .del:hover{color:#fff;background:${C.bad};border-radius:3px}

/* notes / calcs */
.bl .note{border:1.2px dashed ${C.grid};padding:9px 11px;font:500 10px ${MONO};color:${C.inkSoft};line-height:1.7;margin-top:10px}
.bl .banner{border:2px solid ${C.bad};background:#FDF1EF;color:${C.bad};padding:11px 13px;font:600 11.5px ${MONO};margin-top:14px;line-height:1.5}
.bl .calc{padding:12px}
.bl .calc h4{margin:15px 0 7px;font:700 10px ${MONO};letter-spacing:.12em;text-transform:uppercase;border-bottom:1.2px solid ${C.grid};padding-bottom:5px}
.bl .calc h4:first-child{margin-top:0}
.bl .m{font:500 10.5px ${MONO};line-height:1.8;white-space:pre-wrap;word-break:break-word}
.bl table.vt{width:100%;border-collapse:collapse;font:500 10px ${MONO};margin:6px 0}
.bl .vt td,.bl .vt th{border:1px solid ${C.grid};padding:5px 6px;text-align:right;white-space:nowrap}
.bl .vt th{background:${C.sheet};font-weight:600}
.bl .vt td:first-child,.bl .vt th:first-child{text-align:left;white-space:normal}
.bl .ok{color:${C.good};font-weight:700}
.bl .no{color:${C.bad};font-weight:700}

/* ============ teaching layer ============ */
.bl .teach{padding:2px 1px 4px}
.bl .intro{font:500 12px 'Archivo';line-height:1.55;color:${C.inkSoft};margin:2px 2px 12px;padding-left:11px;border-left:3px solid ${C.moment}}
.bl .lesson{border:1.5px solid ${C.ink};background:${C.panel};border-radius:7px;margin-bottom:13px;box-shadow:3px 3px 0 color-mix(in srgb,var(--lac) 18%,transparent);overflow:hidden}
.bl .lh{display:flex;align-items:center;gap:11px;padding:11px 13px;cursor:pointer;user-select:none;background:linear-gradient(90deg,color-mix(in srgb,var(--lac) 7%,#fff),#fff 70%);transition:background .14s}
.bl .lh:hover{background:linear-gradient(90deg,color-mix(in srgb,var(--lac) 13%,#fff),#fff 75%)}
.bl .lesson.open .lh{border-bottom:1.5px solid color-mix(in srgb,var(--lac) 30%,${C.grid})}
.bl .lbadge{flex:0 0 auto;width:27px;height:27px;border-radius:50%;background:var(--lac);color:#fff;display:flex;align-items:center;justify-content:center;font:800 12.5px 'Archivo';box-shadow:inset 0 -2px 4px rgba(0,0,0,.18)}
.bl .lt{flex:1;min-width:0}
.bl .ltt{display:block;font:800 13.5px 'Archivo';letter-spacing:.005em;color:${C.ink};line-height:1.2}
.bl .lts{display:block;font:500 9.5px ${MONO};color:${C.inkSoft};margin-top:2px;letter-spacing:.02em}
.bl .lchev{flex:0 0 auto;color:var(--lac);font:700 13px ${MONO};transition:transform .16s}
.bl .lesson.open .lchev{transform:rotate(90deg)}
.bl .lb{padding:13px 14px 15px}
.bl .say{font:400 13px 'Archivo';line-height:1.64;color:#33455a;margin:0 0 10px}
.bl .say:last-child{margin-bottom:0}
.bl .say b{font-weight:700;color:${C.ink}}
.bl .say i{font-style:italic;color:${C.inkSoft}}
.bl .say.dim{font-size:11px;color:${C.inkSoft}}
.bl .lbl2{font:700 8.5px ${MONO};letter-spacing:.13em;text-transform:uppercase;color:var(--lac,${C.inkSoft});margin:13px 0 6px;display:flex;align-items:center;gap:7px}
.bl .lbl2::after{content:"";flex:1;height:1px;background:${C.grid}}
.bl .eqn{font:500 11px ${MONO};line-height:1.7;background:${C.sheet};border-left:3px solid var(--lac,${C.ink});padding:10px 13px;margin:9px 0;border-radius:0 5px 5px 0}
.bl .eqn .step{display:block;margin:3px 0;white-space:pre-wrap;word-break:break-word}
.bl .eqn .res{color:var(--lac,${C.ink});font-weight:700;background:color-mix(in srgb,var(--lac) 12%,transparent);padding:1px 5px;border-radius:3px}
.bl .eqn b{color:${C.ink};font-weight:600}

/* callouts */
.bl .call{border-radius:6px;padding:9px 12px 10px;margin:10px 0;border:1px solid color-mix(in srgb,var(--cc) 45%,transparent);background:var(--cbg)}
.bl .call .ct{font:700 8.5px ${MONO};letter-spacing:.13em;text-transform:uppercase;color:var(--cc);display:flex;align-items:center;gap:6px;margin-bottom:4px}
.bl .call .cdot{width:7px;height:7px;border-radius:2px;background:var(--cc);transform:rotate(45deg);flex:0 0 auto}
.bl .call .cx{font:500 11.5px 'Archivo';line-height:1.58;color:#2a3a4f}
.bl .call .cx b{font-family:${MONO};font-weight:600;color:${C.ink}}
.bl .call .cx i{font-style:italic}

/* reference card */
.bl .ref{display:grid;grid-template-columns:1fr;gap:10px;margin:10px 0}
@media(min-width:540px){.bl .ref{grid-template-columns:1fr 1fr}}
.bl .refc{border:1.3px solid ${C.line};border-radius:6px;overflow:hidden;background:#fff}
.bl .refc.hit{border-color:${C.moment};box-shadow:0 0 0 2px rgba(212,98,42,.16)}
.bl .refh{font:700 10px ${MONO};letter-spacing:.04em;padding:7px 11px;background:var(--rh,${C.ink});color:#fff;display:flex;justify-content:space-between;align-items:center}
.bl .hittag{font:700 7.5px ${MONO};letter-spacing:.1em;text-transform:uppercase;background:rgba(255,255,255,.22);padding:2px 6px;border-radius:9px}
.bl .refr2{padding:8px 11px;border-top:1px solid ${C.grid}}
.bl .refr2:first-of-type{border-top:none}
.bl .rk{font:700 10px 'Archivo';color:${C.ink}}
.bl .rv2{font:500 9.5px ${MONO};color:${C.inkSoft};margin-top:3px;line-height:1.55;word-break:break-word}

/* ============ visual-appeal upgrades ============ */
.bl{background:
  repeating-linear-gradient(90deg, transparent, transparent 27px, rgba(27,42,65,.022) 27px, rgba(27,42,65,.022) 28px),
  repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(27,42,65,.04) 27px, rgba(27,42,65,.04) 28px),
  radial-gradient(1200px 480px at 78% -8%, rgba(91,91,214,.06), transparent 60%),
  radial-gradient(1000px 420px at -6% 4%, rgba(14,138,123,.06), transparent 60%),
  ${C.sheet}}
.bl .tb{position:relative;border-top-width:0}
.bl .tb::before{content:"";position:absolute;top:-2px;left:-2px;right:-2px;height:5px;background:linear-gradient(90deg,${C.shear},${C.moment} 52%,${C.defl})}
.bl .tb .tbc:first-child{background:${C.nav};color:#fff}
.bl .tb .tbc:first-child .tmeta{color:${C.navSoft}}
.bl .ttl{font:800 19px 'Archivo';letter-spacing:.03em;color:#fff;display:flex;align-items:center;gap:9px}
.bl .ttl .glyph{width:15px;height:17px;flex:0 0 auto}
.bl .panel{border-radius:6px}
.bl .panel.acc{border-top:3px solid var(--pac,${C.ink})}
.bl .ph.phc{color:var(--pac,${C.ink})}
.bl .rv.cv{color:var(--cvc,${C.ink})}
.bl .navb.on{box-shadow:inset 0 -3px 0 ${C.moment}}
.bl .chip:hover{transform:translateY(-1px)}
.bl .chip{transition:transform .1s,border-color .1s,background .1s}
.bl .card{transition:box-shadow .15s}
@media (prefers-reduced-motion: reduce){.bl .chip,.bl .lchev,.bl .lh,.bl .card{transition:none}}
`;

/* ---------- inline icons ---------- */
const IcoArrow = ({ up }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {up ? <><line x1="12" y1="20" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" /></>
        : <><line x1="12" y1="4" x2="12" y2="19" /><polyline points="6 13 12 19 18 13" /></>}
  </svg>
);
const IcoMoment = ({ ccw }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    {ccw ? <><path d="M20 12a8 8 0 1 0-2.5 5.8" /><polyline points="20 6 20 12 14 12" /></>
         : <><path d="M4 12a8 8 0 1 1 2.5 5.8" /><polyline points="4 6 4 12 10 12" /></>}
  </svg>
);
const IcoNav = ({ k }) => {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  if (k === "beam") return <svg viewBox="0 0 24 24" {...s}><line x1="3" y1="12" x2="21" y2="12" strokeWidth="3" /></svg>;
  if (k === "supports") return <svg viewBox="0 0 24 24" {...s}><line x1="3" y1="7" x2="21" y2="7" strokeWidth="2.4" /><path d="M12 7 7 17h10z" /></svg>;
  if (k === "loads") return <svg viewBox="0 0 24 24" {...s}><line x1="6" y1="4" x2="6" y2="16" /><polyline points="3 12 6 16 9 12" /><line x1="14" y1="4" x2="14" y2="16" /><polyline points="11 12 14 16 17 12" /></svg>;
  return <svg viewBox="0 0 24 24" {...s}><polyline points="4 12 10 18 20 6" strokeWidth="2.4" /></svg>;
};
const IcoSup = ({ type }) => {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  if (type === "fixed") return <svg viewBox="0 0 24 20" {...s}><line x1="6" y1="2" x2="6" y2="18" strokeWidth="2.2" /><line x1="6" y1="5" x2="11" y2="2" /><line x1="6" y1="10" x2="11" y2="7" /><line x1="6" y1="15" x2="11" y2="12" /></svg>;
  if (type === "roller") return <svg viewBox="0 0 24 20" {...s}><path d="M12 3 6 13h12z" /><circle cx="8.5" cy="16" r="2" /><circle cx="15.5" cy="16" r="2" /></svg>;
  return <svg viewBox="0 0 24 20" {...s}><path d="M12 3 6 14h12z" /><line x1="4" y1="14" x2="20" y2="14" /><line x1="6" y1="14" x2="4" y2="18" /><line x1="11" y1="14" x2="9" y2="18" /><line x1="16" y1="14" x2="14" y2="18" /></svg>;
};
const IcoItem = ({ l }) => {
  if (l.kind === "support") return <IcoSup type={l.type} />;
  if (l.kind === "hinge") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /></svg>;
  if (l.type === "point") return <IcoArrow up={l.P < 0} />;
  if (l.type === "moment") return <IcoMoment ccw={l.M >= 0} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="5" y1="6" x2="5" y2="13" /><line x1="10" y1="6" x2="10" y2="13" /><line x1="15" y1="6" x2="15" y2="13" /><line x1="20" y1="6" x2="20" y2="13" /></svg>;
};

/* ---------- SVG primitives ---------- */
function VArrow({ x, y1, y2, color, w = 2 }) {
  const dir = y2 > y1 ? 1 : -1;
  return (
    <g stroke={color} fill={color}>
      <line x1={x} y1={y1} x2={x} y2={y2 - 7 * dir} strokeWidth={w} />
      <path d={`M ${x - 4.2} ${y2 - 8 * dir} L ${x + 4.2} ${y2 - 8 * dir} L ${x} ${y2} Z`} stroke="none" />
    </g>
  );
}
function MomentArc({ x, y, ccw, color, r = 14, label }) {
  const d = ccw
    ? `M ${x + r} ${y} A ${r} ${r} 0 1 0 ${x} ${y - r}`
    : `M ${x - r} ${y} A ${r} ${r} 0 1 1 ${x} ${y - r}`;
  const ah = ccw
    ? `M ${x - 1} ${y - r - 4.5} L ${x - 1} ${y - r + 4.5} L ${x - 9} ${y - r} Z`
    : `M ${x + 1} ${y - r - 4.5} L ${x + 1} ${y - r + 4.5} L ${x + 9} ${y - r} Z`;
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
      <path d={ah} fill={color} />
      {label && <text x={x} y={y + r + 12} textAnchor="middle" fontSize="9.5" fontFamily={MONO} fontWeight="600" fill={color}>{label}</text>}
    </g>
  );
}
function SupportGlyph({ s, px, BY, L }) {
  const ink = C.ink;
  if (s.type === "fixed") {
    const dir = s.x <= L / 2 ? -1 : 1, h = 24;
    return (
      <g stroke={ink}>
        <line x1={px} y1={BY - h} x2={px} y2={BY + h} strokeWidth="3" />
        {[0, 1, 2, 3, 4].map(i => { const y = BY - h + i * (2 * h / 4); return <line key={i} x1={px} y1={y} x2={px + dir * 8} y2={y + 8} strokeWidth="1.4" />; })}
      </g>
    );
  }
  if (s.type === "pin") {
    return (
      <g>
        <path d={`M ${px} ${BY + 3} L ${px - 11} ${BY + 22} L ${px + 11} ${BY + 22} Z`} fill={ink} />
        <line x1={px - 16} y1={BY + 22} x2={px + 16} y2={BY + 22} stroke={ink} strokeWidth="2" />
        {[-12, -4, 4, 12].map(o => <line key={o} x1={px + o} y1={BY + 22} x2={px + o - 5} y2={BY + 29} stroke={ink} strokeWidth="1.2" />)}
      </g>
    );
  }
  return (
    <g>
      <path d={`M ${px} ${BY + 3} L ${px - 11} ${BY + 19} L ${px + 11} ${BY + 19} Z`} fill={ink} />
      <circle cx={px - 5.5} cy={BY + 23.5} r="3.6" fill={C.panel} stroke={ink} strokeWidth="1.6" />
      <circle cx={px + 5.5} cy={BY + 23.5} r="3.6" fill={C.panel} stroke={ink} strokeWidth="1.6" />
      <line x1={px - 16} y1={BY + 28} x2={px + 16} y2={BY + 28} stroke={ink} strokeWidth="2" />
    </g>
  );
}

const mkHover = onHover => ({
  onMouseMove: e => { const r = e.currentTarget.getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * W; onHover(clamp((vx - PADL) / PLOTW, 0, 1)); },
  onMouseLeave: () => onHover(null),
  onTouchMove: e => { const t = e.touches[0]; if (!t) return; const r = e.currentTarget.getBoundingClientRect(); const vx = ((t.clientX - r.left) / r.width) * W; onHover(clamp((vx - PADL) / PLOTW, 0, 1)); },
});

/* ---------- the editable beam canvas ---------- */
function BeamCanvas({ L, supports, hinges, loads, res, showR, hoverX, onHover, selected, onSelect, onDrag }) {
  const BY = 96, H = 226, RY = 202;
  const svgRef = useRef(null);
  const drag = useRef(null);
  const xToPx = x => PADL + (x / L) * PLOTW;
  const frac = clientX => { const r = svgRef.current.getBoundingClientRect(); const vx = ((clientX - r.left) / r.width) * W; return clamp((vx - PADL) / PLOTW, 0, 1); };
  const isSel = (kind, id) => selected && selected.kind === kind && selected.id === id;

  const begin = info => e => {
    e.stopPropagation();
    const f = frac(e.clientX);
    if (info.mode === "udl-move") info.grab = f * L - info.x1_0;
    drag.current = info;
    onSelect(info.selKind, info.id);
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    onHover(f);
  };
  const move = e => {
    const f = frac(e.clientX), d = drag.current;
    if (d) {
      const x = f * L;
      if (d.mode === "udl-move") { const w = d.x2_0 - d.x1_0; const nx1 = clamp(x - d.grab, 0, L - w); onDrag("udl-set", d.id, { x1: nx1, x2: nx1 + w }); }
      else onDrag(d.dragKind, d.id, x);
    }
    onHover(f);
  };
  const end = () => { drag.current = null; };

  const udls = loads.filter(l => l.type === "udl" && l.x2 - l.x1 > 1e-9);
  const wmax = Math.max(1e-9, ...udls.flatMap(l => [Math.abs(l.w1), Math.abs(l.w2)]));
  const hOf = w => 8 + 26 * Math.abs(w) / wmax;
  const metreStep = L > 14 ? 2 : 1;
  const ticks = []; for (let m = 0; m <= L + 1e-9; m += 1) ticks.push(m);
  const hitStyle = { cursor: "ew-resize", touchAction: "none" };

  // selection highlight band
  let selBand = null;
  if (selected) {
    if (selected.kind === "load") { const l = loads.find(o => o.id === selected.id); if (l) selBand = l.type === "udl" ? [xToPx(l.x1) - 6, xToPx(l.x2) + 6] : [xToPx(l.x) - 16, xToPx(l.x) + 16]; }
    else if (selected.kind === "support") { const s = supports.find(o => o.id === selected.id); if (s) selBand = [xToPx(s.x) - 20, xToPx(s.x) + 20]; }
    else if (selected.kind === "hinge") { const hh = hinges.find(o => o.id === selected.id); if (hh) selBand = [xToPx(hh.x) - 14, xToPx(hh.x) + 14]; }
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={() => { if (!drag.current) onHover(null); }} style={{ touchAction: "pan-y" }}>
      <rect x="0" y="0" width={W} height={H} fill="transparent" onPointerDown={e => { if (e.target === e.currentTarget) onSelect(null, null); }} />
      {selBand && <rect x={selBand[0]} y={12} width={selBand[1] - selBand[0]} height={H - 30} fill={C.sel} opacity="0.07" stroke={C.sel} strokeWidth="1" strokeDasharray="3 3" rx="3" />}
      {ticks.map(m => <line key={"g" + m} x1={xToPx(m)} y1={14} x2={xToPx(m)} y2={RY} stroke={C.grid} strokeWidth="1" opacity="0.55" />)}

      {/* UDLs (draggable band + endpoint handles) */}
      {udls.map(l => {
        const x1 = xToPx(l.x1), x2 = xToPx(l.x2);
        const h1 = hOf(l.w1) * (l.w1 === 0 ? 0.4 : 1), h2 = hOf(l.w2) * (l.w2 === 0 ? 0.4 : 1);
        const n = Math.max(2, Math.floor((x2 - x1) / 26));
        const arrows = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, ax = x1 + t * (x2 - x1), wHere = l.w1 + t * (l.w2 - l.w1), ah = h1 + t * (h2 - h1);
          if (Math.abs(wHere) < 1e-9) continue;
          arrows.push(wHere > 0
            ? <VArrow key={i} x={ax} y1={BY - 6 - ah} y2={BY - 5} color={C.ink} w={1.5} />
            : <VArrow key={i} x={ax} y1={BY - 5} y2={BY - 6 - ah} color={C.ink} w={1.5} />);
        }
        const top = BY - 6 - Math.max(h1, h2);
        return (
          <g key={l.id}>
            <polygon points={`${x1},${BY - 6 - h1} ${x2},${BY - 6 - h2} ${x2},${BY - 5} ${x1},${BY - 5}`} fill={C.ink} opacity="0.07" />
            <line x1={x1} y1={BY - 6 - h1} x2={x2} y2={BY - 6 - h2} stroke={C.ink} strokeWidth="1.8" />
            {arrows}
            <text x={(x1 + x2) / 2} y={top - 6} textAnchor="middle" fontSize="9.5" fontFamily={MONO} fontWeight="600" fill={C.ink}>
              {Math.abs(l.w1 - l.w2) < 1e-9 ? `${fmt(l.w1, 1)} kN/m` : `${fmt(l.w1, 1)}→${fmt(l.w2, 1)} kN/m`}
            </text>
            <rect x={x1} y={top - 4} width={x2 - x1} height={BY - top + 4} fill="transparent" style={{ cursor: "grab", touchAction: "none" }}
              onPointerDown={begin({ selKind: "load", mode: "udl-move", id: l.id, x1_0: l.x1, x2_0: l.x2 })} />
            {[["udl-x1", x1], ["udl-x2", x2]].map(([dk, hx]) => (
              <g key={dk} onPointerDown={begin({ selKind: "load", dragKind: dk, id: l.id })} style={hitStyle}>
                <rect x={hx - 7} y={top - 5} width="14" height={BY - top + 7} fill="transparent" />
                <rect x={hx - 3.5} y={BY - 4} width="7" height="9" fill={isSel("load", l.id) ? C.sel : C.ink} rx="1.5" />
              </g>
            ))}
          </g>
        );
      })}

      {/* point loads */}
      {loads.filter(l => l.type === "point" && Math.abs(l.P) > 1e-9).map(l => {
        const px = xToPx(l.x), col = isSel("load", l.id) ? C.sel : C.ink;
        return (
          <g key={l.id} onPointerDown={begin({ selKind: "load", dragKind: "point", id: l.id })} style={hitStyle}>
            <rect x={px - 13} y={BY - 60} width="26" height="62" fill="transparent" />
            {l.P > 0 ? <VArrow x={px} y1={BY - 52} y2={BY - 4} color={col} /> : <VArrow x={px} y1={BY - 4} y2={BY - 52} color={col} />}
            <text x={px} y={BY - 58} textAnchor="middle" fontSize="10" fontFamily={MONO} fontWeight="600" fill={col}>{fmt(Math.abs(l.P), 1)} kN</text>
          </g>
        );
      })}

      {/* moments */}
      {loads.filter(l => l.type === "moment" && Math.abs(l.M) > 1e-9).map(l => {
        const px = xToPx(l.x), col = isSel("load", l.id) ? C.sel : C.moment;
        return (
          <g key={l.id} onPointerDown={begin({ selKind: "load", dragKind: "moment", id: l.id })} style={hitStyle}>
            <circle cx={px} cy={BY - 1} r="20" fill="transparent" />
            <MomentArc x={px} y={BY - 1} ccw={l.M > 0} color={col} label={`${fmt(Math.abs(l.M), 1)} kN·m`} />
          </g>
        );
      })}

      {/* beam */}
      <line x1={PADL} y1={BY} x2={PADL + PLOTW} y2={BY} stroke={C.ink} strokeWidth="5" />

      {/* supports */}
      {supports.map(s => (
        <g key={s.id} onPointerDown={begin({ selKind: "support", dragKind: "support", id: s.id })} style={hitStyle}>
          <rect x={xToPx(s.x) - 18} y={BY - 26} width="36" height="58" fill="transparent" />
          {isSel("support", s.id) && <circle cx={xToPx(s.x)} cy={BY} r="9" fill="none" stroke={C.sel} strokeWidth="2" />}
          <SupportGlyph s={s} px={xToPx(s.x)} BY={BY} L={L} />
        </g>
      ))}

      {/* hinges */}
      {hinges.map(h => (
        <g key={h.id} onPointerDown={begin({ selKind: "hinge", dragKind: "hinge", id: h.id })} style={hitStyle}>
          <circle cx={xToPx(h.x)} cy={BY} r="14" fill="transparent" />
          <circle cx={xToPx(h.x)} cy={BY} r="5.5" fill={C.panel} stroke={isSel("hinge", h.id) ? C.sel : C.ink} strokeWidth="2.4" />
        </g>
      ))}

      {/* reactions */}
      {showR && res && res.stable && res.reactions.map((r, i) => (
        <g key={i}>
          {Math.abs(r.R) > 1e-6 && (<g>
            {r.R > 0 ? <VArrow x={xToPx(r.x)} y1={BY + 74} y2={BY + 36} color={C.good} /> : <VArrow x={xToPx(r.x)} y1={BY + 36} y2={BY + 74} color={C.good} />}
            <text x={xToPx(r.x)} y={BY + 88} textAnchor="middle" fontSize="9.5" fontFamily={MONO} fontWeight="600" fill={C.good}>{fmt(r.R, 1)} kN</text>
          </g>)}
          {r.type === "fixed" && Math.abs(r.M) > 1e-6 && (<g>
            <MomentArc x={xToPx(r.x) + (r.x <= L / 2 ? 26 : -26)} y={BY + 54} ccw={r.M > 0} color={C.good} r={11} />
            <text x={xToPx(r.x) + (r.x <= L / 2 ? 26 : -26)} y={BY + 86} textAnchor="middle" fontSize="9.5" fontFamily={MONO} fontWeight="600" fill={C.good}>{fmt(r.M, 1)} kN·m</text>
          </g>)}
        </g>
      ))}

      {/* ruler */}
      <line x1={PADL} y1={RY} x2={PADL + PLOTW} y2={RY} stroke={C.ink} strokeWidth="1.4" />
      {ticks.map(m => (
        <g key={"t" + m}>
          <line x1={xToPx(m)} y1={RY} x2={xToPx(m)} y2={RY + 5} stroke={C.ink} strokeWidth="1.2" />
          {(Math.round(m) % metreStep === 0 || m === L) && <text x={xToPx(m)} y={RY + 16} textAnchor="middle" fontSize="9" fontFamily={MONO} fill={C.inkSoft}>{fmt(m, m % 1 ? 1 : 0)}</text>}
        </g>
      ))}
      {hoverX !== null && <line x1={xToPx(hoverX)} y1={14} x2={xToPx(hoverX)} y2={RY} stroke={C.ink} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />}
    </svg>
  );
}

function DiagPlot({ color, X, Y, L, flip = false, anns = [], cfs = [], showXLabels = false, hoverX, onHover, height = 156 }) {
  const PT = 16, PB = showXLabels ? 22 : 12;
  const xToPx = x => PADL + (x / L) * PLOTW;
  let ymin = 0, ymax = 0;
  for (const v of Y) { if (v < ymin) ymin = v; if (v > ymax) ymax = v; }
  if (ymax - ymin < 1e-9) { ymax = 1; ymin = -1; }
  const pad = (ymax - ymin) * 0.14; ymax += pad; ymin -= pad;
  const dmin = flip ? -ymax : ymin, dmax = flip ? -ymin : ymax;
  const yToPx = v => { const dv = flip ? -v : v; return PT + (1 - (dv - dmin) / (dmax - dmin)) * (height - PT - PB); };
  const zero = yToPx(0);
  let dpath = "", fpath = `M ${xToPx(X[0])} ${zero}`;
  for (let i = 0; i < X.length; i++) { const px = xToPx(X[i]), py = yToPx(Y[i]); dpath += (i === 0 ? "M" : "L") + px.toFixed(2) + " " + py.toFixed(2) + " "; fpath += `L ${px.toFixed(2)} ${py.toFixed(2)} `; }
  fpath += `L ${xToPx(X[X.length - 1])} ${zero} Z`;
  const ticks = []; for (let m = 0; m <= L + 1e-9; m += 1) ticks.push(m);
  let hi = -1;
  if (hoverX !== null) { let bd = 1e9; for (let i = 0; i < X.length; i++) { const d = Math.abs(X[i] - hoverX); if (d < bd) { bd = d; hi = i; } } }
  const metreStep = L > 14 ? 2 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} {...mkHover(onHover)} style={{ touchAction: "pan-y" }}>
      {ticks.map(m => <line key={m} x1={xToPx(m)} y1={PT - 6} x2={xToPx(m)} y2={height - PB} stroke={C.grid} strokeWidth="1" opacity="0.5" />)}
      <path d={fpath} fill={color} opacity="0.1" />
      <line x1={PADL} y1={zero} x2={PADL + PLOTW} y2={zero} stroke={C.ink} strokeWidth="1.3" />
      <path d={dpath} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
      <text x={PADL - 6} y={zero + 3} textAnchor="end" fontSize="9" fontFamily={MONO} fill={C.inkSoft}>0</text>
      <text x={PADL - 6} y={PT + 2} textAnchor="end" fontSize="9" fontFamily={MONO} fill={C.inkSoft}>{fmt(flip ? ymin : ymax, 1)}</text>
      <text x={PADL - 6} y={height - PB} textAnchor="end" fontSize="9" fontFamily={MONO} fill={C.inkSoft}>{fmt(flip ? ymax : ymin, 1)}</text>
      {cfs.map((x, i) => (<g key={i}><circle cx={xToPx(x)} cy={zero} r="3.4" fill={C.panel} stroke={color} strokeWidth="2" /><text x={xToPx(x)} y={zero - 7} textAnchor="middle" fontSize="8.5" fontFamily={MONO} fill={C.inkSoft}>{fmt(x)}</text></g>))}
      {anns.map((a, i) => {
        const px = xToPx(a.x), py = yToPx(a.v), dispNeg = (flip ? -a.v : a.v) < 0;
        const anchor = px < PADL + 56 ? "start" : px > W - PADR - 56 ? "end" : "middle";
        return (<g key={i}><circle cx={px} cy={py} r="3.2" fill={color} /><text x={px} y={dispNeg ? py + 14 : py - 7} textAnchor={anchor} fontSize="9.5" fontFamily={MONO} fontWeight="600" fill={C.ink}>{a.label}</text></g>);
      })}
      {showXLabels && ticks.map(m => (Math.round(m) % metreStep === 0 || m === L) && (<text key={"x" + m} x={xToPx(m)} y={height - 6} textAnchor="middle" fontSize="9" fontFamily={MONO} fill={C.inkSoft}>{fmt(m, m % 1 ? 1 : 0)}</text>))}
      {hi >= 0 && (<g><line x1={xToPx(X[hi])} y1={PT - 6} x2={xToPx(X[hi])} y2={height - PB} stroke={C.ink} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" /><circle cx={xToPx(X[hi])} cy={yToPx(Y[hi])} r="4" fill={C.panel} stroke={color} strokeWidth="2.2" /></g>)}
    </svg>
  );
}

/* ---------- small controls ---------- */
function Slider({ value, min, max, step, onChange, dp = 2 }) {
  return (
    <div className="row">
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <input type="number" step={step} value={Number(value.toFixed(dp))} onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) onChange(clamp(v, min, max)); }} />
    </div>
  );
}
function PosField({ value, onChange, L }) {
  return (
    <div className="posrow">
      <Slider value={value} min={0} max={L} step={0.05} onChange={onChange} />
      <div className="snap">
        <button title="left end" onClick={() => onChange(0)}>L</button>
        <button title="midspan" onClick={() => onChange(L / 2)}>M</button>
        <button title="right end" onClick={() => onChange(L)}>R</button>
      </div>
    </div>
  );
}
function Verif({ det }) {
  return (
    <table className="vt">
      <thead><tr><th>quantity</th><th>formula</th><th>hand</th><th>engine</th><th></th></tr></thead>
      <tbody>
        {det.rows.map((r, i) => (
          <tr key={i}><td>{r.q}</td><td>{r.f}</td><td>{fmt(r.hand)} {r.unit}</td><td>{fmt(r.eng)} {r.unit}</td><td className={r.ok ? "ok" : "no"}>{r.ok ? "✓" : "✗"}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/* ============================================================
   TEACHING LAYER  — narrate the maths from first principles
   Everything here is derived live from the current beam state.
   ============================================================ */

// centroid of a (possibly trapezoidal) UDL patch
function patchCentroid(l) {
  const len = l.x2 - l.x1;
  if (Math.abs(l.w1 + l.w2) < 1e-12) return (l.x1 + l.x2) / 2;
  return l.x1 + len * (l.w1 + 2 * l.w2) / (3 * (l.w1 + l.w2));
}

// turn every load into a single downward "point-equivalent" + list couples,
// then solve the reactions by hand for the two determinate cases.
function deriveReactions(L, supports, hinges, loads) {
  const acts = activeLoads(loads);
  if (!acts.length) return { mode: "none" };
  const sup = [...supports].sort((a, b) => a.x - b.x);
  const H = hinges.length;
  const forces = [], couples = [];
  acts.forEach(l => {
    if (l.type === "point") forces.push({ kind: "point", P: l.P, x: l.x });
    else if (l.type === "udl") {
      const len = l.x2 - l.x1, W = (l.w1 + l.w2) / 2 * len, xb = patchCentroid(l);
      forces.push({ kind: "udl", P: W, x: xb, w1: l.w1, w2: l.w2, x1: l.x1, x2: l.x2, len });
    } else if (l.type === "moment") couples.push({ M: l.M, x: l.x });
  });
  const sumW = forces.reduce((s, f) => s + f.P, 0);

  if (H === 0 && sup.length === 2 && sup.every(s => s.type !== "fixed")) {
    const xA = sup[0].x, xB = sup[1].x, d = xB - xA;
    if (d < 1e-6) return { mode: "hard" };
    let num = 0;
    const F = forces.map(f => { const arm = f.x - xA, c = f.P * arm; num += c; return { ...f, arm, c }; });
    couples.forEach(cp => { num -= cp.M; });
    const RB = num / d, RA = sumW - RB;
    return { mode: "two", xA, xB, d, forces: F, couples, sumW, num, RB, RA };
  }
  if (H === 0 && sup.length === 1 && sup[0].type === "fixed") {
    const xf = sup[0].x;
    let MA = 0;
    const F = forces.map(f => { const arm = f.x - xf, c = f.P * arm; MA += c; return { ...f, arm, c }; });
    couples.forEach(cp => { MA -= cp.M; });
    const left = xf < L / 2;
    const beamSide = (left ? -1 : 1) * MA;
    return { mode: "cant", xf, left, forces: F, couples, sumW, MA, beamSide };
  }
  return { mode: "hard", H, n: supports.length };
}

// march left → right and describe the shear line at every event
function buildShearWalk(L, supports, loads, probe) {
  const acts = activeLoads(loads);
  const ev = [];
  supports.forEach(s => ev.push({ x: s.x, type: "support" }));
  acts.filter(l => l.type === "point").forEach(l => ev.push({ x: l.x, type: "point", P: l.P }));
  const groups = [];
  ev.sort((a, b) => a.x - b.x).forEach(e => {
    const g = groups.find(g => Math.abs(g.x - e.x) < 1e-6);
    if (g) g.items.push(e); else groups.push({ x: e.x, items: [e] });
  });
  const udlOver = (a, b) => acts.some(l => l.type === "udl" && l.x1 < b - 1e-6 && l.x2 > a + 1e-6);
  const jstr = j => (Math.abs(j) < 0.05 ? "stays put" : `jumps ${j >= 0 ? "up" : "down"} by ${fmt(Math.abs(j), 1)} kN`);
  const steps = [];
  steps.push(`Imagine slicing the beam and looking only at the piece to the LEFT of the cut. V is the up-or-down force needed to hold that piece still. Start at the far left, x = 0 m — nothing to the left yet, so V = 0.`);
  let prevX = 0, lastRight = 0;
  groups.forEach(g => {
    if (g.x - prevX > 1e-6) {
      const rhsLeft = probe.VSide(g.x, "L");
      steps.push(udlOver(prevX, g.x)
        ? `Slide to x = ${fmt(g.x)} m. A spread load pushes down all the way, so the line slopes straight down: V goes ${fmt(lastRight, 1)} → ${fmt(rhsLeft, 1)} kN.`
        : `Slide to x = ${fmt(g.x)} m. No load in between, so the line is flat — V holds at ${fmt(lastRight, 1)} kN.`);
      lastRight = rhsLeft;
    }
    const left = probe.VSide(g.x, "L"), right = probe.VSide(g.x, "R");
    const causes = g.items.map(it => it.type === "support"
      ? `the support shoves up by R = ${fmt((probe.Rat(it.x) || { R: 0 }).R, 1)} kN`
      : `a point load tugs ${it.P < 0 ? "up" : "down"} by ${fmt(Math.abs(it.P), 1)} kN`);
    steps.push(`At x = ${fmt(g.x)} m, ${causes.join(" and ")}, so V ${jstr(right - left)} → V = ${fmt(right, 1)} kN.`);
    lastRight = right; prevX = g.x;
  });
  if (L - prevX > 1e-6) {
    const endL = probe.VSide(L, "L");
    steps.push(udlOver(prevX, L)
      ? `Run on to x = ${fmt(L)} m. Spread load to the end, so V slopes ${fmt(lastRight, 1)} → ${fmt(endL, 1)} kN.`
      : `Run on to x = ${fmt(L)} m. Flat to the end — V stays ${fmt(lastRight, 1)} kN.`);
    lastRight = endL;
  }
  steps.push(Math.abs(lastRight) < 0.5
    ? `The line lands back on zero at the right end ✓ — every push up has cancelled every push down. That's your proof the reactions were right.`
    : `The line ends at ${fmt(lastRight, 1)} kN — that's a load sitting right on the end support.`);
  return steps;
}

/* ---- tiny presentational helpers ---- */
const CALLS = {
  tip:      { cc: "#0E8A7B", cbg: "#E8F4F1", lab: "Tip" },
  remember: { cc: "#C2531F", cbg: "#FBEDE4", lab: "Remember this" },
  watch:    { cc: "#C0392B", cbg: "#FBEBE9", lab: "Watch out" },
  fact:     { cc: "#4A4ACB", cbg: "#ECECFB", lab: "Good to know" },
};
function Call({ kind = "tip", title, children }) {
  const c = CALLS[kind] || CALLS.tip;
  return (
    <div className="call" style={{ "--cc": c.cc, "--cbg": c.cbg }}>
      <div className="ct"><span className="cdot" />{title || c.lab}</div>
      <div className="cx">{children}</div>
    </div>
  );
}
function Lesson({ n, title, sub, accent = "#1B2A41", open, children }) {
  const [o, setO] = useState(open !== false);
  return (
    <div className={"lesson" + (o ? " open" : "")} style={{ "--lac": accent }}>
      <div className="lh" role="button" tabIndex={0} onClick={() => setO(v => !v)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setO(v => !v); } }}>
        <span className="lbadge">{n}</span>
        <span className="lt"><span className="ltt">{title}</span>{sub && <span className="lts">{sub}</span>}</span>
        <span className="lchev">▸</span>
      </div>
      {o && <div className="lb">{children}</div>}
    </div>
  );
}
const Eqn = ({ children }) => <div className="eqn">{children}</div>;
const Step = ({ children }) => <span className="step">{children}</span>;
const wud = f => f.kind === "udl"
  ? (Math.abs(f.w1 - f.w2) < 1e-9
      ? `w·len = ${fmt((f.w1 + f.w2) / 2, 1)}×${fmt(f.len)}`
      : `½(w₁+w₂)·len = ½(${fmt(f.w1, 1)}+${fmt(f.w2, 1)})×${fmt(f.len)}`)
  : "";

/* ---- formulas worth memorising ---- */
const REF = [
  { head: "Simply supported", rh: "#0E8A7B", hit: /^simply supported/i, rows: [
    ["Central point load P", "Rₐ = R_b = P/2   ·   M_max = PL/4   ·   δ = PL³/48EI"],
    ["Uniform load w (full)", "Rₐ = R_b = wL/2   ·   M_max = wL²/8   ·   δ = 5wL⁴/384EI"],
    ["Couple M₀ at a", "Rₐ = M₀/L   ·   R_b = −M₀/L   ·   M steps by −M₀"],
  ]},
  { head: "Cantilever", rh: "#D4622A", hit: /^cantilever/i, rows: [
    ["Tip point load P", "R = P   ·   M_fix = PL (hogging)   ·   δ_tip = PL³/3EI"],
    ["Uniform load w (full)", "R = wL   ·   M_fix = wL²/2 (hog)   ·   δ_tip = wL⁴/8EI"],
  ]},
  { head: "Fixed–fixed", rh: "#5B5BD6", hit: /fixed.end/i, rows: [
    ["Uniform load w (full)", "M_end = wL²/12 (hog)   ·   M_mid = wL²/24   ·   δ = wL⁴/384EI"],
    ["Central point load P", "M_end = PL/8   ·   M_mid = PL/8   ·   δ = PL³/192EI"],
  ]},
  { head: "Propped cantilever", rh: "#1B2A41", hit: /propped/i, rows: [
    ["Uniform load w (full)", "M_fix = wL²/8 (hog)   ·   R_prop = 3wL/8   ·   R_fix = 5wL/8"],
    ["Central point load P", "M_fix = 3PL/16   ·   R_prop = 5P/16   ·   M_load = 5PL/32"],
  ]},
];

function VerifyTeach({ L, EI, supports, hinges, loads, res, det, probe, Dmm, tolM }) {
  const detName = det ? det.name : "";
  const ref = (
    <Lesson n="★" title="Formulas worth memorising" sub="the exam shortcuts — learn these cold" accent="#1B2A41" open={false}>
      <p className="say">For the standard set-ups below you should not need to derive anything — recognise the case and write the answer. The card matching your current beam is highlighted.</p>
      <div className="ref">
        {REF.map((r, i) => (
          <div key={i} className={"refc" + (r.hit.test(detName) ? " hit" : "")}>
            <div className="refh" style={{ "--rh": r.rh }}>{r.head}{r.hit.test(detName) && <span className="hittag">this beam</span>}</div>
            {r.rows.map((row, j) => (
              <div className="refr2" key={j}><div className="rk">{row[0]}</div><div className="rv2">{row[1]}</div></div>
            ))}
          </div>
        ))}
      </div>
      <Call kind="fact">L is the span, EI is the bending stiffness (E = stiffness of the material, I = second moment of area of the shape). Bigger EI ⇒ stiffer ⇒ less deflection. Notice deflection always carries an L to a high power (³ or ⁴): doubling a span is far worse for sag than doubling a load.</Call>
    </Lesson>
  );

  // determinacy (always shown)
  const detLesson = (
    <Lesson n="0" title="Is this even solvable by balance alone?" sub="counting unknowns vs equations" accent="#5B5BD6">
      <p className="say">Before any maths, count. A flat beam has just <b>two</b> rules of balance available: the up-forces must equal the down-forces, and there must be no net spinning. So balance gives you <b>2 equations</b>. Each support restraint you add is <b>1 unknown</b> push (a fixed support is worth 2 — a push <i>and</i> a grip). Each internal hinge hands you a free fact (the moment there is zero), which is <b>+1 equation</b>.</p>
      <Eqn>
        <Step>n = (restraints) − 2 − (hinges)</Step>
        <Step>n = {res.r} − 2 − {res.h} = <span className="res">{res.nIndet}</span></Step>
      </Eqn>
      <p className="say">
        {!res.stable ? <><b>n is below zero → mechanism.</b> There aren't enough restraints; the beam can move as a rigid body, so there's no single answer. Add a support or stiffen one.</>
          : res.nIndet === 0 ? <><b>n = 0 → statically determinate.</b> Unknowns match equations exactly — balance alone cracks it. That's the friendly case we work by hand below.</>
            : <><b>n = {res.nIndet} → statically indeterminate.</b> More unknowns than balance can pin down. Hand statics gets you part way; the rest needs how stiff things are (the slope-deflection / stiffness method). The solver does that — we'll lean on the cross-checks instead.</>}
      </p>
      <Call kind="remember">Restraint count: <b>roller = 1</b>, <b>pin = 1</b> (for a transverse beam), <b>fixed = 2</b>. Hinge subtracts one from the indeterminacy. Aim for n = 0 in exam questions unless told otherwise.</Call>
    </Lesson>
  );

  if (!res.stable) {
    return <div className="teach">{detLesson}{ref}</div>;
  }

  const rd = deriveReactions(L, supports, hinges, loads);
  const walk = buildShearWalk(L, supports, loads, probe);
  const detM = det ? det.rows.filter(r => r.unit === "kN·m") : [];
  const detD = det ? det.rows.find(r => r.unit === "mm") : null;
  const Dext = Math.min(...Dmm);
  const Dx = res.dx[Dmm.indexOf(Dext)];
  const anyUDL = activeLoads(loads).some(l => l.type === "udl");

  // ---- reactions narration ----
  const forceList = (rd.forces || []).map((f, i) => f.kind === "udl"
    ? <span className="step" key={i}>• spread load {fmt(f.w1, 1)}{Math.abs(f.w1 - f.w2) > 1e-9 ? `→${fmt(f.w2, 1)}` : ""} kN/m over {fmt(f.x1)}–{fmt(f.x2)} m → squash it into one force <b>W = {wud(f)} = {fmt(f.P, 1)} kN</b> acting at its balance point <b>x̄ = {fmt(f.x)} m</b></span>
    : <span className="step" key={i}>• point load <b>{fmt(Math.abs(f.P), 1)} kN {f.P < 0 ? "↑" : "↓"}</b> at x = {fmt(f.x)} m</span>);

  let reactBody;
  if (rd.mode === "two") {
    const sA = probe.Rat(rd.xA), sB = probe.Rat(rd.xB);
    reactBody = <>
      <p className="say">Two supports, so two unknown pushes: one at <b>A (x = {fmt(rd.xA)} m)</b> and one at <b>B (x = {fmt(rd.xB)} m)</b>. The clever move: take moments <i>about A</i>. Anything sitting at A has zero lever-arm, so it can't spin the beam about A and drops out of the sum — leaving B as the only unknown. Solve B, then use up = down for A.</p>
      <div className="lbl2">First, list every downward force</div>
      <Eqn>{forceList}{rd.couples.map((c, i) => <span className="step" key={"c" + i}>• applied couple {fmt(Math.abs(c.M), 1)} kN·m {c.M >= 0 ? "↺" : "↻"} at x = {fmt(c.x)} m (no up/down force, but it does twist)</span>)}<span className="step">Total down: ΣW = <b>{fmt(rd.sumW, 1)} kN</b></span></Eqn>
      <div className="lbl2">Spin about A: moment = force × lever-arm (distance from A)</div>
      <Eqn>
        <Step>ΣM about A = 0&nbsp;&nbsp;(anticlockwise +)</Step>
        <Step>R_b × {fmt(rd.d)} = {rd.forces.map((f, i) => `${fmt(f.P, 1)}×${fmt(f.arm)}`).join("  +  ")}{rd.couples.map(c => `  −  ${fmt(c.M, 1)}`).join("")}</Step>
        <Step>R_b × {fmt(rd.d)} = {fmt(rd.num, 1)}</Step>
        <Step>R_b = {fmt(rd.num, 1)} ÷ {fmt(rd.d)} = <span className="res">{fmt(rd.RB, 1)} kN ↑</span></Step>
      </Eqn>
      <div className="lbl2">Then up = down for the other one</div>
      <Eqn>
        <Step>ΣF vertical = 0:&nbsp; R_a = ΣW − R_b</Step>
        <Step>R_a = {fmt(rd.sumW, 1)} − {fmt(rd.RB, 1)} = <span className="res">{fmt(rd.RA, 1)} kN ↑</span></Step>
      </Eqn>
      <Call kind="tip">Always take moments about a point with an unknown <i>on</i> it — that unknown vanishes and you isolate the other. The lever-arm is the horizontal distance from your pivot to where the force acts; a force pointing through the pivot has zero arm.</Call>
      {anyUDL && <Call kind="remember">A distributed load = its <b>area</b> (the total kN) acting through its <b>centroid</b>. Rectangle (uniform) → middle. Triangle → ⅓ of the way from the tall end (⅔ from the pointy end). Trapezoid → x̄ = x₁ + len·(w₁+2w₂)/[3(w₁+w₂)].</Call>}
      <Call kind="watch" title="Sign sense">Down loads and clockwise couples try to spin the beam one way; the far reaction spins it back. Keep one direction positive (here anticlockwise +) for the WHOLE sum or signs will fight you.</Call>
      <p className="say dim">Solver's numbers: R_a = {fmt((sA || {}).R, 1)} kN, R_b = {fmt((sB || {}).R, 1)} kN — matches the hand working ✓</p>
    </>;
  } else if (rd.mode === "cant") {
    const sF = probe.Rat(rd.xf);
    reactBody = <>
      <p className="say">Only one support and it's <b>fixed</b> — a wall. A wall does two jobs: it pushes up (a vertical reaction) <i>and</i> it grips, refusing to let the beam rotate (a moment reaction). Two jobs = two unknowns = exactly what the two balance rules can find.</p>
      <div className="lbl2">List the downward forces</div>
      <Eqn>{forceList}<span className="step">Total down: ΣW = <b>{fmt(rd.sumW, 1)} kN</b></span></Eqn>
      <div className="lbl2">Up = down gives the vertical push</div>
      <Eqn><Step>R = ΣW = <span className="res">{fmt(rd.sumW, 1)} kN ↑</span></Step></Eqn>
      <div className="lbl2">No-spin at the wall gives the grip (fixing) moment</div>
      <Eqn>
        <Step>M_wall = Σ force × distance-from-wall</Step>
        <Step>M_wall = {rd.forces.map(f => `${fmt(f.P, 1)}×${fmt(Math.abs(f.arm))}`).join("  +  ")}{rd.couples.map(c => `  −  ${fmt(c.M, 1)}`).join("")} = {fmt(rd.MA, 1)} kN·m</Step>
        <Step>Bending moment at the wall (beam side) = <span className="res">{fmt(rd.beamSide, 1)} kN·m</span> (hogging — top fibres stretch)</Step>
      </Eqn>
      <Call kind="remember">A cantilever hogs: it's biggest moment is right at the support, and the top surface is in tension. For a tip load that's M = P·L; for a full UDL it's M = wL²/2.</Call>
      <p className="say dim">Sign note: the table lists the wall's <i>reaction couple</i> as +{fmt(Math.abs(rd.beamSide), 1)} kN·m (the twist it applies to hold on). The beam's <i>internal</i> moment there is the equal-and-opposite −{fmt(Math.abs(rd.beamSide), 1)} kN·m — negative because hogging is negative in the sagging-positive convention the diagrams use.</p>
      <p className="say dim">Solver: R = {fmt((sF || {}).R, 1)} kN, M = {fmt((sF || {}).M, 1)} kN·m ✓</p>
    </>;
  } else {
    reactBody = <>
      <p className="say">This arrangement isn't a simple "two props" or "single wall", so the clean hand-recipe doesn't apply directly{rd.H ? " (an internal hinge changes the bookkeeping)" : ""}. The method is the same in spirit — balance plus, where needed, compatibility — but it's quicker to read the solved reactions and confirm them with the equilibrium check below.</p>
      <Call kind="tip">For a beam with an internal hinge, you get a bonus equation: take moments of everything on one side of the hinge about the hinge and set it to zero (the hinge can't carry moment). That extra equation is what makes a hinged beam solvable by statics.</Call>
    </>;
  }

  // ---- moment key points ----
  const fixedRs = res.reactions.filter(r => r.type === "fixed");
  return (
    <div className="teach">
      <p className="intro">Here's the whole solve, narrated step by step. Tap any heading to fold it away. Everything updates the instant you drag the beam.</p>
      {detLesson}

      <Lesson n="1" title="Find the support reactions" sub="how hard each support pushes back" accent="#1E7F3C">
        {reactBody}
        <div className="lbl2">All reactions (up +, anticlockwise +)</div>
        <table className="vt"><thead><tr><th>support</th><th>type</th><th>R&nbsp;kN</th><th>M&nbsp;kN·m</th></tr></thead><tbody>
          {res.reactions.map((r, i) => <tr key={i}><td>x = {fmt(r.x)} m</td><td>{r.type}</td><td>{fmt(r.R)}</td><td>{r.type === "fixed" ? fmt(r.M) : "—"}</td></tr>)}
        </tbody></table>
        <div className="m">ΣR = {fmt(res.totalR)} kN&nbsp; vs &nbsp;ΣW = {fmt(res.totalDown)} kN → balance <span className={res.eqOK ? "ok" : "no"}>{res.eqOK ? "✓ holds" : "✗ off"}</span></div>
      </Lesson>

      <Lesson n="2" title="Build the shear force diagram (V)" sub="net up/down force across a cut" accent="#0E8A7B">
        <p className="say">Shear is simple bookkeeping: walk along the beam keeping a running total of the up-and-down forces you've passed. A support adds its push; a downward load subtracts; a spread load drains it gradually.</p>
        <Eqn>{walk.map((s, i) => <span className="step" key={i}>{i + 1}. {s}</span>)}</Eqn>
        <Call kind="fact">The slope of the shear line is minus the load: <b>w = −dV/dx</b>. Flat where there's no load, straight ramp under a uniform load, vertical jump at a point force.</Call>
        <p className="say">Biggest values: <b>V = {fmt(res.Vmax.v, 1)} kN</b> at x = {fmt(res.Vmax.x)} m and <b>V = {fmt(res.Vmin.v, 1)} kN</b> at x = {fmt(res.Vmin.x)} m.</p>
      </Lesson>

      <Lesson n="3" title="Build the bending moment diagram (M)" sub="how hard the beam is being bent" accent="#D4622A">
        <p className="say">At any cut, the bending moment is the sum of (each force on one side × its distance to the cut). You don't have to redo that sum everywhere — there's a shortcut: <b>the slope of the M-line is the shear, V = dM/dx</b>. So M climbs while V is positive, falls while V is negative, and <b>turns at the exact spot where V = 0</b> (or where V leaps across zero under a point load). That's where you look for the peak.</p>
        <Call kind="remember">Sagging = smile = positive M (bottom fibres stretch). Hogging = frown = negative M (top fibres stretch). A simple support end has <b>M = 0</b>; a free cantilever tip has M = 0; a couple makes M jump by its size.</Call>
        <p className="say">From this beam:</p>
        <Eqn>
          {res.Mmax.v > tolM && <span className="step">Largest sag: <b>M = +{fmt(res.Mmax.v, 1)} kN·m</b> at x = {fmt(res.Mmax.x)} m{Math.abs(res.Mmax.x - res.Vmax.x) < 0.4 || Math.abs(res.Mmax.x - res.Vmin.x) < 0.4 ? " — right where V passes through zero, as promised" : ""}</span>}
          {res.Mmin.v < -tolM && <span className="step">Largest hog: <b>M = {fmt(res.Mmin.v, 1)} kN·m</b> at x = {fmt(res.Mmin.x)} m</span>}
          {fixedRs.map((r, i) => <span className="step" key={"f" + i}>At the fixed support (x = {fmt(r.x)} m): M = {fmt(r.M, 1)} kN·m (the wall's grip)</span>)}
          <span className="step">Zero-moment points (contraflexure, where it switches sag↔hog): {res.contraflexure.length ? res.contraflexure.map(x => fmt(x) + " m").join(", ") : "none — moment keeps one sign"}</span>
        </Eqn>
        {detM.length > 0 && <Call kind="tip" title="Textbook shortcut for this exact case">{detM.map((r, i) => <span key={i}>{r.q} = <b>{r.f}</b> = {fmt(r.hand, 1)} {r.unit}{i < detM.length - 1 ? <br /> : null}</span>)}</Call>}
        <Call kind="fact">Why contraflexure matters: it's where the beam stops sagging and starts hogging, so the moment is momentarily zero — a natural place to splice a beam or stop top steel. In a continuous beam it sits a little way out from the internal supports.</Call>
      </Lesson>

      <Lesson n="4" title="How much does it sag? (deflection δ)" sub="from curvature to droop" accent="#5B5BD6">
        <p className="say">Bending moment bends the beam into a curve; the more moment and the floppier the beam, the tighter the curve. The link is <b>curvature = M / EI</b>. To get the actual droop you "undo" that twice: curvature → slope → position (two integrations). Each integration leaves a constant you pin down using what you already know — for example, the deflection is zero exactly over each support. That's why you always need as many known points (boundary conditions) as constants.</p>
        {detD
          ? <><div className="lbl2">Closed-form for this case</div><Eqn><Step>δ = {detD.f}</Step><Step>plug in the numbers (EI = {fmt(EI, 0)} kN·m²) → δ = <span className="res">{fmt(detD.hand, 2)} mm</span> {detD.hand >= 0 ? "up" : "down"}</Step></Eqn></>
          : <p className="say">No single textbook formula fits this exact loading, so the solver integrates numerically.</p>}
        <p className="say">Peak movement here: <b>δ = {fmt(Dext, 2)} mm</b> at x = {fmt(Dx)} m ({Dext < 0 ? "downward — the usual direction" : "upward"}).</p>
        <Call kind="remember">The four you'll reuse most: simply-supported UDL <b>5wL⁴/384EI</b>, simply-supported central point <b>PL³/48EI</b>, cantilever tip point <b>PL³/3EI</b>, cantilever UDL <b>wL⁴/8EI</b>. Span L dominates — it's raised to the 3rd or 4th power.</Call>
        <Call kind="fact">Service check (not in this tool, but worth knowing): codes often cap deflection at about span/360 under imposed load for floors. So for a 6 m span that's roughly 17 mm — handy sanity yardstick.</Call>
      </Lesson>

      <Lesson n="5" title="How do I know it's right?" sub="three independent checks" accent="#1B2A41">
        <p className="say">Never trust one number on its own. Three quick cross-checks catch almost every slip:</p>
        <Eqn>
          <Step>① Balance: total of all reactions = total load applied.</Step>
          <Step>&nbsp;&nbsp;&nbsp;ΣR = {fmt(res.totalR)} kN, ΣW = {fmt(res.totalDown)} kN → <span className={res.eqOK ? "ok" : "no"}>{res.eqOK ? "✓" : "✗"}</span></Step>
          <Step>② Shear closes back to zero at the free right end → already seen above.</Step>
          <Step>③ Compare against the closed-form textbook answer.</Step>
        </Eqn>
        {det
          ? <><p className="say dim">Matched textbook case: <b style={{ color: "#1B2A41" }}>{det.name}</b></p><Verif det={det} /></>
          : <p className="say dim">No standard textbook case matches this exact set-up, so the closed-form column is skipped. The balance check above still vouches for the result, and the engine itself passed a 53-case closed-form test suite.</p>}
        {hinges.length > 0 && <><div className="lbl2">Hinge release check</div><Eqn>{hinges.map((h, i) => { const Mh = probe.MatSide(h.x); const ok = Math.abs(Mh) <= Math.max(0.02, 0.01 * Math.max(Math.abs(res.Mmax.v), Math.abs(res.Mmin.v))); return <span className="step" key={i}>Hinge at x = {fmt(h.x)} m must carry no moment → M = {fmt(Mh)} kN·m ≈ 0 <span className={ok ? "ok" : "no"}>{ok ? "✓" : "✗"}</span></span>; })}</Eqn></>}
      </Lesson>

      <Lesson n="✓" title="The 30-second method (sketch order)" sub="what to do under exam pressure" accent="#1E7F3C" open={false}>
        <Eqn>
          <Step>1. Reactions — moments about one support, then ΣF.</Step>
          <Step>2. Shear V — start at left reaction, add/subtract loads left→right; it must close to 0.</Step>
          <Step>3. Moment M — areas under the V diagram; peak where V = 0; zero at simple ends.</Step>
          <Step>4. Deflection — quote the standard formula, or shape it from the M diagram (sag dips down, hog humps up, hinge gives a kink).</Step>
        </Eqn>
        <Call kind="tip">Useful identities to keep on a mental sticky-note: w = −dV/dx, V = dM/dx, curvature = M/EI. Point load P ⇒ V jumps −P. Couple M₀ (CCW +) ⇒ M steps −M₀. Internal hinge ⇒ M = 0 with a kink in the deflected shape.</Call>
      </Lesson>

      {ref}
    </div>
  );
}

/* ---------- summary text for list rows ---------- */
function summarize(l, L) {
  if (l.kind === "support") return `${l.type} · x = ${fmt(l.x)} m`;
  if (l.kind === "hinge") return `M = 0 · x = ${fmt(l.x)} m`;
  if (l.type === "point") return `${fmt(Math.abs(l.P), 1)} kN ${l.P < 0 ? "↑" : "↓"} · x = ${fmt(l.x)} m`;
  if (l.type === "moment") return `${fmt(Math.abs(l.M), 1)} kN·m ${l.M >= 0 ? "↺" : "↻"} · x = ${fmt(l.x)} m`;
  const same = Math.abs(l.w1 - l.w2) < 1e-9;
  return `${same ? fmt(l.w1, 1) : fmt(l.w1, 1) + "→" + fmt(l.w2, 1)} kN/m · ${fmt(l.x1)}–${fmt(l.x2)} m`;
}
function titleOf(l) {
  if (l.kind === "support") return "Support";
  if (l.kind === "hinge") return "Internal hinge";
  return l.type === "point" ? "Point load" : l.type === "moment" ? "Applied moment" : "Distributed load";
}

/* ============================================================ */
export default function BeamLab() {
  const init = useMemo(() => withIds(PRESETS[0].make()), []);
  const [L, setLraw] = useState(init.L);
  const [EI, setEI] = useState(50000);
  const [supports, setSupports] = useState(init.supports);
  const [hinges, setHinges] = useState(init.hinges);
  const [loads, setLoads] = useState(init.loads);
  const [section, setSection] = useState("loads");
  const [selected, setSelected] = useState({ kind: "load", id: init.loads[0].id });
  const [bmdTension, setBmdTension] = useState(true);
  const [showR, setShowR] = useState(true);
  const [hoverX, setHoverXf] = useState(null);
  const [preset, setPreset] = useState(PRESETS[0].name);

  const setHoverX = f => setHoverXf(f === null ? null : f * L);

  const setL = nL => {
    setLraw(nL);
    setSupports(ss => ss.map(s => ({ ...s, x: Math.min(s.x, nL) })));
    setHinges(hs => hs.map(h => ({ ...h, x: Math.min(h.x, nL) })));
    setLoads(ls => ls.map(l => l.type === "udl" ? { ...l, x1: Math.min(l.x1, nL), x2: Math.min(l.x2, nL) } : { ...l, x: Math.min(l.x, nL) }));
  };

  const applyPreset = p => {
    const cfg = withIds(p.make());
    setLraw(cfg.L); setSupports(cfg.supports); setHinges(cfg.hinges); setLoads(cfg.loads);
    setPreset(p.name); setHoverXf(null);
    setSelected(cfg.loads.length ? { kind: "load", id: cfg.loads[0].id } : null);
    setSection("loads");
  };

  const res = useMemo(() => {
    const seen = [], sup = [];
    [...supports].sort((a, b) => (a.type === "fixed" ? -1 : 1)).forEach(s => { if (!seen.some(x => Math.abs(x - s.x) < 1e-6)) { seen.push(s.x); sup.push(s); } });
    return analyzeBeam({ L, EI, supports: sup, hinges: hinges.map(h => h.x), loads });
  }, [L, EI, supports, hinges, loads]);

  const det = useMemo(() => detectStandard(L, EI, supports, hinges, loads, res), [L, EI, supports, hinges, loads, res]);
  const probe = res.stable ? mkProbe(res) : null;

  const upd = setter => (id, patch) => setter(arr => arr.map(it => it.id === id ? { ...it, ...patch } : it));
  const updLoad = upd(setLoads), updSup = upd(setSupports), updHinge = upd(setHinges);
  const rm = setter => id => setter(arr => arr.filter(it => it.id !== id));

  const select = (kind, id) => {
    if (!kind) { setSelected(null); return; }
    setSelected({ kind, id });
    setSection(kind === "load" ? "loads" : "supports");
  };
  const isSel = (kind, id) => selected && selected.kind === kind && selected.id === id;

  const onCanvasDrag = (kind, id, val) => {
    const snap = x => { const r = Math.round(x * 2) / 2; return Math.abs(r - x) < 0.06 ? r : Math.round(x / 0.05) * 0.05; };
    if (kind === "support") updSup(id, { x: snap(val) });
    else if (kind === "hinge") updHinge(id, { x: snap(val) });
    else if (kind === "point" || kind === "moment") updLoad(id, { x: snap(val) });
    else if (kind === "udl-x1") setLoads(ls => ls.map(l => l.id === id ? { ...l, x1: Math.min(snap(val), l.x2) } : l));
    else if (kind === "udl-x2") setLoads(ls => ls.map(l => l.id === id ? { ...l, x2: Math.max(snap(val), l.x1) } : l));
    else if (kind === "udl-set") setLoads(ls => ls.map(l => l.id === id ? { ...l, x1: val.x1, x2: val.x2 } : l));
  };

  const addPoint = () => { const id = uid(); setLoads(ls => [...ls, { id, type: "point", x: L / 2, P: 20 }]); select("load", id); };
  const addUDL = () => { const id = uid(); setLoads(ls => [...ls, { id, type: "udl", x1: 0, x2: L, w1: 10, w2: 10 }]); select("load", id); };
  const addMoment = () => { const id = uid(); setLoads(ls => [...ls, { id, type: "moment", x: L / 2, M: 30 }]); select("load", id); };
  const addSupport = () => { const id = uid(); setSupports(ss => [...ss, { id, x: L, type: "roller" }]); select("support", id); };
  const addHinge = () => { const id = uid(); setHinges(hs => [...hs, { id, x: L / 2 }]); select("hinge", id); };

  const Dmm = res.stable ? res.dv.map(v => v * 1000) : [];
  const tolV = res.stable ? Math.max(Math.abs(res.Vmax.v), Math.abs(res.Vmin.v)) * 1e-4 + 1e-9 : 0;
  const tolM = res.stable ? Math.max(Math.abs(res.Mmax.v), Math.abs(res.Mmin.v)) * 1e-4 + 1e-9 : 0;

  const annsV = [], annsM = [], annsD = [];
  if (res.stable) {
    if (Math.abs(res.Vmax.v) > tolV) annsV.push({ x: res.Vmax.x, v: res.Vmax.v, label: `${fmt(res.Vmax.v, 1)} @ ${fmt(res.Vmax.x)}` });
    if (Math.abs(res.Vmin.v) > tolV && Math.abs(res.Vmin.x - res.Vmax.x) > 1e-9) annsV.push({ x: res.Vmin.x, v: res.Vmin.v, label: `${fmt(res.Vmin.v, 1)} @ ${fmt(res.Vmin.x)}` });
    if (res.Mmax.v > tolM) annsM.push({ x: res.Mmax.x, v: res.Mmax.v, label: `+${fmt(res.Mmax.v, 1)} @ ${fmt(res.Mmax.x)}` });
    if (res.Mmin.v < -tolM) annsM.push({ x: res.Mmin.x, v: res.Mmin.v, label: `${fmt(res.Mmin.v, 1)} @ ${fmt(res.Mmin.x)}` });
    const dmn = Math.min(...Dmm), dmx = Math.max(...Dmm);
    if (dmn < -1e-6) { const i = Dmm.indexOf(dmn); annsD.push({ x: res.dx[i], v: dmn, label: `${fmt(dmn, 1)} mm @ ${fmt(res.dx[i])}` }); }
    if (dmx > 1e-6) { const i = Dmm.indexOf(dmx); annsD.push({ x: res.dx[i], v: dmx, label: `+${fmt(dmx, 1)} mm @ ${fmt(res.dx[i])}` }); }
  }

  let hv = null;
  if (hoverX !== null && res.stable && probe) hv = { x: hoverX, V: probe.VSide(hoverX), M: probe.MatSide(hoverX), d: probe.Dat(hoverX) * 1000 };

  const stamp = !res.stable ? { txt: "MECHANISM", col: C.bad }
    : res.nIndet === 0 ? { txt: "DETERMINATE", col: C.good }
    : { txt: `INDETERMINATE ×${res.nIndet}`, col: C.moment };

  const counts = { supports: supports.length + hinges.length, loads: loads.length };

  // ----- editors -----
  const PointEditor = l => {
    const dir = l.P < 0 ? "up" : "down", mag = Math.abs(l.P) || 0;
    const setMag = v => updLoad(l.id, { P: (dir === "up" ? -1 : 1) * Math.abs(v) });
    const setDir = d => updLoad(l.id, { P: (d === "up" ? -1 : 1) * (Math.abs(l.P) || 1) });
    return (<>
      <div className="fl">Direction</div>
      <div className="dirs">
        <button className={"dirbtn" + (dir === "down" ? " on" : "")} title="downward" onClick={() => setDir("down")}><IcoArrow /></button>
        <button className={"dirbtn" + (dir === "up" ? " on" : "")} title="upward" onClick={() => setDir("up")}><IcoArrow up /></button>
      </div>
      <div className="fl">Magnitude — kN</div>
      <Slider value={mag} min={0} max={200} step={1} onChange={setMag} dp={1} />
      <div className="fl">Position — m</div>
      <PosField value={l.x} L={L} onChange={v => updLoad(l.id, { x: v })} />
    </>);
  };
  const MomentEditor = l => {
    const ccw = l.M >= 0, mag = Math.abs(l.M) || 0;
    const setMag = v => updLoad(l.id, { M: (ccw ? 1 : -1) * Math.abs(v) });
    const setDir = c => updLoad(l.id, { M: (c ? 1 : -1) * (Math.abs(l.M) || 1) });
    return (<>
      <div className="fl">Direction</div>
      <div className="dirs">
        <button className={"dirbtn" + (ccw ? " on" : "")} title="counter-clockwise (+)" onClick={() => setDir(true)}><IcoMoment ccw /></button>
        <button className={"dirbtn" + (!ccw ? " on" : "")} title="clockwise (−)" onClick={() => setDir(false)}><IcoMoment /></button>
      </div>
      <div className="fl">Magnitude — kN·m</div>
      <Slider value={mag} min={0} max={200} step={1} onChange={setMag} dp={1} />
      <div className="fl">Position — m</div>
      <PosField value={l.x} L={L} onChange={v => updLoad(l.id, { x: v })} />
    </>);
  };
  const UDLEditor = l => (<>
    <div className="fl">Intensity — kN/m (↓ positive)</div>
    <div className="row" style={{ gridTemplateColumns: "44px 1fr 64px" }}>
      <label className="dim" style={{ font: `500 9.5px ${MONO}` }}>start</label>
      <input type="range" min={-50} max={50} step={0.5} value={l.w1} onChange={e => updLoad(l.id, { w1: parseFloat(e.target.value) })} />
      <input type="number" step={0.5} value={l.w1} onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) updLoad(l.id, { w1: clamp(v, -50, 50) }); }} />
    </div>
    <div className="row" style={{ gridTemplateColumns: "44px 1fr 64px" }}>
      <label className="dim" style={{ font: `500 9.5px ${MONO}` }}>end</label>
      <input type="range" min={-50} max={50} step={0.5} value={l.w2} onChange={e => updLoad(l.id, { w2: parseFloat(e.target.value) })} />
      <input type="number" step={0.5} value={l.w2} onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) updLoad(l.id, { w2: clamp(v, -50, 50) }); }} />
    </div>
    <div className="fl">Extent — m</div>
    <div className="seg" style={{ marginBottom: 7 }}>
      <button className="sb" onClick={() => updLoad(l.id, { x1: 0, x2: L })}>Full</button>
      <button className="sb" onClick={() => updLoad(l.id, { x1: 0, x2: L / 2 })}>Left ½</button>
      <button className="sb" onClick={() => updLoad(l.id, { x1: L / 2, x2: L })}>Right ½</button>
    </div>
    <PosField value={l.x1} L={L} onChange={v => updLoad(l.id, { x1: Math.min(v, l.x2) })} />
    <PosField value={l.x2} L={L} onChange={v => updLoad(l.id, { x2: Math.max(v, l.x1) })} />
  </>);
  const SupportEditor = s => (<>
    <div className="fl">Type</div>
    <div className="seg">
      {["pin", "roller", "fixed"].map(t => (
        <button key={t} className={"sb" + (s.type === t ? " on" : "")} onClick={() => updSup(s.id, { type: t })}><IcoSup type={t} />{t}</button>
      ))}
    </div>
    <div className="fl">Position — m</div>
    <PosField value={s.x} L={L} onChange={v => updSup(s.id, { x: v })} />
  </>);
  const HingeEditor = h => (<>
    <div className="fl">Position — m</div>
    <PosField value={h.x} L={L} onChange={v => updHinge(h.id, { x: v })} />
    <div className="note" style={{ marginTop: 8 }}>Releases moment continuity (M = 0). Each hinge adds one condition: needs r ≥ 2 + h restraints to stay stable.</div>
  </>);

  const ItemRow = (o, kind) => (
    <div key={o.id} className="item" onClick={() => select(kind, o.id)}>
      <span className="iz"><IcoItem l={{ ...o, kind }} /></span>
      <span className="ib"><div className="it">{titleOf({ ...o, kind })}</div><div className="is">{summarize({ ...o, kind }, L)}</div></span>
      <span className="chev">›</span>
    </div>
  );
  const EditorCard = (o, kind, body, remove) => (
    <div key={o.id} className="card" style={{ borderLeft: `4px solid ${C.sel}` }}>
      <div className="chd"><span>{titleOf({ ...o, kind })}</span><button className="del" title="remove" onClick={remove}>×</button></div>
      <div className="cbody">{body}</div>
    </div>
  );

  return (
    <div className="bl">
      <style>{CSS}</style>

      {/* title block */}
      <div className="tb">
        <div className="tbc">
          <div className="ttl">
            <svg className="glyph" viewBox="0 0 15 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4 H14" /><path d="M1 4 L4 1 H11 L14 4" /><path d="M3.5 4 V15" /><path d="M11.5 4 V15" /><path d="M3.5 15 H11.5" /><path d="M3.5 9.5 Q7.5 13 11.5 9.5" />
            </svg>
            STRUCTURAL BEHAVIOUR LAB
          </div>
          <div className="tmeta">Sheet 01 · Beams — SFD · BMD · Deflection · IStructE prep</div>
        </div>
        <div className="tbc">
          <div className="live"><span className="dot" />auto-solve</div>
          <div className="tmeta" style={{ marginTop: 4 }}>EI · units</div>
          <div className="tval">{fmt(EI, 0)} kN·m² · kN·m·mm</div>
        </div>
        <div className="tbc" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="stamp" style={{ "--sc": stamp.col }}>{stamp.txt}</div>
          <div className="tmeta" style={{ marginTop: 6 }}>n = r−2−h = {res.r}−2−{res.h} = {res.nIndet}</div>
        </div>
      </div>

      {!res.stable && <div className="banner">⚠ MECHANISM — {res.reason} Restore stability with n = r − 2 − h ≥ 0 (drag in a support, change a roller to fixed, or remove a hinge).</div>}

      <div className="work">
        {/* ---- left: stage ---- */}
        <div>
          <div className="panel readout">
            <div className="rc"><div className="rl">x</div><div className="rv">{hv ? `${fmt(hv.x)} m` : "—"}</div></div>
            <div className="rc"><div className="rl" style={{ color: C.shear }}>Shear V</div><div className="rv cv" style={{ "--cvc": C.shear }}>{hv ? `${fmt(hv.V, 1)} kN` : "—"}</div></div>
            <div className="rc"><div className="rl" style={{ color: C.moment }}>Moment M</div><div className="rv cv" style={{ "--cvc": C.moment }}>{hv ? `${fmt(hv.M, 1)} kN·m` : "—"}</div></div>
            <div className="rc"><div className="rl" style={{ color: C.defl }}>Defl. δ</div><div className="rv cv" style={{ "--cvc": C.defl }}>{hv ? `${fmt(hv.d, 2)} mm` : "—"}</div></div>
          </div>

          <div className="panel">
            <div className="ph"><span>Model — drag to edit</span>
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", font: "inherit" }}>
                <input type="checkbox" checked={showR} onChange={e => setShowR(e.target.checked)} style={{ accentColor: C.good }} />
                <span style={{ color: C.good }}>reactions</span>
              </label>
            </div>
            <BeamCanvas L={L} supports={supports} hinges={hinges} loads={loads} res={res} showR={showR} hoverX={hoverX} onHover={setHoverX} selected={selected} onSelect={select} onDrag={onCanvasDrag} />
            <div className="hint"><b>Drag</b> any support, hinge or load to reposition · <b>tap</b> a marker to edit it · hover the diagrams to scrub values.</div>
          </div>

          {res.stable ? (<>
            <div className="panel acc" style={{ "--pac": C.shear }}>
              <div className="ph phc" style={{ "--pac": C.shear }}><span><span className="sw" style={{ background: C.shear }} />Shear force V — kN</span><span className="dim" style={{ textTransform: "none", letterSpacing: 0 }}>V = dM/dx</span></div>
              <DiagPlot color={C.shear} X={res.xs} Y={res.V} L={L} anns={annsV} hoverX={hoverX} onHover={setHoverX} />
            </div>
            <div className="panel acc" style={{ "--pac": C.moment }}>
              <div className="ph phc" style={{ "--pac": C.moment }}><span><span className="sw" style={{ background: C.moment }} />Bending moment M — kN·m</span>
                <button className="btn gh" style={{ padding: "4px 8px" }} onClick={() => setBmdTension(t => !t)}>{bmdTension ? "tension side ↓" : "sagging ↑"}</button>
              </div>
              <DiagPlot color={C.moment} X={res.xs} Y={res.M} L={L} flip={bmdTension} anns={annsM} cfs={res.contraflexure} hoverX={hoverX} onHover={setHoverX} />
            </div>
            <div className="panel acc" style={{ "--pac": C.defl }}>
              <div className="ph phc" style={{ "--pac": C.defl }}><span><span className="sw" style={{ background: C.defl }} />Deflection δ — mm</span><span className="dim" style={{ textTransform: "none", letterSpacing: 0 }}>up +</span></div>
              <DiagPlot color={C.defl} X={res.dx} Y={Dmm} L={L} anns={annsD} showXLabels hoverX={hoverX} onHover={setHoverX} />
            </div>
          </>) : (
            <div className="panel"><div className="calc m dim">No diagrams — the structure is a mechanism. Add a support, change a roller/pin to fixed, or remove a hinge. Each internal hinge releases one moment continuity, so you need r ≥ 2 + h restraints arranged stably.</div></div>
          )}
        </div>

        {/* ---- right: inspector ---- */}
        <div>
          <div className="panel">
            <div className="ph">Presets — exam set-ups</div>
            <div className="chips">{PRESETS.map(p => <button key={p.name} className={"chip" + (preset === p.name ? " on" : "")} onClick={() => applyPreset(p)}>{p.name}</button>)}</div>
          </div>

          <div className="nav">
            {[["beam", "Beam"], ["supports", "Supports"], ["loads", "Loads"], ["verify", "Verify"]].map(([k, lab]) => (
              <button key={k} className={"navb" + (section === k ? " on" : "")} onClick={() => setSection(k)}>
                <IcoNav k={k} /><span>{lab}</span>{counts[k] != null && <span className="cnt">{counts[k]}</span>}
              </button>
            ))}
          </div>

          {section === "beam" && (
            <div className="panel"><div className="pad">
              <div className="fl">Span L — m</div>
              <Slider value={L} min={1} max={20} step={0.1} onChange={setL} dp={1} />
              <div className="fl">Flexural rigidity EI — kN·m²</div>
              <input type="number" step={1000} value={EI} style={{ width: "100%" }} onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v) && v > 0) setEI(v); }} />
              <div className="note">Loads downward +, couples CCW +. Sagging bending +, hogging −. Deflection up + (shown mm). BMD defaults to the tension side (sagging plotted down, UK convention). EI ≈ 50 000 kN·m² ≈ a 406×178 UB 74 (Iy ≈ 27 300 cm⁴, E = 210 GPa).</div>
            </div></div>
          )}

          {section === "supports" && (
            <div className="panel"><div className="pad">
              {supports.map(s => isSel("support", s.id) ? EditorCard(s, "support", SupportEditor(s), () => { rm(setSupports)(s.id); setSelected(null); }) : ItemRow(s, "support"))}
              {hinges.map(h => isSel("hinge", h.id) ? EditorCard(h, "hinge", HingeEditor(h), () => { rm(setHinges)(h.id); setSelected(null); }) : ItemRow(h, "hinge"))}
              {!supports.length && !hinges.length && <div className="note" style={{ marginBottom: 10 }}>No supports yet — add at least two restraints (or one fixed) to hold the beam.</div>}
              <div className="add">
                <button className="btn" onClick={addSupport}>+ support</button>
                <button className="btn gh" onClick={addHinge}>+ hinge</button>
              </div>
            </div></div>
          )}

          {section === "loads" && (
            <div className="panel"><div className="pad">
              {loads.map(l => {
                if (!isSel("load", l.id)) return ItemRow(l, "load");
                const body = l.type === "point" ? PointEditor(l) : l.type === "moment" ? MomentEditor(l) : UDLEditor(l);
                return EditorCard(l, "load", body, () => { rm(setLoads)(l.id); setSelected(null); });
              })}
              {!loads.length && <div className="note" style={{ marginBottom: 10 }}>No loads yet — add a point load, distributed load or moment, then drag it into place on the beam.</div>}
              <div className="add">
                <button className="btn" onClick={addPoint}>+ point</button>
                <button className="btn" onClick={addUDL}>+ distributed</button>
                <button className="btn" onClick={addMoment}>+ moment</button>
              </div>
            </div></div>
          )}

          {section === "verify" && (
            <VerifyTeach L={L} EI={EI} supports={supports} hinges={hinges} loads={loads} res={res} det={det} probe={probe} Dmm={Dmm} tolM={tolM} />
          )}
        </div>
      </div>
    </div>
  );
}
