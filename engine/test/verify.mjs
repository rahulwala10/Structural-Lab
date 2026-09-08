/**
 * Structural Lab — verification suite.
 *
 *   npm test
 *
 * Every solver result below is checked against an independent closed-form
 * solution, a hand method (method of joints), or an equilibrium invariant.
 * Exits non-zero on any failure so CI fails loudly.
 */
import { analyzeFrame, analyzeTruss, makeArch } from '../index.mjs';
import { KINDS } from '../../src/presets.js';
import { failures } from './closed-form.mjs';
import { beamFailures } from './beam.mjs';

const EI = 2e4, EA = 2e6;
let fails = 0;
const near = (a, b, tol, label) => {
  const ok = Math.abs(a - b) <= tol;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${a.toFixed(4)} exp ${b.toFixed(4)}`);
};
const ok = (cond, label) => { if (!cond) fails++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); };

console.log('\n=== F. TRUSS — checked against the method of joints ===');
{
  const r = analyzeTruss({
    EA,
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 2, y: 3 }],
    members: [{ id: 'AB', n1: 'A', n2: 'B' }, { id: 'BC', n1: 'B', n2: 'C' }, { id: 'CA', n1: 'C', n2: 'A' }],
    supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }],
    loads: [{ type: 'node', node: 'C', Fx: 0, Fy: -10 }],
  });
  const f = id => r.members.find(m => m.id === id).axial;
  ok(r.SI === 0, 'triangle is determinate (m + r − 2n = 0)');
  near(r.reactions.find(x => x.node === 'A').Ry, 5, 1e-2, 'R_A = 5 kN');
  near(f('AB'), 10 * 2 / 6, 1e-2, 'bottom chord AB = +3.333 kN (tension)');
  near(f('CA'), -10 * Math.sqrt(13) / 6, 1e-2, 'incline CA = −6.009 kN (compression)');
}
{
  // Warren truss: symmetric load must give symmetric reactions
  const nodes = [{ id: 'L0', x: 0, y: 0 }, { id: 'L1', x: 2, y: 0 }, { id: 'L2', x: 4, y: 0 }, { id: 'L3', x: 6, y: 0 }, { id: 'L4', x: 8, y: 0 },
    { id: 'U1', x: 1, y: 1.8 }, { id: 'U2', x: 3, y: 1.8 }, { id: 'U3', x: 5, y: 1.8 }, { id: 'U4', x: 7, y: 1.8 }];
  const members = [{ id: 'b1', n1: 'L0', n2: 'L1' }, { id: 'b2', n1: 'L1', n2: 'L2' }, { id: 'b3', n1: 'L2', n2: 'L3' }, { id: 'b4', n1: 'L3', n2: 'L4' },
    { id: 't1', n1: 'U1', n2: 'U2' }, { id: 't2', n1: 'U2', n2: 'U3' }, { id: 't3', n1: 'U3', n2: 'U4' },
    { id: 'd1', n1: 'L0', n2: 'U1' }, { id: 'd2', n1: 'U1', n2: 'L1' }, { id: 'd3', n1: 'L1', n2: 'U2' }, { id: 'd4', n1: 'U2', n2: 'L2' },
    { id: 'd5', n1: 'L2', n2: 'U3' }, { id: 'd6', n1: 'U3', n2: 'L3' }, { id: 'd7', n1: 'L3', n2: 'U4' }, { id: 'd8', n1: 'U4', n2: 'L4' }];
  const r = analyzeTruss({ EA, nodes, members, supports: [{ node: 'L0', type: 'pin' }, { node: 'L4', type: 'rollerV' }], loads: [{ type: 'node', node: 'U2', Fy: -10 }, { type: 'node', node: 'U3', Fy: -10 }] });
  ok(r.SI === 0, 'Warren truss determinate');
  near(r.reactions.find(x => x.node === 'L0').Ry, 10, 1e-2, 'symmetric reaction L0 = 10 kN');
  near(r.reactions.find(x => x.node === 'L4').Ry, 10, 1e-2, 'symmetric reaction L4 = 10 kN');
}

console.log('\n=== G. ARCH — funicular behaviour and thrust ===');
{
  const L = 10, h = 3, n = 20, w = 10;
  const a = makeArch({ span: L, rise: h, segs: n, profile: 'parabola', support: 'pin' });
  const dx = L / n;
  const loads = a.nodes.map((nd, i) => ({ type: 'node', node: nd.id, Fy: -w * dx * (i === 0 || i === n ? 0.5 : 1) }));
  const r = analyzeFrame({ EI, EA, nodes: a.nodes, members: a.members, supports: a.supports, loads });
  near(Math.abs(r.reactions[0].Rx), w * L * L / (8 * h), 0.4, 'parabolic 2-pin thrust H = wL²/8h');
  const peak = Math.max(Math.abs(r.Mmax), Math.abs(r.Mmin));
  ok(peak / (w * L * L / 8) < 0.03, 'bending is negligible — the parabola is funicular for UDL');
  ok(r.SI === 1, 'two-pin arch is indeterminate to degree 1');
}
{
  const a = makeArch({ span: 12, rise: 3.5, segs: 12, profile: 'parabola', support: 'pin', threePin: true });
  const r = analyzeFrame({ EI, EA, nodes: a.nodes, members: a.members, supports: a.supports, loads: a.loads });
  ok(r.SI === 0, 'three-pinned arch is statically determinate');
  const relMember = r.members.find(m => m.rel1);
  near(Math.abs(relMember.samples[0].M), 0, 1e-6, 'moment at the crown hinge = 0');
}
{
  // H = wL²/8h assumes load uniform per unit HORIZONTAL length, so apply nodal
  // tributary loads rather than the generator's per-member-length UDL.
  const L = 12, n = 12, w = 10, dx = L / n;
  const thrust = rise => {
    const a = makeArch({ span: L, rise, segs: n, profile: 'parabola', support: 'pin' });
    const loads = a.nodes.map((nd, i) => ({ type: 'node', node: nd.id, Fy: -w * dx * (i === 0 || i === n ? 0.5 : 1) }));
    return Math.abs(analyzeFrame({ EI, EA, nodes: a.nodes, members: a.members, supports: a.supports, loads }).reactions[0].Rx);
  };
  const hs = thrust(1.5), hd = thrust(3.0);
  near(hs / hd, 2, 0.03, 'halving the rise doubles the thrust (H ∝ 1/h)');
  near(hd, w * L * L / (8 * 3.0), 0.6, 'thrust matches wL²/8h at h = 3.0 m');
}

console.log('\n=== H. DETERMINACY BOOKKEEPING ===');
{
  const portal = (sup, apexHinge) => ({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 4 }, { id: 'C', x: 3, y: 4 }, { id: 'D', x: 6, y: 4 }, { id: 'E', x: 6, y: 0 }],
    members: [{ id: 'c1', n1: 'A', n2: 'B' }, { id: 'b1', n1: 'B', n2: 'C' }, { id: 'b2', n1: 'C', n2: 'D', rel1: !!apexHinge }, { id: 'c2', n1: 'D', n2: 'E' }],
    supports: [{ node: 'A', type: sup }, { node: 'E', type: sup }], loads: [{ type: 'node', node: 'B', Fx: 10 }],
  });
  ok(analyzeFrame({ EI, EA, ...portal('fixed', false) }).SI === 3, 'fixed-base portal  SI = 3');
  ok(analyzeFrame({ EI, EA, ...portal('pin', false) }).SI === 1, 'pinned-base portal SI = 1');
  ok(analyzeFrame({ EI, EA, ...portal('pin', true) }).SI === 0, 'three-pinned portal SI = 0');
  // a release at a pin is not an independent condition
  const ss = analyzeFrame({ EI, EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B', rel1: true, rel2: true }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w: 10, dir: 'grav' }] });
  ok(ss.SI === 0, 'releasing a member end at a pin is not double-counted');
  near(Math.max(...ss.members[0].samples.map(p => p.M)), 10 * 36 / 8, 0.02, '  ...and it still solves as wL²/8');
}

console.log('\n=== I. EVERY PRESET SOLVES AND BALANCES ===');
{
  let n = 0, bad = 0;
  for (const key of Object.keys(KINDS)) {
    const K = KINDS[key];
    for (const p of K.presets) {
      n++;
      const r = K.analyze({ ...p.make(), EA, EI, sub: 10 });
      if (!r.stable || !r.eqOK) { bad++; fails++; console.log(`  FAIL  ${K.label} / ${p.name}`); }
    }
  }
  console.log(`  ${bad === 0 ? 'PASS' : 'FAIL'}  ${n - bad}/${n} presets stable and in equilibrium`);
}

console.log('\n=== J. ROBUSTNESS — malformed models must not throw ===');
{
  const cases = [
    ['empty model', { nodes: [{ id: 'A', x: 0, y: 0 }], members: [], supports: [], loads: [] }],
    ['member referencing a missing node', { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'Z' }], supports: [{ node: 'A', type: 'fixed' }], loads: [] }],
    ['zero-length member', { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 0 }, { id: 'C', x: 4, y: 0 }], members: [{ id: 'm1', n1: 'A', n2: 'B' }, { id: 'm2', n1: 'A', n2: 'C' }], supports: [{ node: 'A', type: 'fixed' }], loads: [{ type: 'node', node: 'C', Fy: -5 }] }],
    ['no restraint at all', { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [], loads: [{ type: 'node', node: 'B', Fy: -10 }] }],
    ['load on a member that does not exist', { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'ZZ', w: 10, dir: 'grav' }] }],
    ['inverted partial-UDL extent', { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }], members: [{ id: 'm', n1: 'A', n2: 'B' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'udl', member: 'm', w: 10, dir: 'grav', t1: 0.8, t2: 0.2 }] }],
    ['extreme stiffness ratio (1e6)', { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 4 }, { id: 'C', x: 6, y: 4 }, { id: 'D', x: 6, y: 0 }], members: [{ id: 'c1', n1: 'A', n2: 'B' }, { id: 'bm', n1: 'B', n2: 'C', EI: 2e10 }, { id: 'c2', n1: 'C', n2: 'D' }], supports: [{ node: 'A', type: 'fixed' }, { node: 'D', type: 'fixed' }], loads: [{ type: 'node', node: 'B', Fx: 20 }] }],
  ];
  for (const [label, m] of cases) {
    let threw = false;
    try { analyzeFrame({ EI, EA, ...m }); } catch { threw = true; }
    ok(!threw, `handled gracefully: ${label}`);
  }
  let threw = false;
  try { analyzeTruss({ EA, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 3, y: 0 }, { id: 'C', x: 3, y: 3 }, { id: 'D', x: 0, y: 3 }], members: [{ id: '1', n1: 'A', n2: 'B' }, { id: '2', n1: 'B', n2: 'C' }, { id: '3', n1: 'C', n2: 'D' }, { id: '4', n1: 'D', n2: 'A' }], supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }], loads: [{ type: 'node', node: 'C', Fy: -10 }] }); } catch { threw = true; }
  ok(!threw, 'handled gracefully: untriangulated truss panel');
}

const total = fails + failures() + beamFailures();
console.log(total === 0
  ? `\n================  ALL CHECKS PASS  ================\n`
  : `\n================  ${total} FAILURE(S)  ================\n`);
process.exit(total === 0 ? 0 : 1);
