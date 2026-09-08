/* ============================================================
   2D PLANE FRAME v2 — direct stiffness
   Adds, over v1:
     • per-member EI / EA           (relative stiffness studies)
     • member end moment releases   (internal hinges, 3-pinned frames)
     • support settlement           (prescribed displacements)
     • spring supports kx, ky, kr   (flexible restraint)
     • partial + trapezoidal UDL    (w1..w2 over t1..t2)
     • point moment on a member
   Conventions: global X right +, Y up +, theta CCW +.
   Internal: axial tension +, bending sagging +.
   ============================================================ */

export function gauss(Ain, bin) {
  const n = bin.length;
  const A = Ain.map((r, i) => [...r, bin[i]]);
  const pivots = [];
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) { const v = Math.abs(A[r][col]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-12) return null;
    if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
    const d = A[col][col]; pivots.push(Math.abs(d));
    for (let r = 0; r < n; r++) { if (r === col) continue; const f = A[r][col] / d; if (f === 0) continue; for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c]; }
  }
  let mx = 0, mn = Infinity;
  for (const v of pivots) { if (v > mx) mx = v; if (v < mn) mn = v; }
  if (mn < 1e-12 * mx) return null;
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = A[i][n] / A[i][i];
  return x;
}

function kLocal(EA, EI, L) {
  const a = EA / L, b = 12 * EI / L ** 3, c = 6 * EI / L ** 2, d = 4 * EI / L, e = 2 * EI / L;
  return [[a, 0, 0, -a, 0, 0], [0, b, c, 0, -b, c], [0, c, d, 0, -c, e], [-a, 0, 0, a, 0, 0], [0, -b, -c, 0, b, -c], [0, c, e, 0, -c, d]];
}
function tMat(c, s) { return [[c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]]; }
const matT = M => M[0].map((_, j) => M.map(r => r[j]));
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, _v, k) => s + r[k] * B[k][j], 0)));
const mv = (A, v) => A.map(r => r.reduce((s, x, k) => s + x * v[k], 0));

/* fixed-end forces for a LINEARLY VARYING transverse load q1->q2 and axial p1->p2 */
function fefLin(q1, q2, p1, p2, L) {
  return [
    L * (2 * p1 + p2) / 6,
    L * (7 * q1 + 3 * q2) / 20,
    L * L * (3 * q1 + 2 * q2) / 60,
    L * (p1 + 2 * p2) / 6,
    L * (3 * q1 + 7 * q2) / 20,
    -L * L * (2 * q1 + 3 * q2) / 60,
  ];
}

/* static condensation for released local DOFs (moment releases).
   Returns condensed k & f (full 6x6 / 6x1 with zeros in released rows/cols)
   plus X,y so the released DOF value can be recovered:  u_r = y - X·u_keep  */
function condense(k, f, rel) {
  if (!rel || rel.length === 0) return { k, f, rel: [] };
  const keep = [0, 1, 2, 3, 4, 5].filter(i => rel.indexOf(i) < 0);
  const nr = rel.length;
  const krr = rel.map(i => rel.map(j => k[i][j]));
  const krk = rel.map(i => keep.map(j => k[i][j]));
  const fr = rel.map(i => f[i]);
  let inv;
  if (nr === 1) { if (Math.abs(krr[0][0]) < 1e-14) return { k, f, rel: [] }; inv = [[1 / krr[0][0]]]; }
  else { const d = krr[0][0] * krr[1][1] - krr[0][1] * krr[1][0]; if (Math.abs(d) < 1e-14) return { k, f, rel: [] }; inv = [[krr[1][1] / d, -krr[0][1] / d], [-krr[1][0] / d, krr[0][0] / d]]; }
  const X = inv.map(row => keep.map((_, c) => row.reduce((s, v, ri) => s + v * krk[ri][c], 0)));
  const y = inv.map(row => row.reduce((s, v, ri) => s + v * fr[ri], 0));
  const kc = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const fc = new Array(6).fill(0);
  keep.forEach((gi, a) => {
    fc[gi] = f[gi] - rel.reduce((s, rj, r) => s + k[gi][rj] * y[r], 0);
    keep.forEach((gj, b) => { kc[gi][gj] = k[gi][gj] - rel.reduce((s, rj, r) => s + k[gi][rj] * X[r][b], 0); });
  });
  return { k: kc, f: fc, X, y, keep, rel };
}

export function analyzeFrame(model) {
  const EA0 = model.EA == null ? 2e6 : model.EA;
  const EI0 = model.EI == null ? 2e4 : model.EI;
  const SUB = model.sub || 10;
  const un = model.nodes;
  if (!un || un.length < 2 || !model.members || model.members.length < 1) return { stable: false, SI: 0, reason: "Add at least two nodes and one member." };
  const idIndex = {}; un.forEach((nd, i) => { idIndex[nd.id] = i; });

  const mesh = { x: [], y: [] };
  const key = (x, y) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
  const meshIndex = {};
  const addNode = (x, y) => { const k = key(x, y); if (k in meshIndex) return meshIndex[k]; const id = mesh.x.length; mesh.x.push(x); mesh.y.push(y); meshIndex[k] = id; return id; };
  un.forEach(nd => addNode(nd.x, nd.y));

  const memberLoads = (model.loads || []).filter(l => l.type === "udl" || l.type === "mpoint");
  const nodeLoads = (model.loads || []).filter(l => l.type === "node");
  const meshPointLoads = [];
  const subEls = [];

  const memberMeta = model.members.map((mb, mi) => {
    const i1 = idIndex[mb.n1], i2 = idIndex[mb.n2];
    if (i1 == null || i2 == null) return null;
    const x1 = un[i1].x, y1 = un[i1].y, x2 = un[i2].x, y2 = un[i2].y;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (L < 1e-9) return null;
    const c = dx / L, s = dy / L;
    const EI = mb.EI == null ? EI0 : mb.EI;
    const EA = mb.EA == null ? EA0 : mb.EA;
    const udls = memberLoads.filter(l => l.type === "udl" && l.member === mb.id).map(l => ({
      ta: l.t1 == null ? 0 : l.t1, tb: l.t2 == null ? 1 : l.t2,
      wa: l.w || 0, wb: (l.w2 == null ? l.w : l.w2) || 0, dir: l.dir,
    }));
    const pts = memberLoads.filter(l => l.type === "mpoint" && l.member === mb.id).map(l => ({
      a: (l.t == null ? 0.5 : l.t) * L, fx: l.Fx || 0, fy: l.Fy || 0, mz: l.M || 0,
    }));
    return { id: mb.id, mi, i1, i2, x1, y1, x2, y2, dx, dy, L, c, s, EI, EA, udls, pts, rel1: !!mb.rel1, rel2: !!mb.rel2 };
  }).filter(Boolean);

  memberMeta.forEach(M => {
    const stations = new Set();
    for (let k = 0; k <= SUB; k++) stations.add(+(k / SUB).toFixed(6));
    M.udls.forEach(u => { stations.add(+u.ta.toFixed(6)); stations.add(+u.tb.toFixed(6)); });
    M.pts.forEach(pt => stations.add(+(pt.a / M.L).toFixed(6)));
    const ts = [...stations].filter(t => t >= -1e-9 && t <= 1 + 1e-9).sort((x, y) => x - y);
    M.subNodes = ts.map(t => addNode(M.x1 + M.dx * t, M.y1 + M.dy * t));
    M.ts = ts;
    M.pts.forEach(pt => { const id = addNode(M.x1 + M.dx * (pt.a / M.L), M.y1 + M.dy * (pt.a / M.L)); meshPointLoads.push({ node: id, fx: pt.fx, fy: pt.fy, mz: pt.mz }); });
    const nSub = ts.length - 1;
    for (let e = 0; e < nSub; e++) {
      const t0 = ts[e], t1 = ts[e + 1], tm = (t0 + t1) / 2;
      const Le = (t1 - t0) * M.L;
      let q1 = 0, q2 = 0, p1 = 0, p2 = 0;
      M.udls.forEach(u => {
        if (tm < u.ta - 1e-9 || tm > u.tb + 1e-9) return;
        const den = (u.tb - u.ta) || 1;
        const wA = u.wa + (u.wb - u.wa) * ((t0 - u.ta) / den);
        const wB = u.wa + (u.wb - u.wa) * ((t1 - u.ta) / den);
        if (u.dir === "grav") { p1 += -wA * M.s; q1 += -wA * M.c; p2 += -wB * M.s; q2 += -wB * M.c; }
        else { q1 += wA; q2 += wB; }
      });
      subEls.push({
        mi: M.mi, M, a: M.subNodes[e], b: M.subNodes[e + 1], Le, c: M.c, s: M.s,
        q1, q2, p1, p2, t0, t1, EI: M.EI, EA: M.EA,
        relLocal: [].concat(e === 0 && M.rel1 ? [2] : [], e === nSub - 1 && M.rel2 ? [5] : []),
      });
    }
  });

  const N = mesh.x.length, ND = 3 * N;
  const K = Array.from({ length: ND }, () => new Array(ND).fill(0));
  const P = new Array(ND).fill(0);

  subEls.forEach(el => {
    const k0 = kLocal(el.EA, el.EI, el.Le);
    const f0 = (el.q1 || el.q2 || el.p1 || el.p2) ? fefLin(el.q1, el.q2, el.p1, el.p2, el.Le) : [0, 0, 0, 0, 0, 0];
    const cd = condense(k0, f0, el.relLocal);
    el.k0 = k0; el.f0 = f0; el.cd = cd;
    const T = tMat(el.c, el.s);
    const kg = mul(mul(matT(T), cd.k), T);
    const map = [3 * el.a, 3 * el.a + 1, 3 * el.a + 2, 3 * el.b, 3 * el.b + 1, 3 * el.b + 2];
    el.map = map; el.T = T;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) K[map[i]][map[j]] += kg[i][j];
    if (cd.f.some(v => v !== 0)) { const fg = mv(matT(T), cd.f); for (let i = 0; i < 6; i++) P[map[i]] += fg[i]; }
  });

  nodeLoads.forEach(l => { const ix = idIndex[l.node]; if (ix == null) return; const mi = meshIndex[key(un[ix].x, un[ix].y)]; P[3 * mi] += l.Fx || 0; P[3 * mi + 1] += l.Fy || 0; P[3 * mi + 2] += l.M || 0; });
  meshPointLoads.forEach(pl => { P[3 * pl.node] += pl.fx; P[3 * pl.node + 1] += pl.fy; P[3 * pl.node + 2] += pl.mz || 0; });

  /* ---- restraints: rigid, prescribed settlement, springs ---- */
  const fixed = new Array(ND).fill(false);
  const pres = new Array(ND).fill(0);
  const springs = [];
  let rCount = 0;
  (model.supports || []).forEach(sp => {
    const ix = idIndex[sp.node]; if (ix == null) return;
    const mi = meshIndex[key(un[ix].x, un[ix].y)];
    const setF = (d, val) => { if (!fixed[d]) rCount++; fixed[d] = true; pres[d] = val || 0; };
    if (sp.type === "fixed") { setF(3 * mi, sp.dx); setF(3 * mi + 1, sp.dy); setF(3 * mi + 2, sp.rz); }
    else if (sp.type === "pin") { setF(3 * mi, sp.dx); setF(3 * mi + 1, sp.dy); }
    else if (sp.type === "rollerV") { setF(3 * mi + 1, sp.dy); }
    else if (sp.type === "rollerH") { setF(3 * mi, sp.dx); }
    else if (sp.type === "guided") { setF(3 * mi, sp.dx); setF(3 * mi + 2, sp.rz); } // slides vertically, no rotation
    // springs on DOFs not rigidly held
    const addSpring = (d, k) => { if (k && k > 0 && !fixed[d]) { K[d][d] += k; springs.push({ dof: d, k, node: sp.node }); rCount++; } };
    addSpring(3 * mi, sp.kx); addSpring(3 * mi + 1, sp.ky); addSpring(3 * mi + 2, sp.kr);
  });

  /* fully-hinged joints leave a rotational DOF with no stiffness — harmless, so hold it */
  let dScale = 0; for (let i = 0; i < ND; i++) dScale = Math.max(dScale, Math.abs(K[i][i]));
  for (let i = 2; i < ND; i += 3) {
    if (!fixed[i] && Math.abs(K[i][i]) < 1e-10 * dScale) {
      if (Math.abs(P[i]) > 1e-9) return { stable: false, SI: 0, reason: "A moment is applied at a joint where every member is pinned — that joint just spins (mechanism)." };
      fixed[i] = true; pres[i] = 0;
    }
  }

  /* Independent releases only. A hinge is only a real extra condition if there was
     moment continuity to break: at a node with k member-ends and rotational restraint
     f (0/1), at most (k − 1 + f) independent releases exist. Releasing a member end
     that already sits on a pin adds nothing. Orphan nodes (no valid member) are
     excluded so a stray duplicate node cannot skew the count. */
  const endsAt = {}, relAt = {}, usedNode = {};
  memberMeta.forEach(M => {
    const a = model.members[M.mi].n1, b = model.members[M.mi].n2;
    endsAt[a] = (endsAt[a] || 0) + 1; endsAt[b] = (endsAt[b] || 0) + 1;
    usedNode[a] = usedNode[b] = true;
    if (M.rel1) relAt[a] = (relAt[a] || 0) + 1;
    if (M.rel2) relAt[b] = (relAt[b] || 0) + 1;
  });
  const rotHeld = {};
  (model.supports || []).forEach(sp => { if (sp.type === "fixed" || sp.type === "guided" || sp.kr) rotHeld[sp.node] = true; });
  let releases = 0;
  Object.keys(relAt).forEach(nd => {
    const k = endsAt[nd] || 0, f = rotHeld[nd] ? 1 : 0;
    releases += Math.min(relAt[nd], Math.max(0, k - 1 + f));
  });
  const nUsed = un.filter(nd => usedNode[nd.id]).length;
  const SI = 3 * memberMeta.length + rCount - 3 * nUsed - releases;

  const freeDofs = []; for (let i = 0; i < ND; i++) if (!fixed[i]) freeDofs.push(i);
  const nf = freeDofs.length;
  const Kff = Array.from({ length: nf }, () => new Array(nf).fill(0));
  const Pf = new Array(nf).fill(0);
  const anyPres = pres.some(v => v !== 0);
  for (let a = 0; a < nf; a++) {
    let rhs = P[freeDofs[a]];
    if (anyPres) for (let d = 0; d < ND; d++) if (fixed[d] && pres[d] !== 0) rhs -= K[freeDofs[a]][d] * pres[d];
    Pf[a] = rhs;
    const row = K[freeDofs[a]];
    for (let b = 0; b < nf; b++) Kff[a][b] = row[freeDofs[b]];
  }
  const uf = gauss(Kff, Pf);
  if (!uf) return { stable: false, SI, reason: SI < 0 ? "Too few restraints or too many releases — this is a mechanism." : "Unstable geometry — an unrestrained sway or rotation mechanism." };
  const U = new Array(ND).fill(0);
  for (let d = 0; d < ND; d++) if (fixed[d]) U[d] = pres[d];
  freeDofs.forEach((d, i) => { U[d] = uf[i]; });

  /* ---- reactions ---- */
  const reactions = (model.supports || []).map(sp => {
    const ix = idIndex[sp.node]; if (ix == null) return null;
    const mi = meshIndex[key(un[ix].x, un[ix].y)];
    const rig = d => fixed[d] ? (K[d].reduce((s, k, j) => s + k * U[j], 0) - P[d]) : 0;
    let Rx = rig(3 * mi), Ry = rig(3 * mi + 1), Mr = rig(3 * mi + 2);
    springs.filter(s => s.dof === 3 * mi).forEach(s => { Rx += -s.k * U[s.dof]; });
    springs.filter(s => s.dof === 3 * mi + 1).forEach(s => { Ry += -s.k * U[s.dof]; });
    springs.filter(s => s.dof === 3 * mi + 2).forEach(s => { Mr += -s.k * U[s.dof]; });
    return { node: sp.node, type: sp.type, Rx, Ry, M: Mr, settled: !!(sp.dx || sp.dy || sp.rz), spring: !!(sp.kx || sp.ky || sp.kr) };
  }).filter(Boolean);

  /* ---- member internal forces & deflected shape ---- */
  const members = memberMeta.map(M => {
    const samples = [], defl = [];
    const subs = subEls.filter(e => e.mi === M.mi).sort((a, b) => a.t0 - b.t0);
    subs.forEach((el, ei) => {
      const Ue = el.map.map(d => U[d]);
      let ul = mv(el.T, Ue);
      // recover released rotation so end forces & shape are exact
      if (el.cd.rel && el.cd.rel.length) {
        const uk = el.cd.keep.map(i => ul[i]);
        el.cd.rel.forEach((rd, r) => { ul[rd] = el.cd.y[r] - el.cd.X[r].reduce((s, v, c2) => s + v * uk[c2], 0); });
      }
      const sl = mv(el.k0, ul).map((v, i) => v - el.f0[i]);
      const Ni = -sl[0], Vi = sl[1], Mi = -sl[2];
      const Le = el.Le, q1 = el.q1, q2 = el.q2, p1 = el.p1, p2 = el.p2;
      const nIn = 4;
      for (let kk = 0; kk <= nIn; kk++) {
        const x = Le * kk / nIn;
        const sG = (el.t0 + (el.t1 - el.t0) * (kk / nIn)) * M.L;
        const Vx = Vi + q1 * x + (q2 - q1) * x * x / (2 * Le);
        const Mx = Mi + Vi * x + q1 * x * x / 2 + (q2 - q1) * x * x * x / (6 * Le);
        const Nx = Ni - (p1 * x + (p2 - p1) * x * x / (2 * Le));
        if (!(ei > 0 && kk === 0)) samples.push({ s: sG, N: Nx, V: Vx, M: Mx });
      }
      const nD = 6;
      for (let kk = 0; kk <= nD; kk++) {
        if (ei > 0 && kk === 0) continue;
        const t = kk / nD;
        const N1 = 1 - 3 * t * t + 2 * t ** 3, N2 = Le * (t - 2 * t * t + t ** 3), N3 = 3 * t * t - 2 * t ** 3, N4 = Le * (t ** 3 - t * t);
        const vLoc = N1 * ul[1] + N2 * ul[2] + N3 * ul[4] + N4 * ul[5];
        const uLoc = ul[0] * (1 - t) + ul[3] * t;
        defl.push({
          x: M.x1 + M.dx * (el.t0 + (el.t1 - el.t0) * t),
          y: M.y1 + M.dy * (el.t0 + (el.t1 - el.t0) * t),
          ux: el.c * uLoc - el.s * vLoc, uy: el.s * uLoc + el.c * vLoc,
        });
      }
    });
    return { id: M.id, mi: M.mi, L: M.L, samples, defl, x1: M.x1, y1: M.y1, x2: M.x2, y2: M.y2, c: M.c, s: M.s, n1: model.members[M.mi].n1, n2: model.members[M.mi].n2, EI: M.EI, EA: M.EA, rel1: M.rel1, rel2: M.rel2 };
  });

  let Mmax = 0, Mmin = 0, Vmax = 0, Vmin = 0, Nmax = 0, Nmin = 0, dmax = 0;
  members.forEach(mb => {
    mb.samples.forEach(p => { Mmax = Math.max(Mmax, p.M); Mmin = Math.min(Mmin, p.M); Vmax = Math.max(Vmax, p.V); Vmin = Math.min(Vmin, p.V); Nmax = Math.max(Nmax, p.N); Nmin = Math.min(Nmin, p.N); });
    mb.defl.forEach(d => { dmax = Math.max(dmax, Math.hypot(d.ux, d.uy)); });
  });

  /* ---- equilibrium self-check (exact resultants) ---- */
  let sumFx = 0, sumFy = 0, sumM = 0;
  nodeLoads.forEach(l => { const ix = idIndex[l.node]; if (ix == null) return; sumFx += l.Fx || 0; sumFy += l.Fy || 0; sumM += (l.M || 0) + un[ix].x * (l.Fy || 0) - un[ix].y * (l.Fx || 0); });
  memberMeta.forEach(M => {
    M.pts.forEach(pt => { const px = M.x1 + M.dx * (pt.a / M.L), py = M.y1 + M.dy * (pt.a / M.L); sumFx += pt.fx; sumFy += pt.fy; sumM += (pt.mz || 0) + px * pt.fy - py * pt.fx; });
  });
  subEls.forEach(el => {
    const M = el.M, Le = el.Le;
    const Rq = Le * (el.q1 + el.q2) / 2, Sq = Le * Le * (el.q1 / 6 + el.q2 / 3);
    const Rp = Le * (el.p1 + el.p2) / 2;
    if (Rq === 0 && Rp === 0 && Sq === 0) return;
    const bx = M.x1 + M.dx * el.t0, by = M.y1 + M.dy * el.t0;
    sumFx += -M.s * Rq + M.c * Rp;
    sumFy += M.c * Rq + M.s * Rp;
    sumM += (bx * M.c + by * M.s) * Rq + Sq + (bx * M.s - by * M.c) * Rp;
  });
  let Rx = 0, Ry = 0, Rm = 0;
  reactions.forEach(rc => { const ix = idIndex[rc.node]; Rx += rc.Rx; Ry += rc.Ry; Rm += rc.M + un[ix].x * rc.Ry - un[ix].y * rc.Rx; });
  const eqOK = Math.abs(sumFx + Rx) < 1e-3 * (Math.abs(sumFx) + 1) + 1e-5
    && Math.abs(sumFy + Ry) < 1e-3 * (Math.abs(sumFy) + 1) + 1e-5
    && Math.abs(sumM + Rm) < 1e-2 * (Math.abs(sumM) + 1) + 1e-4;

  return {
    stable: true, SI, EA: EA0, EI: EI0, releases, rCount, nUsed,
    nodes: un.map(nd => { const mi = meshIndex[key(nd.x, nd.y)]; return { id: nd.id, x: nd.x, y: nd.y, ux: U[3 * mi], uy: U[3 * mi + 1], th: U[3 * mi + 2] }; }),
    members, reactions, Mmax, Mmin, Vmax, Vmin, Nmax, Nmin, dmax,
    appliedFx: sumFx, appliedFy: sumFy, reacFx: Rx, reacFy: Ry, eqOK,
  };
}
