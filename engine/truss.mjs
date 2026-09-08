import { gauss } from './frame.mjs';


/* ---------------- TRUSS ENGINE — pin-jointed, axial only ---------------- */
export function analyzeTruss(model) {
  const EA0 = model.EA == null ? 2e6 : model.EA;
  const un = model.nodes;
  if (!un || un.length < 2 || !model.members || model.members.length < 1) return { stable: false, SI: 0, reason: "Add at least two joints and one member.", truss: true };
  const idx = {}; un.forEach((n, i) => { idx[n.id] = i; });
  const nn = un.length, ND = 2 * nn;
  const K = Array.from({ length: ND }, () => new Array(ND).fill(0));
  const P = new Array(ND).fill(0);
  const mem = model.members.map(mb => {
    const i = idx[mb.n1], j = idx[mb.n2]; if (i == null || j == null) return null;
    const x1 = un[i].x, y1 = un[i].y, x2 = un[j].x, y2 = un[j].y;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (L < 1e-9) return null;
    const c = dx / L, s = dy / L, k = (mb.EA == null ? EA0 : mb.EA) / L;
    const map = [2 * i, 2 * i + 1, 2 * j, 2 * j + 1];
    const ke = [[c * c, c * s, -c * c, -c * s], [c * s, s * s, -c * s, -s * s], [-c * c, -c * s, c * c, c * s], [-c * s, -s * s, c * s, s * s]].map(row => row.map(v => v * k));
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[map[a]][map[b]] += ke[a][b];
    return { id: mb.id, x1, y1, x2, y2, dx, dy, L, c, s, k, map, n1: mb.n1, n2: mb.n2 };
  }).filter(Boolean);
  (model.loads || []).filter(l => l.type === "node").forEach(l => { const i = idx[l.node]; if (i == null) return; P[2 * i] += l.Fx || 0; P[2 * i + 1] += l.Fy || 0; });
  const fixed = new Array(ND).fill(false), pres = new Array(ND).fill(0);
  const springs = []; let rCount = 0;
  (model.supports || []).forEach(sp => {
    const i = idx[sp.node]; if (i == null) return;
    const setF = (d, v) => { if (!fixed[d]) rCount++; fixed[d] = true; pres[d] = v || 0; };
    if (sp.type === "pin" || sp.type === "fixed") { setF(2 * i, sp.dx); setF(2 * i + 1, sp.dy); }
    else if (sp.type === "rollerV") setF(2 * i + 1, sp.dy);
    else if (sp.type === "rollerH") setF(2 * i, sp.dx);
    const addSpring = (d, k) => { if (k && k > 0 && !fixed[d]) { K[d][d] += k; springs.push({ dof: d, k }); rCount++; } };
    addSpring(2 * i, sp.kx); addSpring(2 * i + 1, sp.ky);
  });
  const SI = mem.length + rCount - 2 * nn;
  const free = []; for (let i = 0; i < ND; i++) if (!fixed[i]) free.push(i);
  const nf = free.length;
  const Kff = Array.from({ length: nf }, () => new Array(nf).fill(0));
  const Pf = new Array(nf).fill(0);
  const anyPres = pres.some(v => v !== 0);
  for (let a = 0; a < nf; a++) {
    let rhs = P[free[a]];
    if (anyPres) for (let d = 0; d < ND; d++) if (fixed[d] && pres[d] !== 0) rhs -= K[free[a]][d] * pres[d];
    Pf[a] = rhs;
    for (let b = 0; b < nf; b++) Kff[a][b] = K[free[a]][free[b]];
  }
  const uf = gauss(Kff, Pf);
  if (!uf) return { stable: false, SI, reason: SI < 0 ? "Too few members or restraints — the truss is a mechanism (m + r < 2n). Every panel needs triangulating." : "Unstable geometry — a joint or panel can move freely. Look for an untriangulated square panel.", truss: true };
  const U = new Array(ND).fill(0);
  for (let d = 0; d < ND; d++) if (fixed[d]) U[d] = pres[d];
  free.forEach((d, i) => { U[d] = uf[i]; });
  const reactions = (model.supports || []).map(sp => {
    const i = idx[sp.node]; if (i == null) return null;
    const rig = d => fixed[d] ? (K[d].reduce((s, k, c2) => s + k * U[c2], 0) - P[d]) : 0;
    let Rx = rig(2 * i), Ry = rig(2 * i + 1);
    springs.filter(s => s.dof === 2 * i).forEach(s => { Rx += -s.k * U[s.dof]; });
    springs.filter(s => s.dof === 2 * i + 1).forEach(s => { Ry += -s.k * U[s.dof]; });
    return { node: sp.node, type: sp.type, Rx, Ry, M: 0, settled: !!(sp.dx || sp.dy), spring: !!(sp.kx || sp.ky) };
  }).filter(Boolean);
  const members = mem.map(M => {
    const u1x = U[M.map[0]], u1y = U[M.map[1]], u2x = U[M.map[2]], u2y = U[M.map[3]];
    const axial = M.k * (M.c * (u2x - u1x) + M.s * (u2y - u1y));
    const defl = []; for (let t = 0; t <= 1.0001; t += 0.25) defl.push({ x: M.x1 + M.dx * t, y: M.y1 + M.dy * t, ux: u1x + (u2x - u1x) * t, uy: u1y + (u2y - u1y) * t });
    return { id: M.id, n1: M.n1, n2: M.n2, x1: M.x1, y1: M.y1, x2: M.x2, y2: M.y2, c: M.c, s: M.s, L: M.L, axial, samples: [{ s: 0, N: axial, V: 0, M: 0 }, { s: M.L, N: axial, V: 0, M: 0 }], defl };
  });
  let Nmax = 0, Nmin = 0, dmax = 0;
  members.forEach(mb => { Nmax = Math.max(Nmax, mb.axial); Nmin = Math.min(Nmin, mb.axial); });
  un.forEach((n, i) => { dmax = Math.max(dmax, Math.hypot(U[2 * i], U[2 * i + 1])); });
  let sumFx = 0, sumFy = 0;
  (model.loads || []).filter(l => l.type === "node").forEach(l => { sumFx += l.Fx || 0; sumFy += l.Fy || 0; });
  let Rx = 0, Ry = 0; reactions.forEach(rc => { Rx += rc.Rx; Ry += rc.Ry; });
  const eqOK = Math.abs(sumFx + Rx) < 1e-3 * (Math.abs(sumFx) + 1) + 1e-5 && Math.abs(sumFy + Ry) < 1e-3 * (Math.abs(sumFy) + 1) + 1e-5;
  return {
    stable: true, SI, EA: EA0, truss: true, releases: 0,
    nodes: un.map((n, i) => ({ id: n.id, x: n.x, y: n.y, ux: U[2 * i], uy: U[2 * i + 1], th: 0 })),
    members, reactions, Nmax, Nmin, Vmax: 0, Vmin: 0, Mmax: 0, Mmin: 0, dmax,
    appliedFx: sumFx, appliedFy: sumFy, reacFx: Rx, reacFy: Ry, eqOK,
  };
}

