/** Closed-form verification of the frame solver. */
import { analyzeFrame, analyzeBeam, mkProbe } from '../index.mjs';
const EI = 2e4, EA = 2e6;
let fails = 0;
const near = (a, b, tol, l) => { const ok = Math.abs(a - b) <= tol; if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}: got ${a.toFixed(4)} exp ${b.toFixed(4)}`); };
const mx = (m, k) => Math.max(...m.samples.map(p => p[k]));
const mn = (m, k) => Math.min(...m.samples.map(p => p[k]));
const R = (r, n) => r.reactions.find(x => x.node === n);

console.log('=== REGRESSION: v1 closed forms still hold ===');
{
  const L = 6, w = 12;
  const r = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav' }] });
  near(mx(r.members[0], 'M'), w * L * L / 8, 0.02, 'SS UDL  M=wL²/8');
  const mid = r.members[0].defl.reduce((a, d) => Math.abs(d.x - L / 2) < Math.abs(a.x - L / 2) ? d : a);
  near(mid.uy * 1000, -5 * w * L ** 4 / (384 * EI) * 1000, 0.05, 'SS UDL  δ=5wL⁴/384EI');
  const r2 = analyzeFrame({ EI, EA, sub: 16, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'fixed' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav' }] });
  near(Math.abs(R(r2, 'A').M), w * L * L / 12, 0.05, 'F-F UDL  M_end=wL²/12');
  const r3 = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 4 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'fixed' }], loads: [{ type: 'node', node: 'B', Fx: 10 }] });
  near(r3.nodes[1].ux * 1000, 10 * 64 / (3 * EI) * 1000, 0.05, 'cantilever  δ=PH³/3EI');
}

console.log('\n=== A. MEMBER END RELEASES (internal hinges) ===');
{
  const L = 6, w = 12;
  // fixed-fixed beam but BOTH member ends released => behaves as simply supported
  const r = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B', rel1: true, rel2: true }], supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'fixed' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav' }] });
  near(mx(r.members[0], 'M'), w * L * L / 8, 0.02, 'both ends released → M=wL²/8 (simply supported)');
  near(Math.abs(R(r, 'A').M), 0, 0.02, 'released end carries no moment');
  const mid = r.members[0].defl.reduce((a, d) => Math.abs(d.x - L / 2) < Math.abs(a.x - L / 2) ? d : a);
  near(mid.uy * 1000, -5 * w * L ** 4 / (384 * EI) * 1000, 0.05, 'released shape δ=5wL⁴/384EI');
}
{
  const L = 6, w = 12;
  // propped cantilever formed by releasing one end of a fixed-fixed beam
  const r = analyzeFrame({ EI, EA, sub: 16, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B', rel2: true }], supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'fixed' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav' }] });
  near(Math.abs(R(r, 'A').M), w * L * L / 8, 0.05, 'one end released → M_fix=wL²/8 (propped)');
  near(R(r, 'A').Ry, 5 * w * L / 8, 0.05, 'propped R_fix=5wL/8');
  near(R(r, 'B').Ry, 3 * w * L / 8, 0.05, 'propped R_prop=3wL/8');
}
{
  const L = 8, w = 10;
  // hinge at midspan of a fixed-fixed beam  => each half a cantilever, M_fix = wL²/8
  const r = analyzeFrame({ EI, EA, sub: 12,
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'C', x: L / 2, y: 0 }, { id: 'B', x: L, y: 0 }],
    members: [{ id: 'm1', n1: 'A', n2: 'C' }, { id: 'm2', n1: 'C', n2: 'B', rel1: true }],
    supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'fixed' }],
    loads: [{ type: 'udl', member: 'm1', w, dir: 'grav' }, { type: 'udl', member: 'm2', w, dir: 'grav' }] });
  near(Math.abs(R(r, 'A').M), w * L * L / 8, 0.1, 'hinge at mid → M_fix=wL²/8');
  near(R(r, 'A').Ry, w * L / 2, 0.05, 'R=wL/2 by symmetry');
  const hingeM = Math.abs(r.members[1].samples[0].M);
  near(hingeM, 0, 0.02, 'moment AT the hinge = 0');
  console.log('    SI =', r.SI, '(releases counted:', r.releases, ')');
}

console.log('\n=== A2. INTERNAL HINGES ANYWHERE ALONG A MEMBER ===');
{
  const L = 8, w = 10;
  // one member, hinge at midspan — must match the two-member release version above
  const r = analyzeFrame({ EI, EA, sub: 12, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }],
    hinges: [{ id: 'h', member: 'm', t: 0.5 }],
    supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'fixed' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav' }] });
  near(Math.abs(R(r, 'A').M), w * L * L / 8, 0.1, 'fixed-fixed + hinge at 0.5L → M_fix = wL²/8');
  near(R(r, 'A').Ry, w * L / 2, 0.05, '  R = wL/2');
  const atHinge = r.members[0].samples.reduce((a, p) => Math.abs(p.s - L / 2) < Math.abs(a.s - L / 2) ? p : a);
  near(atHinge.M, 0, 0.02, '  M = 0 at the hinge');
  near(r.SI, 2, 0, '  SI = 3m + r − 3n − releases = 3 + 6 − 6 − 1 = 2');
}
{
  // three-pinned portal made with a hinge inside the beam: H = wL²/8h, M_corner = −H·h
  const Lb = 6, h = 4, w = 15;
  const r = analyzeFrame({ EI, EA,
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: h }, { id: 'C', x: Lb, y: h }, { id: 'D', x: Lb, y: 0 }],
    members: [{ id: 'c1', n1: 'A', n2: 'B' }, { id: 'bm', n1: 'B', n2: 'C' }, { id: 'c2', n1: 'C', n2: 'D' }],
    hinges: [{ id: 'h', member: 'bm', t: 0.5 }],
    supports: [{ node: 'A', type: 'pin' }, { node: 'D', type: 'pin' }], loads: [{ type: 'udl', member: 'bm', w, dir: 'grav' }] });
  near(r.SI, 0, 0, 'portal with beam hinge  SI = 0 (determinate)');
  near(R(r, 'A').Rx, w * Lb * Lb / (8 * h), 0.02, '  thrust H = wL²/8h (inward)');
  near(r.members[1].samples[0].M, -w * Lb * Lb / (8 * h) * h, 0.05, '  corner moment = −H·h (hogging)');
}
{
  // hinge off-centre: right part spans hinge→B, left part is a cantilever carrying the hinge shear
  const L = 10, w = 10, a = 3;
  const r = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }],
    hinges: [{ id: 'h', member: 'm', t: a / L }],
    supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav' }] });
  near(R(r, 'B').Ry, w * (L - a) / 2, 0.02, 'Gerber hinge at 0.3L  R_B = w(L−a)/2');
  near(Math.abs(R(r, 'A').M), w * a * a / 2 + w * (L - a) / 2 * a, 0.05, '  |M_A| = wa²/2 + V_hinge·a');
  near(r.SI, 0, 0, '  determinate');
}
{
  // a hinge in a simply supported span is a mechanism, not a crash
  const r = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }],
    hinges: [{ id: 'h', member: 'm', t: 0.5 }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w: 10, dir: 'grav' }] });
  near(r.stable ? 1 : 0, 0, 0, 'pin + roller + hinge → mechanism reported (stable = false)');
}

console.log('\n=== B. SUPPORT SETTLEMENT ===');
{
  const L = 6, D = 0.01; // 10 mm settlement
  const r = analyzeFrame({ EI, EA, sub: 16, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'fixed', dy: -D }], loads: [] });
  near(Math.abs(R(r, 'A').M), 6 * EI * D / (L * L), 0.2, 'F-F settlement  M=6EIΔ/L²');
  near(Math.abs(R(r, 'A').Ry), 12 * EI * D / (L ** 3), 0.2, 'F-F settlement  V=12EIΔ/L³');
  near(R(r, 'A').Ry + R(r, 'B').Ry, 0, 0.02, 'settlement reactions self-balance (ΣR=0)');
}
{
  const L = 6, D = 0.01;
  const r = analyzeFrame({ EI, EA, sub: 16, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'rollerV', dy: -D }], loads: [] });
  near(Math.abs(R(r, 'B').Ry), 3 * EI * D / (L ** 3), 0.2, 'propped settlement  R=3EIΔ/L³');
  near(Math.abs(R(r, 'A').M), 3 * EI * D / (L * L), 0.2, 'propped settlement  M=3EIΔ/L²');
}

console.log('\n=== C. PER-MEMBER STIFFNESS (relative stiffness) ===');
{
  const h = 4, Lb = 6, H = 20;
  // portal with a flexurally RIGID beam: each column fixed-fixed in sway => M_base = H·h/4
  const r = analyzeFrame({ EI, EA,
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: h }, { id: 'C', x: Lb, y: h }, { id: 'D', x: Lb, y: 0 }],
    members: [{ id: 'c1', n1: 'A', n2: 'B' }, { id: 'bm', n1: 'B', n2: 'C', EI: 2e7 }, { id: 'c2', n1: 'C', n2: 'D' }],
    supports: [{ node: 'A', type: 'fixed' }, { node: 'D', type: 'fixed' }],
    loads: [{ type: 'node', node: 'B', Fx: H }] });
  near(Math.abs(R(r, 'A').M), H * h / 4, 0.6, 'rigid-beam portal  M_base=Hh/4');
  near(r.nodes[1].ux * 1000, H * h ** 3 / (24 * EI) * 1000, 0.15, 'rigid-beam portal sway Δ=Hh³/24EI');
  // a very FLEXIBLE beam instead: columns act as cantilevers => M_base = H·h/2
  const r2 = analyzeFrame({ EI, EA,
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: h }, { id: 'C', x: Lb, y: h }, { id: 'D', x: Lb, y: 0 }],
    members: [{ id: 'c1', n1: 'A', n2: 'B' }, { id: 'bm', n1: 'B', n2: 'C', EI: 2 }, { id: 'c2', n1: 'C', n2: 'D' }],
    supports: [{ node: 'A', type: 'fixed' }, { node: 'D', type: 'fixed' }],
    loads: [{ type: 'node', node: 'B', Fx: H }] });
  near(Math.abs(R(r2, 'A').M) + Math.abs(R(r2, 'D').M), H * h, 1.0, 'pin-beam portal  ΣM_base=Hh (cantilever action)');
  console.log('    stiff-beam base M =', Math.abs(R(r, 'A').M).toFixed(2), ' vs flexible-beam base M =', Math.abs(R(r2, 'A').M).toFixed(2), '← relative stiffness changes the answer');
}

console.log('\n=== D. VARYING & PARTIAL LOADS ===');
{
  const L = 6, w = 12;
  // triangular load 0 -> w on a simply supported beam
  const r = analyzeFrame({ EI, EA, sub: 20, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w: 0, w2: w, dir: 'grav' }] });
  near(R(r, 'A').Ry, w * L / 6, 0.05, 'triangular  R_A=wL/6');
  near(R(r, 'B').Ry, w * L / 3, 0.05, 'triangular  R_B=wL/3');
  near(mx(r.members[0], 'M'), 0.06415 * w * L * L, 0.4, 'triangular  M_max=0.0642wL²');
}
{
  const L = 8, w = 10;
  // UDL over the LEFT HALF only
  const r = analyzeFrame({ EI, EA, sub: 20, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav', t1: 0, t2: 0.5 }] });
  near(R(r, 'A').Ry, 3 * w * L / 8, 0.05, 'half UDL  R_A=3wL/8');
  near(R(r, 'B').Ry, w * L / 8, 0.05, 'half UDL  R_B=wL/8');
}
{
  const L = 6, M0 = 30;
  // point moment at midspan of a simply supported beam
  const r = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'mpoint', member: 'm', t: 0.5, Fx: 0, Fy: 0, M: M0 }] });
  near(Math.abs(R(r, 'A').Ry), M0 / L, 0.05, 'point moment  |R|=M₀/L couple');
  near(Math.max(Math.abs(mx(r.members[0], 'M')), Math.abs(mn(r.members[0], 'M'))), M0 / 2, 0.05, 'point moment  peak |M|=M₀/2');
}

console.log('\n=== E. SPRING SUPPORT ===');
{
  const L = 4, P = 10, k = 500;
  const r = analyzeFrame({ EI, EA, sub: 16, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'fixed' }, { node: 'B', type: 'none', ky: k }], loads: [{ type: 'node', node: 'B', Fy: -P }] });
  const dExp = P / (3 * EI / L ** 3 + k);
  near(Math.abs(r.nodes[1].uy), dExp, 1e-4, 'spring tip  δ=P/(3EI/L³+k)');
  near(Math.abs(R(r, 'B').Ry), k * dExp, 0.05, 'spring force = kδ');
  console.log('    rigid prop would give δ=0; spring gives', (dExp * 1000).toFixed(2), 'mm');
}

console.log('\n=== S. SHEAR SIGN — anticlockwise positive ===');
{
  const L = 6, w = 12;
  const ss = n1 => analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1, n2: n1 === 'A' ? 'B' : 'A' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w, dir: 'grav' }] }).members[0].samples;
  const s = ss('A');
  near(s[0].V, -w * L / 2, 1e-3, 'SS UDL  V at A = −wL/2 (clockwise there)');
  near(s[s.length - 1].V, w * L / 2, 1e-3, 'SS UDL  V at B = +wL/2 (anticlockwise there)');
  // the sign is physical, not tied to member direction: define the member B → A
  const t = ss('B');
  near(t[t.length - 1].V, -w * L / 2, 1e-3, 'member drawn B→A  still V = −wL/2 at A');
  near(t[0].V, w * L / 2, 1e-3, 'member drawn B→A  still V = +wL/2 at B');
}
{
  const H = 4, P = 12;
  const r = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: H }], members: [{ id: 'c', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'fixed' }], loads: [{ type: 'node', node: 'B', Fx: P }] });
  near(mn(r.members[0], 'V'), -P, 1e-3, 'column, tip load →  V = −P (clockwise) ...');
  near(mx(r.members[0], 'V'), -P, 1e-3, '  ...and constant up the column');
}
{
  // the frame and beam solvers agree on the shear sign
  const L = 8, P = 20;
  const f = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: L, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'mpoint', member: 'm', t: 0.5, Fx: 0, Fy: -P, M: 0 }] }).members[0].samples;
  const b = mkProbe(analyzeBeam({ L, EI, supports: [{ x: 0, type: 'pin' }, { x: L, type: 'roller' }], hinges: [], loads: [{ type: 'point', x: L / 2, P }] }));
  near(f[0].V, b.VSide(0, 'R'), 1e-3, 'frame V at A matches the beam solver (−P/2)');
  near(f[f.length - 1].V, b.VSide(L, 'L'), 1e-3, 'frame V at B matches the beam solver (+P/2)');
}
{
  // V = −dM/ds inside every member of a loaded, swaying portal
  const r = analyzeFrame({ EI, EA,
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 4 }, { id: 'C', x: 6, y: 4 }, { id: 'D', x: 6, y: 0 }],
    members: [{ id: 'c1', n1: 'A', n2: 'B' }, { id: 'bm', n1: 'B', n2: 'C' }, { id: 'c2', n1: 'C', n2: 'D' }],
    supports: [{ node: 'A', type: 'fixed' }, { node: 'D', type: 'fixed' }],
    loads: [{ type: 'udl', member: 'bm', w: 15, dir: 'grav' }, { type: 'node', node: 'B', Fx: 20 }] });
  let worst = 0;
  r.members.forEach(mb => mb.samples.slice(1).forEach((q, i) => { const p = mb.samples[i]; worst = Math.max(worst, Math.abs((q.M - p.M) + (p.V + q.V) / 2 * (q.s - p.s))); }));
  near(worst, 0, 1e-6, 'portal  ΔM = −∫V ds in every member (V = −dM/ds)');
}

export const failures = () => fails;

