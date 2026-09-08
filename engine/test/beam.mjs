/**
 * Beam solver verification — independent closed-form checks.
 *
 * Every expected value below comes from a standard published result
 * (Roark / Steel Designers' Manual / first principles), not from the solver.
 */
import { analyzeBeam, mkProbe, detectStandard, BEAM_PRESETS, withIds } from '../beam.mjs';

const EI = 50000;
let fails = 0;
const near = (a, b, tol, label) => {
  const okv = Math.abs(a - b) <= tol;
  if (!okv) fails++;
  console.log(`  ${okv ? 'PASS' : 'FAIL'}  ${label}: got ${a.toFixed(4)} exp ${b.toFixed(4)}`);
};
const ok = (c, label) => { if (!c) fails++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${label}`); };

const run = (L, supports, loads, hinges = []) => analyzeBeam({ L, EI, supports, hinges, loads });
const SS = L => [{ x: 0, type: 'pin' }, { x: L, type: 'roller' }];
const Rat = (r, x) => r.reactions.find(q => Math.abs(q.x - x) < 1e-6);
// downward deflection in mm at x
const dmm = (r, x) => { const P = mkProbe(r); return -P.Dat(x) * 1000; };

console.log('=== A. SIMPLY SUPPORTED ===');
{
  const L = 8, P = 20;
  const r = run(L, SS(L), [{ type: 'point', x: L / 2, P }]);
  near(Rat(r, 0).R, P / 2, 1e-4, 'central point: R = P/2');
  near(r.Mmax.v, P * L / 4, 1e-3, 'central point: M_max = PL/4');
  near(dmm(r, L / 2), P * L ** 3 / (48 * EI) * 1000, 0.02, 'central point: δ = PL³/48EI');
  near(mkProbe(r).VSide(L / 2, 'L'), P / 2, 1e-3, 'shear just left of load = +P/2');
  near(mkProbe(r).VSide(L / 2, 'R'), -P / 2, 1e-3, 'shear just right of load = −P/2');
}
{
  const L = 10, P = 30, a = 3, b = 7;
  const r = run(L, SS(L), [{ type: 'point', x: a, P }]);
  near(Rat(r, 0).R, P * b / L, 1e-4, 'off-centre point: R_A = Pb/L');
  near(Rat(r, L).R, P * a / L, 1e-4, 'off-centre point: R_B = Pa/L');
  near(r.Mmax.v, P * a * b / L, 1e-3, 'off-centre point: M = Pab/L');
}
{
  const L = 8, w = 10;
  const r = run(L, SS(L), [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }]);
  near(Rat(r, 0).R, w * L / 2, 1e-4, 'UDL: R = wL/2');
  near(r.Mmax.v, w * L * L / 8, 1e-3, 'UDL: M_max = wL²/8');
  near(dmm(r, L / 2), 5 * w * L ** 4 / (384 * EI) * 1000, 0.02, 'UDL: δ = 5wL⁴/384EI');
}
{
  const L = 6, w = 12;
  const r = run(L, SS(L), [{ type: 'udl', x1: 0, x2: L, w1: 0, w2: w }]);
  near(Rat(r, 0).R, w * L / 6, 1e-3, 'triangular: R_small = wL/6');
  near(Rat(r, L).R, w * L / 3, 1e-3, 'triangular: R_big = wL/3');
  near(r.Mmax.v, w * L * L / (9 * Math.sqrt(3)), 0.02, 'triangular: M_max = wL²/9√3');
  near(r.Mmax.x, L / Math.sqrt(3), 0.03, 'triangular: peak at L/√3 from small end');
}
{
  const L = 8, M0 = 40, a = 4;
  const r = run(L, SS(L), [{ type: 'moment', x: a, M: M0 }]);
  const P = mkProbe(r);
  near(Rat(r, 0).R, M0 / L, 1e-3, 'couple: R_A = +M₀/L');
  near(Rat(r, L).R, -M0 / L, 1e-3, 'couple: R_B = −M₀/L');
  near(P.MatSide(a, 'L'), M0 * a / L, 1e-3, 'couple: M just left = M₀a/L');
  near(P.MatSide(a, 'R') - P.MatSide(a, 'L'), -M0, 1e-3, 'couple: M steps by −M₀');
}
{
  // partial UDL over left half
  const L = 8, w = 10;
  const r = run(L, SS(L), [{ type: 'udl', x1: 0, x2: L / 2, w1: w, w2: w }]);
  near(Rat(r, 0).R, 3 * w * L / 8, 1e-3, 'half UDL: R_A = 3wL/8');
  near(Rat(r, L).R, w * L / 8, 1e-3, 'half UDL: R_B = wL/8');
}

console.log('\n=== B. CANTILEVER ===');
{
  const L = 4, P = 10;
  const r = run(L, [{ x: 0, type: 'fixed' }], [{ type: 'point', x: L, P }]);
  near(Rat(r, 0).R, P, 1e-4, 'tip load: R = P');
  near(Math.abs(r.Mmin.v), P * L, 1e-3, 'tip load: |M_fix| = PL (hogging)');
  ok(r.Mmin.v < 0, 'tip load: fixed-end moment is negative (hogging) ✓ convention');
  near(dmm(r, L), P * L ** 3 / (3 * EI) * 1000, 0.02, 'tip load: δ = PL³/3EI');
}
{
  const L = 4, w = 8;
  const r = run(L, [{ x: 0, type: 'fixed' }], [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }]);
  near(Rat(r, 0).R, w * L, 1e-4, 'UDL: R = wL');
  near(Math.abs(r.Mmin.v), w * L * L / 2, 1e-3, 'UDL: |M_fix| = wL²/2');
  near(dmm(r, L), w * L ** 4 / (8 * EI) * 1000, 0.02, 'UDL: δ = wL⁴/8EI');
}
{
  // point load partway along — tip deflection = Pa²(3L−a)/6EI
  const L = 5, P = 12, a = 3;
  const r = run(L, [{ x: 0, type: 'fixed' }], [{ type: 'point', x: a, P }]);
  near(dmm(r, L), P * a * a * (3 * L - a) / (6 * EI) * 1000, 0.02, 'part-span load: δ_tip = Pa²(3L−a)/6EI');
  near(Math.abs(r.Mmin.v), P * a, 1e-3, 'part-span load: |M_fix| = Pa');
}
{
  // right-hand fixed cantilever — mirror case, checks orientation handling
  const L = 4, P = 10;
  const r = run(L, [{ x: L, type: 'fixed' }], [{ type: 'point', x: 0, P }]);
  near(Rat(r, L).R, P, 1e-4, 'mirrored cantilever: R = P');
  near(Math.abs(r.Mmin.v), P * L, 1e-3, 'mirrored cantilever: |M_fix| = PL');
  near(dmm(r, 0), P * L ** 3 / (3 * EI) * 1000, 0.02, 'mirrored cantilever: δ = PL³/3EI');
}

console.log('\n=== C. PROPPED CANTILEVER (1° indeterminate) ===');
{
  const L = 6, w = 10;
  const r = run(L, [{ x: 0, type: 'fixed' }, { x: L, type: 'roller' }], [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }]);
  near(Math.abs(r.Mmin.v), w * L * L / 8, 0.01, 'UDL: |M_fix| = wL²/8');
  near(Rat(r, L).R, 3 * w * L / 8, 0.01, 'UDL: R_prop = 3wL/8');
  near(Rat(r, 0).R, 5 * w * L / 8, 0.01, 'UDL: R_fix = 5wL/8');
  near(r.Mmax.v, 9 * w * L * L / 128, 0.02, 'UDL: M_sag = 9wL²/128');
  near(r.Mmax.x, 5 * L / 8, 0.05, 'UDL: sag peak at 5L/8 from fixed end');
  ok(r.nIndet === 1, 'determinacy n = 1');
}
{
  const L = 6, P = 40;
  const r = run(L, [{ x: 0, type: 'fixed' }, { x: L, type: 'roller' }], [{ type: 'point', x: L / 2, P }]);
  near(Math.abs(r.Mmin.v), 3 * P * L / 16, 0.01, 'central point: |M_fix| = 3PL/16');
  near(Rat(r, L).R, 5 * P / 16, 0.01, 'central point: R_prop = 5P/16');
  near(r.Mmax.v, 5 * P * L / 32, 0.01, 'central point: M_load = 5PL/32');
}

console.log('\n=== D. FIXED–FIXED (2° indeterminate) ===');
{
  const L = 6, w = 12;
  const r = run(L, [{ x: 0, type: 'fixed' }, { x: L, type: 'fixed' }], [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }]);
  near(Math.abs(r.Mmin.v), w * L * L / 12, 0.01, 'UDL: |M_end| = wL²/12');
  near(r.Mmax.v, w * L * L / 24, 0.01, 'UDL: M_mid = wL²/24');
  near(dmm(r, L / 2), w * L ** 4 / (384 * EI) * 1000, 0.02, 'UDL: δ = wL⁴/384EI');
  ok(r.nIndet === 2, 'determinacy n = 2');
}
{
  const L = 6, P = 40;
  const r = run(L, [{ x: 0, type: 'fixed' }, { x: L, type: 'fixed' }], [{ type: 'point', x: L / 2, P }]);
  near(Math.abs(r.Mmin.v), P * L / 8, 0.01, 'central point: |M_end| = PL/8');
  near(r.Mmax.v, P * L / 8, 0.01, 'central point: M_mid = PL/8');
  near(dmm(r, L / 2), P * L ** 3 / (192 * EI) * 1000, 0.02, 'central point: δ = PL³/192EI');
}

console.log('\n=== E. CONTINUOUS (two equal spans) ===');
{
  const L = 10, w = 10, sp = L / 2;
  const r = run(L, [{ x: 0, type: 'pin' }, { x: sp, type: 'roller' }, { x: L, type: 'roller' }],
    [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }]);
  near(Math.abs(r.Mmin.v), w * sp * sp / 8, 0.01, 'M at central support = wl²/8');
  near(Rat(r, sp).R, 1.25 * w * sp, 0.01, 'R_central = 1.25wl');
  near(Rat(r, 0).R, 0.375 * w * sp, 0.01, 'R_end = 0.375wl');
  near(r.Mmax.v, 9 * w * sp * sp / 128, 0.02, 'span sag = 9wl²/128');
  ok(r.contraflexure.length === 2, `two contraflexure points found (got ${r.contraflexure.length})`);
  near(r.contraflexure[0], 0.75 * sp, 0.05, 'contraflexure at 0.75l from end support');
}

console.log('\n=== F. OVERHANG ===');
{
  // span 0..6 with 2 m overhang to x=8, UDL throughout
  const L = 8, w = 5, a = 6;
  const r = run(L, [{ x: 0, type: 'pin' }, { x: a, type: 'roller' }], [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }]);
  const P = mkProbe(r);
  // cantilever tail moment at the inner support = −w·c²/2 with c = 2
  near(P.MatSide(a), -w * (L - a) ** 2 / 2, 0.02, 'hogging at inner support = −wc²/2');
  near(r.totalR, w * L, 1e-3, 'ΣR = total load');
  ok(r.contraflexure.length === 1, 'one contraflexure point in the back span');
}

console.log('\n=== G. INTERNAL HINGE (Gerber) ===');
{
  const L = 6, w = 10, xh = 3;
  const r = run(L, [{ x: 0, type: 'fixed' }, { x: L, type: 'roller' }],
    [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }], [xh]);
  const P = mkProbe(r);
  ok(r.stable, 'hinged beam is stable');
  ok(r.nIndet === 0, 'hinge makes it determinate (n = 0)');
  near(P.MatSide(xh), 0, 0.02, 'moment AT the hinge = 0');
  // right of hinge is a simply supported span of 3 m on the hinge + roller
  near(Rat(r, L).R, w * (L - xh) / 2, 0.02, 'R_roller = w·c/2 (right of hinge acts as a simple span)');
  // left portion: cantilever carrying its own UDL + hinge shear
  near(Math.abs(r.Mmin.v), w * xh * xh / 2 + (w * (L - xh) / 2) * xh, 0.05, '|M_fix| = wa²/2 + V_hinge·a');
}

console.log('\n=== H. MECHANISM DETECTION ===');
{
  ok(!run(8, [], [{ type: 'point', x: 4, P: 20 }]).stable, 'no supports → mechanism');
  ok(!run(8, [{ x: 0, type: 'pin' }], [{ type: 'point', x: 4, P: 20 }]).stable, 'single pin → mechanism');
  ok(!run(8, [{ x: 0, type: 'pin' }, { x: 8, type: 'roller' }], [{ type: 'point', x: 4, P: 20 }], [4]).stable,
    'simply supported + mid hinge → mechanism');
  ok(run(8, [{ x: 0, type: 'fixed' }], [{ type: 'point', x: 8, P: 10 }]).stable, 'single fixed → stable');
}

console.log('\n=== I. INVARIANTS ON EVERY PRESET ===');
{
  let n = 0, bad = 0;
  for (const p of BEAM_PRESETS) {
    n++;
    const cfg = withIds(p.make());
    const r = analyzeBeam({ L: cfg.L, EI, supports: cfg.supports, hinges: cfg.hinges.map(h => h.x), loads: cfg.loads });
    if (!r.stable) { if (!/mechanism/i.test(p.name)) { bad++; fails++; console.log(`  FAIL  ${p.name} unexpectedly unstable`); } continue; }
    if (!r.eqOK) { bad++; fails++; console.log(`  FAIL  ${p.name} fails equilibrium (ΣR ${r.totalR} vs ΣW ${r.totalDown})`); continue; }
    // shear must return to zero at the far right (nothing beyond the beam)
    const vEnd = r.V[r.V.length - 1];
    if (Math.abs(vEnd) > 1e-3 * Math.max(1, Math.abs(r.Vmax.v))) { bad++; fails++; console.log(`  FAIL  ${p.name}: shear does not close (${vEnd})`); }
  }
  console.log(`  ${bad === 0 ? 'PASS' : 'FAIL'}  ${n - bad}/${n} presets: equilibrium holds and shear closes to zero`);
}

console.log('\n=== J. THE TOOL\u2019S OWN CROSS-CHECK IS HONEST ===');
{
  // detectStandard is the in-app "hand vs engine" table. Confirm it actually
  // compares against closed form and would flag a discrepancy, rather than
  // echoing the solver back to itself.
  const L = 8, w = 10;
  const sup = SS(L), loads = [{ type: 'udl', x1: 0, x2: L, w1: w, w2: w }];
  const r = run(L, sup, loads);
  const det = detectStandard(L, EI, sup, [], loads, r);
  ok(!!det && /simply supported/i.test(det.name), 'recognises the simply supported UDL case');
  ok(det.rows.every(q => q.ok), 'all hand-vs-engine rows agree');
  const mrow = det.rows.find(q => /M max/i.test(q.q));
  near(mrow.hand, w * L * L / 8, 1e-6, '  hand column really is wL²/8, computed independently');
  // now feed it a doctored result and confirm it reports a mismatch
  const bogus = JSON.parse(JSON.stringify(r));
  bogus.M = bogus.M.map(v => v * 1.5);
  bogus.Mmax = { ...bogus.Mmax, v: bogus.Mmax.v * 1.5 };
  const det2 = detectStandard(L, EI, sup, [], loads, bogus);
  ok(det2.rows.some(q => !q.ok), 'flags a deliberately corrupted result as a mismatch ✓ not a rubber stamp');
}

console.log('\n=== K. ROBUSTNESS ===');
{
  const cases = [
    ['load exactly on a support', 8, SS(8), [{ type: 'point', x: 0, P: 20 }], []],
    ['zero-length UDL', 8, SS(8), [{ type: 'udl', x1: 4, x2: 4, w1: 10, w2: 10 }], []],
    ['upward point load', 8, SS(8), [{ type: 'point', x: 4, P: -20 }], []],
    ['negative (uplift) UDL', 8, SS(8), [{ type: 'udl', x1: 0, x2: 8, w1: -10, w2: -10 }], []],
    ['no loads at all', 8, SS(8), [], []],
    ['coincident supports', 8, [{ x: 0, type: 'pin' }, { x: 0, type: 'roller' }, { x: 8, type: 'roller' }], [{ type: 'udl', x1: 0, x2: 8, w1: 10, w2: 10 }], []],
    ['hinge at a support', 8, [{ x: 0, type: 'fixed' }, { x: 8, type: 'roller' }], [{ type: 'udl', x1: 0, x2: 8, w1: 10, w2: 10 }], [0]],
    ['very short span', 0.5, [{ x: 0, type: 'fixed' }], [{ type: 'point', x: 0.5, P: 5 }], []],
    ['very long span', 60, SS(60), [{ type: 'udl', x1: 0, x2: 60, w1: 10, w2: 10 }], []],
  ];
  for (const [label, L, sup, lds, hg] of cases) {
    let threw = false, res = null;
    try { res = analyzeBeam({ L, EI, supports: sup, hinges: hg, loads: lds }); } catch (e) { threw = true; }
    ok(!threw && res !== null, `no crash: ${label}`);
    if (res && res.stable && lds.length) {
      const bad = !res.eqOK;
      if (bad) { fails++; console.log(`    FAIL  ${label}: equilibrium violated`); }
    }
  }
  // long-span sanity against closed form
  const rl = run(60, SS(60), [{ type: 'udl', x1: 0, x2: 60, w1: 10, w2: 10 }]);
  near(rl.Mmax.v, 10 * 60 * 60 / 8, 0.5, 'long span still matches wL²/8');
}

console.log(fails === 0 ? '\n****  BEAM SOLVER: ALL CHECKS PASS  ****\n' : `\n****  BEAM SOLVER: ${fails} FAILURE(S)  ****\n`);
export const beamFailures = () => fails;
