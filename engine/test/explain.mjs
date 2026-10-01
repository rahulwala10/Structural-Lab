/**
 * The qualitative breakdowns must add back up to the solver's numbers —
 * otherwise the "how is this found?" text would teach something false.
 */
import { analyzeBeam, mkProbe, BEAM_PRESETS, withIds } from '../beam.mjs';
import { analyzeFrame } from '../frame.mjs';
import { beamReactionBreakdown, beamMomentTerms, beamSpanMoments, beamZeroShear, frameMemberBreakdown, frameJointBalance, frameReactionStory } from '../explain.mjs';
import { KINDS } from '../../src/presets.js';

let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${label}`); };
const near = (a, b, tol, label) => { const g = Math.abs(a - b) <= tol; if (!g) fails++; console.log(`  ${g ? 'PASS' : 'FAIL'}  ${label}: got ${a.toFixed(4)} exp ${b.toFixed(4)}`); };

const EI = 5e4;
const beamCases = BEAM_PRESETS.map(p => { const c = withIds(p.make()); return { name: p.name, L: c.L, supports: c.supports, hinges: c.hinges.map(h => h.x), loads: c.loads }; });
beamCases.push(
  { name: 'overhangs both sides, partial trapezoid', L: 10, supports: [{ x: 2, type: 'pin' }, { x: 7, type: 'roller' }], hinges: [],
    loads: [{ type: 'point', x: 0.5, P: 12 }, { type: 'udl', x1: 1, x2: 8.5, w1: 4, w2: 16 }, { type: 'point', x: 9.5, P: -6 }] },
  { name: 'couples inside a span and on a support', L: 8, supports: [{ x: 0, type: 'pin' }, { x: 8, type: 'roller' }], hinges: [],
    loads: [{ type: 'moment', x: 3, M: 25 }, { type: 'moment', x: 8, M: -10 }, { type: 'udl', x1: 0, x2: 8, w1: 5, w2: 5 }] },
  { name: 'point load sitting on a support', L: 9, supports: [{ x: 0, type: 'fixed' }, { x: 4.5, type: 'roller' }, { x: 9, type: 'roller' }], hinges: [],
    loads: [{ type: 'point', x: 4.5, P: 30 }, { type: 'point', x: 6.75, P: 20 }, { type: 'udl', x1: 0, x2: 4.5, w1: 8, w2: 8 }] },
  { name: 'three supports + hinge', L: 12, supports: [{ x: 0, type: 'pin' }, { x: 5, type: 'roller' }, { x: 12, type: 'roller' }], hinges: [7],
    loads: [{ type: 'udl', x1: 0, x2: 12, w1: 10, w2: 10 }, { type: 'point', x: 9, P: 15 }] },
  { name: 'fixed-fixed, off-centre point', L: 6, supports: [{ x: 0, type: 'fixed' }, { x: 6, type: 'fixed' }], hinges: [], loads: [{ type: 'point', x: 2, P: 40 }] },
  { name: 'fixed support in mid-beam', L: 8, supports: [{ x: 3, type: 'fixed' }], hinges: [], loads: [{ type: 'udl', x1: 0, x2: 8, w1: 6, w2: 6 }, { type: 'moment', x: 1, M: 12 }] },
);

console.log('\n=== X1. BEAM — reaction breakdown sums to each reaction ===');
{
  let worst = 0, n = 0;
  for (const c of beamCases) {
    const r = analyzeBeam({ L: c.L, EI, supports: c.supports, hinges: c.hinges, loads: c.loads });
    if (!r.stable) continue;
    const bd = beamReactionBreakdown(c.L, c.loads, r);
    const scale = Math.max(1, ...r.reactions.map(q => Math.abs(q.R)));
    bd.supports.forEach((s, i) => { worst = Math.max(worst, Math.abs(s.sum - r.reactions[i].R) / scale); });
    n++;
  }
  ok(worst < 1e-6, `free share + continuity share = solver reaction on ${n} beams (worst ${worst.toExponential(1)})`);
  const L = 6, w = 10;
  const r = analyzeBeam({ L, EI, supports: [{ x: 0, type: 'fixed' }, { x: L, type: 'roller' }], hinges: [], loads: [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }] });
  const bd = beamReactionBreakdown(L, [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }], r);
  near(bd.spans[0].freeA, w * L / 2, 1e-6, 'propped cantilever: free share = wL/2');
  near(bd.spans[0].cont, w * L / 8, 1e-3, '  hogging wL²/8 at the wall draws wL/8 towards it');
  near(bd.supports[0].sum, 5 * w * L / 8, 1e-3, '  so R_fixed = 5wL/8');
  near(bd.supports[1].sum, 3 * w * L / 8, 1e-3, '  and R_prop = 3wL/8');
}

console.log('\n=== X2. BEAM — moment terms rebuild M at every cut ===');
{
  let worst = 0, n = 0;
  for (const c of beamCases) {
    const r = analyzeBeam({ L: c.L, EI, supports: c.supports, hinges: c.hinges, loads: c.loads });
    if (!r.stable) continue;
    const P = mkProbe(r), scale = Math.max(1, Math.abs(r.Mmax.v), Math.abs(r.Mmin.v));
    for (let k = 0; k <= 40; k++) {
      const x = c.L * k / 40;
      for (const side of ['L', 'R']) { const t = beamMomentTerms(x, side, c.loads, r); worst = Math.max(worst, Math.abs(t.total - P.MatSide(x, side)) / scale); n++; }
    }
  }
  ok(worst < 1e-6, `Σ(force × lever arm) left of the cut = solver M at ${n} cuts (worst ${worst.toExponential(1)})`);
}

console.log('\n=== X2b. BEAM — free moment hung from the closing line = solver M ===');
{
  let worst = 0, n = 0;
  for (const c of beamCases) {
    const r = analyzeBeam({ L: c.L, EI, supports: c.supports, hinges: c.hinges, loads: c.loads });
    if (!r.stable) continue;
    const scale = Math.max(1, Math.abs(r.Mmax.v), Math.abs(r.Mmin.v));
    beamSpanMoments(c.L, c.loads, r).spans.forEach(sp => { if (sp.peak) { worst = Math.max(worst, Math.abs(sp.peak.m0 + sp.peak.close - sp.peak.M) / scale); n++; } });
  }
  ok(worst < 1e-6, `m₀ + closing line = M on ${n} loaded spans (worst ${worst.toExponential(1)})`);
  const L = 8, P = 10, loads = [{ type: 'point', x: 2, P }];
  const r = analyzeBeam({ L, EI, supports: [{ x: 0, type: 'fixed' }, { x: L, type: 'fixed' }], hinges: [], loads });
  const sp = beamSpanMoments(L, loads, r).spans[0];
  near(sp.peak.m0, P * 2 * 6 / L, 1e-6, 'fixed-fixed, P at 2 m of 8 m: free moment Pab/L = 15');
  near(sp.peak.m0 + sp.peak.close, 2 * P * 4 * 36 / 512, 1e-3, '  hung from the closing line → 2Pa²b²/L³ = 5.625');
}

console.log('\n=== X3. BEAM — zero shear is where load-to-the-left balances the reactions ===');
{
  const L = 8, w = 10;
  const loads = [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }];
  const z = beamZeroShear(loads, analyzeBeam({ L, EI, supports: [{ x: 0, type: 'pin' }, { x: L, type: 'roller' }], hinges: [], loads }));
  ok(z.length === 1 && z[0].kind === 'cross', 'SS UDL: one smooth zero crossing');
  near(z[0].x, L / 2, 1e-3, '  at midspan');
  near(z[0].down, z[0].up, 1e-3, '  where load to the left = reaction to the left');
  const lp = [{ type: 'point', x: 4, P: 20 }];
  const zp = beamZeroShear(lp, analyzeBeam({ L, EI, supports: [{ x: 0, type: 'pin' }, { x: L, type: 'roller' }], hinges: [], loads: lp }));
  ok(zp.length === 1 && zp[0].kind === 'jump' && Math.abs(zp[0].x - 4) < 1e-6, 'SS point load: V jumps across zero under the load');
  let worst = 0;
  for (const c of beamCases) {
    const r = analyzeBeam({ L: c.L, EI, supports: c.supports, hinges: c.hinges, loads: c.loads });
    if (!r.stable) continue;
    beamZeroShear(c.loads, r).filter(q => q.kind === 'cross').forEach(q => { worst = Math.max(worst, Math.abs(q.down - q.up)); });
  }
  ok(worst < 0.05, `every smooth crossing balances (worst ${worst.toFixed(4)} kN)`);
}

const frameCases = [];
for (const key of ['frame', 'arch']) for (const p of KINDS[key].presets) frameCases.push({ name: `${key} / ${p.name}`, model: p.make() });
frameCases.push({ name: 'portal with internal beam hinge + sway', model: {
  nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 4 }, { id: 'C', x: 6, y: 4 }, { id: 'D', x: 6, y: 0 }],
  members: [{ id: 'c1', n1: 'A', n2: 'B' }, { id: 'bm', n1: 'B', n2: 'C' }, { id: 'c2', n1: 'C', n2: 'D' }],
  hinges: [{ id: 'h', member: 'bm', t: 0.35 }],
  supports: [{ node: 'A', type: 'pin' }, { node: 'D', type: 'fixed' }],
  loads: [{ type: 'udl', member: 'bm', w: 12, w2: 4, t1: 0.1, t2: 0.9, dir: 'grav' }, { type: 'node', node: 'B', Fx: 10, Fy: 0, M: 5 },
    { type: 'mpoint', member: 'c2', t: 0.4, Fx: -6, Fy: 0, M: 3 }, { type: 'udl', member: 'c1', w: 3, w2: -3, dir: 'perp' }] } });

console.log('\n=== X4. FRAME — end shear = free shear + (M₁ − M₂)/L; midspan M = free + average end M ===');
{
  let worstV = 0, worstM = 0, n = 0;
  for (const c of frameCases) {
    const r = analyzeFrame({ ...c.model, EI: 2e4, EA: 2e6, sub: 10 });
    if (!r.stable) continue;
    const scale = Math.max(1, Math.abs(r.Vmax), Math.abs(r.Vmin), Math.abs(r.Mmax), Math.abs(r.Mmin));
    frameMemberBreakdown(c.model, r).forEach(b => {
      worstV = Math.max(worstV, Math.abs(b.Vfree1 + b.Vg - b.V1) / scale, Math.abs(b.Vfree2 + b.Vg - b.V2) / scale);
      worstM = Math.max(worstM, Math.abs(b.Mmid - b.MmidSolver) / scale);
      n++;
    });
  }
  ok(worstV < 1e-6, `end shears rebuilt for ${n} members (worst ${worstV.toExponential(1)})`);
  ok(worstM < 1e-6, `midspan moments rebuilt for ${n} members (worst ${worstM.toExponential(1)})`);
  const portal = frameCases.find(c => /Portal · fixed feet/.test(c.name)).model;
  const bm = frameMemberBreakdown(portal, analyzeFrame({ ...portal, EI: 2e4, EA: 2e6, sub: 10 })).find(b => b.id === 'bm');
  near(bm.Vfree1, -15 * 6 / 2, 1e-6, 'portal beam: free shear at the left end = −wL/2 (anticlockwise +)');
  near(bm.m0, 15 * 36 / 8, 1e-6, 'portal beam: free midspan moment = wL²/8');
}

console.log('\n=== X5. FRAME — moments balance at every joint ===');
{
  let worst = 0, joints = 0;
  for (const c of frameCases) {
    const r = analyzeFrame({ ...c.model, EI: 2e4, EA: 2e6, sub: 10 });
    if (!r.stable) continue;
    const scale = Math.max(1, Math.abs(r.Mmax), Math.abs(r.Mmin));
    frameJointBalance(c.model, r).forEach(j => { worst = Math.max(worst, Math.abs(j.sum) / scale); joints++; });
  }
  ok(worst < 1e-6, `ΣM = 0 at all ${joints} joints (worst ${worst.toExponential(1)})`);
}

console.log('\n=== X6. FRAME — reactions satisfy ΣM about a support, term by term ===');
{
  let worst = 0, n = 0, splitOk = true;
  for (const c of frameCases) {
    const r = analyzeFrame({ ...c.model, EI: 2e4, EA: 2e6, sub: 10 });
    if (!r.stable) continue;
    const st = frameReactionStory(c.model, r);
    const scale = Math.max(1, Math.abs(st.loadM));
    worst = Math.max(worst, Math.abs(st.sumM) / scale);
    if (st.split && st.supports.filter(s => ['fixed', 'pin', 'rollerH', 'guided'].includes(s.type)).length === 2 && !c.model.supports.some(s => s.kx))
      splitOk = splitOk && Math.abs(2 * st.split.lateral + r.appliedFx) < 1e-6 * Math.max(1, Math.abs(r.appliedFx));
    n++;
  }
  ok(worst < 1e-6, `ΣM about the first support closes on ${n} frames (worst ${worst.toExponential(1)})`);
  ok(splitOk, 'two horizontal restraints: the lateral shares add up to the applied horizontal load');
}

console.log('\n=== X7. FRAME — where the vertical load acts, and the lever-arm split ===');
{
  // determinate, vertical loads only: the lever-arm split IS the answer
  const m1 = { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 2, y: 0 }, { id: 'C', x: 6, y: 0 }],
    members: [{ id: 'AB', n1: 'A', n2: 'B' }, { id: 'BC', n1: 'B', n2: 'C' }],
    supports: [{ node: 'A', type: 'pin' }, { node: 'C', type: 'rollerV' }],
    loads: [{ id: 'p', type: 'node', node: 'B', Fx: 0, Fy: -10, M: 0 }, { id: 'u', type: 'udl', member: 'BC', w: 6, w2: 6, t1: 0.25, t2: 0.75, dir: 'grav' }] };
  const r1 = analyzeFrame({ ...m1, EI: 2e4, EA: 2e6, sub: 10 });
  const s1 = frameReactionStory(m1, r1);
  ok(Math.abs(s1.xbar - 68 / 22) < 1e-9, `resultant of 10 kN @ 2 m + 12 kN @ 4 m sits at x̄ = ${s1.xbar.toFixed(4)} m (68/22)`);
  const ry = id => r1.reactions.find(q => q.node === id).Ry;
  ok(Math.abs(s1.lever.A - ry('A')) < 1e-6 && Math.abs(s1.lever.C - ry('C')) < 1e-6, `lever-arm split = solver reactions (A ${s1.lever.A.toFixed(3)}, C ${s1.lever.C.toFixed(3)} kN)`);
  // inclined member, triangular gravity load 0 → 6 kN/m: resultant two-thirds of the way along
  const m2 = { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 3 }], members: [{ id: 'AB', n1: 'A', n2: 'B' }],
    supports: [{ node: 'A', type: 'pin' }, { node: 'B', type: 'rollerV' }],
    loads: [{ id: 'u', type: 'udl', member: 'AB', w: 0, w2: 6, dir: 'grav' }] };
  const r2 = analyzeFrame({ ...m2, EI: 2e4, EA: 2e6, sub: 10 });
  const s2 = frameReactionStory(m2, r2);
  ok(Math.abs(s2.xbar - 8 / 3) < 1e-9 && Math.abs(s2.totalDown - 15) < 1e-9, `inclined triangular load: ${s2.totalDown.toFixed(2)} kN at x̄ = ${s2.xbar.toFixed(4)} m (15 kN at 8/3)`);
}

console.log(fails === 0 ? '\n****  EXPLANATIONS: ALL CHECKS PASS  ****\n' : `\n****  EXPLANATIONS: ${fails} FAILURE(S)  ****\n`);
export const explainFailures = () => fails;
