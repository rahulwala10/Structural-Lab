/**
 * Practice questions: every generated question must be solvable, have exactly
 * one right sketch among clearly different options, and grade correctly.
 */
import { randomQuestion, buildQuiz, gradeQuiz, signature, sigDist, MIN_GAP, beamToFrame, frameToBeam, beamModel, solve, describe, countContraflexure, TEMPLATES } from '../practice.mjs';
import { analyzeBeam, BEAM_PRESETS, withIds } from '../beam.mjs';
import { beamMomentTerms } from '../explain.mjs';

let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${label}`); };

console.log('\n=== Q1. QUESTIONS ARE REPRODUCIBLE FROM THEIR NUMBER ===');
{
  const a = randomQuestion(4242, 'any'), b = randomQuestion(4242, 'any');
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed → identical question');
  const qa = buildQuiz(a.model, { seed: a.seed, standard: a.standard }), qb = buildQuiz(b.model, { seed: b.seed, standard: b.standard });
  ok(JSON.stringify(qa.parts.map(p => [p.id, p.expected])) === JSON.stringify(qb.parts.map(p => [p.id, p.expected])), 'same seed → identical answer key and option order');
  ok(new Set(Array.from({ length: 60 }, (_, i) => randomQuestion(i + 1, 'any').key)).size === TEMPLATES.length, `all ${TEMPLATES.length} templates appear within 60 questions`);
}

console.log('\n=== Q2. EVERY QUESTION IS WELL FORMED (300 per family) ===');
{
  const bad = { unstable: 0, options: 0, answer: 0, gap: 0, numbers: 0, text: 0, equilibrium: 0 };
  let n = 0;
  for (const fam of ['beam', 'frame']) for (let s = 1; s <= 300; s++) {
    const q = randomQuestion(s * 97 + (fam === 'beam' ? 1 : 2), fam);
    const quiz = q && buildQuiz(q.model, { seed: q.seed, standard: q.standard });
    n++;
    if (!q || !quiz.stable) { bad.unstable++; continue; }
    if (/undefined|NaN/.test(q.prompt)) bad.text++;
    for (const p of quiz.parts) {
      if (p.type === 'mcq') {
        if (p.options.length !== 4) bad.options++;
        if (p.options.filter(o => o.key === 'correct').length !== 1 || p.options[p.expected].key !== 'correct') bad.answer++;
        for (let i = 0; i < p.options.length; i++) for (let j = i + 1; j < p.options.length; j++)
          if (sigDist(p.options[i].sig, p.options[j].sig) < MIN_GAP - 1e-9) bad.gap++;
      } else if (p.type === 'num' && !isFinite(p.expected)) bad.numbers++;
      else if (p.type === 'dir' && ![0, 1].includes(p.expected)) bad.numbers++;
    }
    // numeric reactions of a determinate question must balance the vertical load
    if (quiz.determinate) {
      const sumRy = quiz.parts.filter(p => /^R-.*-Ry$/.test(p.id)).reduce((t, p) => t + p.expected, 0);
      if (Math.abs(sumRy - (-quiz.res.appliedFy)) > 0.05 * Math.max(1, Math.abs(quiz.res.appliedFy))) bad.equilibrium++;
    }
  }
  ok(bad.unstable === 0, `all ${n} questions solve (unstable: ${bad.unstable})`);
  ok(bad.options === 0, `every sketch question offers four options (short: ${bad.options})`);
  ok(bad.answer === 0, `exactly one correct option, and the key points to it (wrong: ${bad.answer})`);
  ok(bad.gap === 0, `options are visibly different from each other (too close: ${bad.gap})`);
  ok(bad.numbers === 0 && bad.text === 0, 'answer key finite and prompts free of undefined/NaN');
  ok(bad.equilibrium === 0, 'determinate answers: ΣRy = total vertical load');
}

console.log('\n=== Q3. GRADING ===');
{
  const q = randomQuestion(7, 'beam'), quiz = buildQuiz(q.model, { seed: q.seed, standard: q.standard });
  const key = Object.fromEntries(quiz.parts.map(p => [p.id, p.type === 'num' ? String(p.expected) : p.expected]));
  ok(gradeQuiz(quiz, key).allCorrect, 'the answer key scores full marks');
  const mcq = quiz.parts.find(p => p.type === 'mcq');
  ok(!gradeQuiz(quiz, { ...key, [mcq.id]: (mcq.expected + 1) % mcq.options.length }).allCorrect, 'one wrong sketch → not full marks');
  ok(!gradeQuiz(quiz, {}).allCorrect, 'blank answers → not full marks');
  const num = quiz.parts.find(p => p.type === 'num' && !p.magnitude && Math.abs(p.expected) > 1);
  if (num) {
    const g = gradeQuiz(quiz, { ...key, [num.id]: String(-num.expected) });
    ok(!g.results[num.id].ok && /wrong direction/.test(g.results[num.id].msg), 'sign reversed → "right size, wrong direction"');
    ok(gradeQuiz(quiz, { ...key, [num.id]: String(num.expected * 1.01) }).results[num.id].ok, 'within tolerance (1%) → accepted');
  }
}

console.log('\n=== Q4. BEAM-TAB MODELS CONVERT EXACTLY ===');
{
  let worst = 0, n = 0;
  const cases = BEAM_PRESETS.map(p => { const c = withIds(p.make()); return { L: c.L, supports: c.supports, hinges: c.hinges, loads: c.loads }; });
  cases.push({ L: 10, supports: [{ x: 2, type: 'roller' }, { x: 7, type: 'roller' }, { x: 9, type: 'roller' }], hinges: [{ x: 8 }],
    loads: [{ type: 'udl', x1: 1, x2: 9.5, w1: 4, w2: 14 }, { type: 'point', x: 3.3, P: 18 }, { type: 'moment', x: 5, M: -22 }, { type: 'point', x: 0, P: 5 }] });
  for (const c of cases) {
    const b = analyzeBeam({ ...c, EI: 2e4, hinges: c.hinges.map(h => (typeof h === 'object' ? h.x : h)) });
    if (!b.stable) continue;
    const m = beamToFrame(c), f = solve(m);
    if (!f.stable) { worst = Infinity; continue; }
    const scale = Math.max(1, ...b.reactions.map(r => Math.abs(r.R)), Math.abs(b.Mmax.v), Math.abs(b.Mmin.v));
    b.reactions.forEach(r => {
      const nd = m.nodes.find(q => Math.abs(q.x - r.x) < 1e-6);
      const fr = f.reactions.find(q => q.node === nd.id);
      worst = Math.max(worst, Math.abs(fr.Ry - r.R) / scale, Math.abs(fr.M - r.M) / scale);
    });
    f.members.forEach(mb => mb.samples.forEach(sp => {
      // exact beam moment at this x from statics; a member starts just right of its first node
      // (after any couple there) and ends just left of its last
      const x = mb.x1 + sp.s, inside = x > 1e-6 && x < c.L - 1e-6;
      if (inside) worst = Math.max(worst, Math.abs(sp.M - beamMomentTerms(x, sp.s < 1e-9 ? 'R' : 'L', c.loads, b).total) / scale);
    }));
    n++;
  }
  ok(worst < 1e-6, `${n} beams: frame-format reactions and moments match the beam solver (worst ${worst.toExponential(1)})`);
  // and back again: a practice beam opened in the Beam tab must solve to the same reactions
  let worstBack = 0, nb = 0;
  for (let s = 1; s <= 120; s++) {
    const q = randomQuestion(s * 13 + 5, 'beam'), f = solve(q.model), cfg = frameToBeam(q.model);
    const b = analyzeBeam({ ...cfg, EI: 2e4, hinges: cfg.hinges.map(h => h.x) });
    if (!b.stable) { worstBack = Infinity; continue; }
    const scale = Math.max(1, ...f.reactions.map(r => Math.abs(r.Ry)));
    f.reactions.forEach(r => { const x = q.model.nodes.find(nd => nd.id === r.node).x, br = b.reactions.find(q2 => Math.abs(q2.x - x) < 1e-6); worstBack = Math.max(worstBack, br ? Math.abs(br.R - r.Ry) / scale : Infinity); });
    nb++;
  }
  ok(worstBack < 1e-6, `${nb} practice beams open in the Beam tab with identical reactions (worst ${worstBack.toExponential(1)})`);
}

console.log('\n=== Q5. KNOWN ANSWERS ===');
{
  const quizOf = m => buildQuiz(m, { seed: 1 });
  const ss = beamModel({ xs: [0, 8], supports: [{ x: 0, type: 'pin' }, { x: 8, type: 'roller' }], udls: [{ x1: 0, x2: 8, w1: 10 }] });
  const pc = beamModel({ xs: [0, 6], supports: [{ x: 0, type: 'fixed' }, { x: 6, type: 'roller' }], udls: [{ x1: 0, x2: 6, w1: 10 }] });
  const ff = beamModel({ xs: [0, 6], supports: [{ x: 0, type: 'fixed' }, { x: 6, type: 'fixed' }], udls: [{ x1: 0, x2: 6, w1: 10 }] });
  const ts = beamModel({ xs: [0, 5, 10], supports: [{ x: 0, type: 'pin' }, { x: 5, type: 'roller' }, { x: 10, type: 'roller' }], udls: [{ x1: 0, x2: 10, w1: 10 }] });
  ok(countContraflexure(ss, solve(ss)) === 0, 'simply supported UDL: no contraflexure');
  ok(countContraflexure(pc, solve(pc)) === 1, 'propped cantilever UDL: one point of contraflexure');
  ok(countContraflexure(ff, solve(ff)) === 2, 'fixed-ended UDL: two points of contraflexure');
  ok(countContraflexure(ts, solve(ts)) === 2, 'two equal spans UDL: two points of contraflexure');
  const q = quizOf(ss), peak = q.parts.find(p => p.id === 'PEAK');
  ok(peak && Math.abs(peak.expected - 80) < 1e-6, 'simply supported: largest M = wL²/8 = 80 kN·m');
  ok(q.parts.some(p => p.id === 'R-A-Ry' && Math.abs(p.expected - 40) < 1e-6), 'simply supported: R_A = wL/2 = 40 kN');
  const ind = quizOf(pc);
  ok(ind.parts.filter(p => p.group === 'Reactions').every(p => p.type === 'dir'), 'indeterminate (not flagged standard) → direction questions');
  ok(ind.parts.find(p => p.id === 'D-A-M').expected === 0, 'propped cantilever: the wall pushes back anticlockwise (↺)');
  const d = describe(ss).text;
  ok(/pinned at A/.test(d) && /roller at B/.test(d) && /10 kN\/m/.test(d), `prompt reads: "${d}"`);
}

console.log(fails === 0 ? '\n****  PRACTICE: ALL CHECKS PASS  ****\n' : `\n****  PRACTICE: ${fails} FAILURE(S)  ****\n`);
export const practiceFailures = () => fails;
