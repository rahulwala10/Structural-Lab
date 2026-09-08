/**
 * Beam solver — 1D Euler-Bernoulli, direct stiffness, with exact statics
 * post-processing for V(x) and M(x) (so discontinuities stay sharp).
 *
 * Units: m, kN, kN·m; EI in kN·m². Loads: downward positive.
 * Conventions: sagging M positive, deflection v positive upward.
 * Supports internal hinges (moment releases).
 */
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
  // Two supports at the same point would double-restrain one DOF and corrupt the
  // reaction split. Keep the stiffer one (fixed beats pin/roller). This guard lives
  // here, not in the UI, so the engine is safe when imported on its own.
  const rawSup = (cfg.supports || []).map(s => ({ ...s, x: clamp(s.x, 0, L) }));
  const supports = [];
  [...rawSup].sort((a, b) => (a.type === "fixed" ? -1 : 1) - (b.type === "fixed" ? -1 : 1))
    .forEach(s => { if (!supports.some(o => Math.abs(o.x - s.x) < 1e-6)) supports.push(s); });
  supports.sort((a, b) => a.x - b.x);
  // hinges may arrive as numbers or as {x} records
  const hinges = (cfg.hinges || [])
    .map(h => (h && typeof h === "object" ? h.x : h))
    .map(h => clamp(Number(h), 0, L))
    .filter(h => isFinite(h) && h > 1e-6 && h < L - 1e-6);
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

/* ---- pure derivations used by the teaching layer ---- */

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


export { clamp, analyzeBeam, fmt, mkProbe, activeLoads, detectStandard, workedStatics, PRESETS as BEAM_PRESETS, withIds, uid as beamUid, patchCentroid, deriveReactions, buildShearWalk, arrExtrema };
