import React, { useEffect, useMemo, useState } from "react";
import { buildQuiz, gradeQuiz, frameToBeam } from "../../engine/practice.mjs";
import { frameMemberBreakdown, beamReactionBreakdown, beamSpanMoments } from "../../engine/explain.mjs";
import { analyzeBeam } from "../../engine/beam.mjs";
import ScratchPad from "./ScratchPad.jsx";
import ModelSketch, { SketchLayer } from "./ModelSketch.jsx";
import Celebrate from "./Celebrate.jsx";

/* One question: the figure on a scratch pad, then reactions, two sketch
   choices (BMD and deflected shape) and key values. Check grades it; full
   marks brings out Beam Buddy. Reveal overlays the real diagrams on the
   student's own doodle and explains how the numbers arise. */

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const f2 = v => { const a = Math.abs(v); const s = a >= 100 ? v.toFixed(1) : v.toFixed(2); return s.replace(/\.?0+$/, "") || "0"; };

const CSS = `
.qz{color:#1B2A41;font-family:'Archivo',system-ui,sans-serif}
.qz .qz-head{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;margin-bottom:8px}
.qz .qz-tt{font:800 15px 'Archivo';letter-spacing:.01em}
.qz .qz-tag{font:700 8.5px ${MONO};letter-spacing:.12em;text-transform:uppercase;padding:3px 8px;border-radius:20px;border:1.3px solid currentColor;white-space:nowrap}
.qz .qz-prompt{font:400 13px/1.62 'Archivo';color:#33455a;margin:0 0 10px;padding:10px 12px;background:#F7F9FA;border-left:3px solid #D4622A;border-radius:0 6px 6px 0}
.qz .qz-sec{font:700 8.5px ${MONO};letter-spacing:.13em;text-transform:uppercase;color:#5B6B7C;margin:14px 0 7px;display:flex;align-items:center;gap:7px}
.qz .qz-sec::after{content:"";flex:1;height:1px;background:#D7E0E6}
.qz .qz-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 9px;border:1.2px solid #D7E0E6;border-radius:7px;margin-bottom:6px;background:#fff;transition:border-color .2s,background .2s}
.qz .qz-row.ok{border-color:#1E7F3C;background:#F1F8F3}
.qz .qz-row.no{border-color:#C0392B;background:#FDF3F1}
.qz .qz-l{font:600 11px ${MONO};line-height:1.35}
.qz .qz-l small{display:block;font-weight:500;font-size:9.5px;color:#5B6B7C;margin-top:1px}
.qz .qz-in{display:flex;align-items:center;gap:6px}
.qz input.qz-num{width:92px;font:500 13px ${MONO};padding:6px 7px;border:1.3px solid #C2CDD6;border-radius:5px;color:#1B2A41}
.qz .qz-u{font:500 10px ${MONO};color:#5B6B7C}
.qz .qz-tg{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.qz .qz-b{font:600 10px ${MONO};padding:6px 10px;border:1.3px solid #C2CDD6;border-radius:5px;background:#fff;color:#1B2A41;cursor:pointer;white-space:nowrap;transition:transform .08s}
.qz .qz-b:hover{border-color:#1B2A41}
.qz .qz-b:active{transform:scale(.95)}
.qz .qz-b.on{background:#1B2A41;color:#fff;border-color:#1B2A41}
.qz .qz-b.key{box-shadow:0 0 0 2.5px #1E7F3C}
.qz .qz-fb{grid-column:1/-1;font:500 10px ${MONO};color:#5B6B7C}
.qz .qz-fb b{color:#1B2A41}
.qz .qz-q{font:600 11.5px/1.4 'Archivo';margin:4px 0 8px}
.qz .qz-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:6px}
.qz .qz-opt{position:relative;border:1.6px solid #C2CDD6;border-radius:8px;background:#fff;cursor:pointer;padding:6px 6px 4px;text-align:left;transition:border-color .15s,box-shadow .15s,transform .12s}
.qz .qz-opt:hover{border-color:#1B2A41;transform:translateY(-2px)}
.qz .qz-opt.on{border-color:#1B2A41;box-shadow:0 0 0 2.5px #1B2A41}
.qz .qz-opt.ok{border-color:#1E7F3C;box-shadow:0 0 0 2.5px #1E7F3C}
.qz .qz-opt.no{border-color:#C0392B;box-shadow:0 0 0 2.5px #C0392B}
.qz .qz-lt{position:absolute;top:6px;left:8px;font:800 12px 'Archivo';width:22px;height:22px;border-radius:50%;background:#1B2A41;color:#fff;display:flex;align-items:center;justify-content:center}
.qz .qz-why{font:500 9.5px/1.35 ${MONO};color:#5B6B7C;padding:3px 3px 2px;min-height:12px}
.qz .qz-act{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 4px}
.qz .qz-go{font:700 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;padding:10px 16px;border-radius:7px;border:2px solid #1B2A41;background:#1B2A41;color:#fff;cursor:pointer;transition:transform .08s,box-shadow .2s}
.qz .qz-go:hover{box-shadow:3px 3px 0 rgba(212,98,42,.45)}
.qz .qz-go:active{transform:scale(.96)}
.qz .qz-go.gh{background:#fff;color:#1B2A41}
.qz .qz-score{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;margin:10px 0;font:600 12px ${MONO};animation:sl-rise .3s ease-out both}
.qz .qz-score.all{background:#E9F6EC;border:1.5px solid #1E7F3C;color:#1E7F3C}
.qz .qz-score.part{background:#FBF4E6;border:1.5px solid #C98A12;color:#8A5B00}
.qz .qz-bar{flex:1;height:8px;border-radius:5px;background:rgba(0,0,0,.08);overflow:hidden}
.qz .qz-bar i{display:block;height:100%;background:currentColor;border-radius:5px;transition:width .6s cubic-bezier(.3,1.3,.5,1)}
.qz .qz-hint{font:500 12px/1.55 'Archivo';color:#2a3a4f;background:#E8F4F1;border:1px solid rgba(14,138,123,.45);border-radius:7px;padding:9px 12px;margin:8px 0;animation:sl-rise .3s ease-out both}
.qz .qz-hint b{font:700 8.5px ${MONO};letter-spacing:.13em;text-transform:uppercase;color:#0E8A7B;display:block;margin-bottom:3px}
.qz .qz-sol{border:1.5px solid #1B2A41;border-radius:8px;padding:10px 13px;margin-top:10px;background:#fff;animation:sl-rise .35s ease-out both}
.qz .qz-sol h5{margin:2px 0 6px;font:700 9px ${MONO};letter-spacing:.13em;text-transform:uppercase}
.qz .qz-sol p,.qz .qz-sol li{font:400 12.5px/1.6 'Archivo';color:#33455a;margin:4px 0}
.qz .qz-sol ul{margin:4px 0;padding-left:18px}
.qz .qz-sol code{font:600 11.5px ${MONO};color:#1B2A41}
.qz .qz-ov{display:flex;gap:5px}
@keyframes sl-rise{0%{transform:translateY(8px);opacity:0}100%{transform:none;opacity:1}}
@media(max-width:760px){.qz .qz-grid{gap:7px}.qz input.qz-num{width:84px;font-size:16px}.qz .qz-b{padding:8px 11px}.qz .qz-row{grid-template-columns:1fr}.qz .qz-tg{justify-content:flex-start}}
@media (prefers-reduced-motion: reduce){.qz *{animation:none !important;transition:none !important}}
`;

/** phone-width viewport? (a narrower viewBox makes the figure's text larger on screen) */
function useNarrow(bp = 760) {
  const q = `(max-width:${bp}px)`;
  const [n, setN] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const m = window.matchMedia(q), h = e => setN(e.matches);
    m.addEventListener ? m.addEventListener("change", h) : m.addListener(h);
    return () => { m.removeEventListener ? m.removeEventListener("change", h) : m.removeListener(h); };
  }, [q]);
  return n;
}

export default function QuizPanel({ model, title, prompt, tag, seed = 1, standard = false, onNext, onSolved, onReveal, nextLabel = "Next question" }) {
  const quiz = useMemo(() => buildQuiz(model, { seed, standard }), [model, seed, standard]);
  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(null);
  const [hints, setHints] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [overlay, setOverlay] = useState("M");
  const [party, setParty] = useState(false);
  const narrow = useNarrow();
  const PW = narrow ? 440 : 760, PH = narrow ? 330 : 380;

  if (!quiz.stable) return <div className="qz"><style>{CSS}</style><p className="qz-prompt">This structure is a mechanism ({quiz.reason}), so there is nothing to sketch yet — add a support or remove a hinge.</p></div>;

  const set = (id, v) => { setAnswers(a => ({ ...a, [id]: v })); setGraded(null); };
  const check = () => {
    const g = gradeQuiz(quiz, answers);
    setGraded(g);
    if (g.allCorrect) { setParty(true); onSolved && onSolved(g); }
  };
  const reveal = () => { setRevealed(true); onReveal && onReveal(); };
  const st = id => (graded ? (graded.results[id].ok ? " ok" : " no") : "");
  const groups = ["Reactions", "Sketches", "Key values"].map(g => [g, quiz.parts.filter(p => p.group === g)]).filter(([, ps]) => ps.length);
  const isBeam = model.nodes.every(n => Math.abs(n.y) < 1e-9);
  const breakdown = revealed && !isBeam ? frameMemberBreakdown(model, quiz.res).filter(b => b.loaded) : [];
  const beamStory = useMemo(() => {
    if (!revealed || !isBeam) return null;
    const cfg = frameToBeam(model), r = analyzeBeam({ ...cfg, EI: 2e4, hinges: cfg.hinges.map(h => h.x) });
    if (!r.stable) return null;
    const x0 = Math.min(...model.nodes.map(n => n.x));
    const name = x => (model.nodes.find(n => Math.abs(n.x - x0 - x) < 1e-6) || { id: "?" }).id; // the figure's own letters
    return { name, bd: beamReactionBreakdown(cfg.L, cfg.loads, r), sm: beamSpanMoments(cfg.L, cfg.loads, r) };
  }, [revealed, isBeam, model]);

  const part = p => {
    const fb = graded && !graded.results[p.id].ok ? graded.results[p.id].msg : "";
    if (p.type === "num") return (
      <div key={p.id} className={"qz-row" + st(p.id)}>
        <div className="qz-l">{p.label}<small>{p.unit} · {p.sense}</small></div>
        <div className="qz-in"><input className="qz-num" type="number" inputMode="decimal" step="any" value={answers[p.id] ?? ""} onChange={e => set(p.id, e.target.value)} aria-label={p.label} /><span className="qz-u">{p.unit}</span></div>
        {(fb || revealed) && <div className="qz-fb">{fb && <>{graded.results[p.id].ok ? "" : "✗ "}{fb}. </>}{revealed && <>Answer: <b>{f2(p.expected)} {p.unit}</b></>}</div>}
      </div>
    );
    if (p.type === "dir" || p.type === "count") {
      const opts = p.type === "dir" ? p.options : Array.from({ length: Math.max(5, p.expected + 2) }, (_, i) => String(i));
      return (
        <div key={p.id} className={"qz-row" + st(p.id)}>
          <div className="qz-l">{p.label}</div>
          <div className="qz-tg">{opts.map((o, i) => <button key={i} className={"qz-b" + (Number(answers[p.id]) === i && answers[p.id] !== undefined ? " on" : "") + (revealed && p.expected === i ? " key" : "")} onClick={() => set(p.id, i)}>{o}</button>)}</div>
          {fb && <div className="qz-fb">✗ {fb}</div>}
        </div>
      );
    }
    // sketch choice
    const chosen = answers[p.id];
    return (
      <div key={p.id}>
        <div className="qz-q">{p.label}</div>
        <div className="qz-grid">
          {p.options.map((o, i) => {
            const cls = revealed ? (i === p.expected ? " ok" : chosen === i ? " no" : "") : graded && chosen === i ? (graded.results[p.id].ok ? " ok" : " no") : chosen === i ? " on" : "";
            return (
              <button key={i} className={"qz-opt" + cls} onClick={() => set(p.id, i)} aria-label={`Option ${o.letter}`}>
                <span className="qz-lt">{o.letter}</span>
                <ModelSketch W={380} H={230} compact model={model} res={o.res} diagram={p.kind} flip={o.flip} flipMembers={o.flipMembers || []} showLoads={false} showDims={false} />
                <div className="qz-why">{revealed ? (i === p.expected ? "✓ correct" : `✗ ${o.label}`) : ""}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="qz">
      <style>{CSS}</style>
      {(title || tag) && <div className="qz-head"><div className="qz-tt">{title}</div>{tag && <span className="qz-tag" style={{ color: tag.color || "#5B5BD6" }}>{tag.text}</span>}</div>}
      {prompt && <p className="qz-prompt">{prompt}</p>}
      <ScratchPad resetKey={`${seed}:${JSON.stringify(model.nodes)}:${PW}`} W={PW} H={PH}
        background={<SketchLayer model={model} W={PW} H={PH} />}
        overlay={revealed && overlay ? <SketchLayer model={model} res={quiz.res} diagram={overlay} W={PW} H={PH} showStructure={false} valueLabels={overlay === "M"} /> : null}
        extra={revealed ? <div className="qz-ov">{[["M", "BMD"], ["D", "deflected"], [null, "hide"]].map(([k, lab]) => <button key={lab} className={"qz-b" + (overlay === k ? " on" : "")} onClick={() => setOverlay(k)}>{lab}</button>)}</div> : null} />

      {groups.map(([g, ps]) => <div key={g}><div className="qz-sec">{g}</div>{ps.map(part)}</div>)}

      <div className="qz-act">
        <button className="qz-go" onClick={check}>Check answers</button>
        <button className="qz-go gh" onClick={() => setHints(h => Math.min(h + 1, quiz.hints.length))} disabled={hints >= quiz.hints.length}>Hint {hints < quiz.hints.length ? `(${hints + 1}/${quiz.hints.length})` : "— all shown"}</button>
        <button className="qz-go gh" onClick={reveal} disabled={revealed}>Reveal solution</button>
        {onNext && <button className="qz-go gh" onClick={onNext}>{nextLabel} →</button>}
      </div>

      {graded && (
        <div className={"qz-score " + (graded.allCorrect ? "all" : "part")}>
          <span>{graded.correct} / {graded.total} right</span>
          <span className="qz-bar"><i style={{ width: `${(100 * graded.correct) / graded.total}%` }} /></span>
          <span>{graded.allCorrect ? "🎉 full marks" : "have another look at the red ones"}</span>
        </div>
      )}
      {quiz.hints.slice(0, hints).map((h, i) => <div key={i} className="qz-hint"><b>Hint {i + 1}</b>{h}</div>)}

      {revealed && (
        <div className="qz-sol">
          <h5>Solution</h5>
          <p>The bending moment diagram is now drawn over your sketch (switch to the deflected shape with the buttons on the pad). {quiz.determinate ? "The structure is statically determinate, so every value follows from equilibrium alone." : `It is indeterminate to degree ${quiz.SI}, so the split of moments depends on relative stiffness — the solver settles it by compatibility.`}</p>
          <ul>
            {quiz.res.reactions.map((r, i) => <li key={i}>Support <code>{r.node}</code> ({r.type === "rollerV" ? "roller" : r.type}): {[["Rx", "H", "kN"], ["Ry", "V", "kN"], ["M", "M", "kN·m"]].filter(([k]) => Math.abs(r[k]) > 1e-6).map(([k, lab, u]) => <code key={k} style={{ marginRight: 10 }}>{lab} = {f2(r[k])} {u}</code>)}</li>)}
            <li>Largest bending moment <code>{f2(Math.abs(quiz.peak.v))} kN·m</code> in <code>{quiz.peak.member}</code>, {f2(quiz.peak.s)} m from its start.</li>
          </ul>
          {beamStory && <>
            <h5 style={{ marginTop: 10 }}>How each reaction is made up</h5>
            <ul>{beamStory.bd.supports.map((sp, i) => {
              const bits = sp.parts.map(pt => pt.kind === "span"
                ? `${f2(pt.free)} from span ${beamStory.name(pt.span.xa)}–${beamStory.name(pt.span.xb)} as if simply supported${Math.abs(pt.cont) > 1e-6 ? ` ${pt.cont >= 0 ? "+" : "−"} ${f2(Math.abs(pt.cont))} continuity` : ""}`
                : pt.kind === "overhang" ? `${f2(pt.free)} from the overhang` : `${f2(pt.free)} sitting right on it`);
              return <li key={i}><code>R_{beamStory.name(sp.x)} = {f2(sp.sum)} kN</code> = {bits.join(" + ")}.</li>;
            })}</ul>
            <p style={{ fontSize: 11.5 }}>Continuity share = (M at far end − M at near end) ÷ span: a hogging moment over a support draws load towards it.</p>
            <h5 style={{ marginTop: 10 }}>How the moments come about</h5>
            <ul>
              {beamStory.sm.spans.filter(sp => sp.peak).map((sp, i) => <li key={i}>Span <code>{beamStory.name(sp.xa)}–{beamStory.name(sp.xb)}</code>: as a simple span the load would give <code>{f2(sp.peak.m0)}</code> at {f2(sp.peak.x - sp.xa)} m in; the closing line between the support moments ({f2(sp.Ma)} and {f2(sp.Mb)}) sits at <code>{f2(sp.peak.close)}</code> there, so M = {f2(sp.peak.m0)} {sp.peak.close < 0 ? "−" : "+"} {f2(Math.abs(sp.peak.close))} = <code>{f2(sp.peak.M)} kN·m</code>.</li>)}
              {beamStory.sm.overhangs.filter(o => Math.abs(o.M) > 1e-6).map((o, i) => <li key={"o" + i}>The {o.side} overhang hangs off <code>{beamStory.name(o.x)}</code> like a cantilever, giving <code>{f2(o.M)} kN·m</code> (hogging) over that support.</li>)}
            </ul>
          </>}
          {breakdown.length > 0 && <>
            <h5 style={{ marginTop: 10 }}>How the moments come about</h5>
            <ul>{breakdown.map(b => <li key={b.id}><code>{b.id}</code>: the load alone would give a free (simply supported) moment of <code>{f2(b.m0)}</code> at midspan; the end moments are <code>{f2(b.M1)}</code> and <code>{f2(b.M2)}</code>, so midspan M = {f2(b.m0)} + ({f2(b.M1)} + {f2(b.M2)})/2 = <code>{f2(b.Mmid)} kN·m</code>.</li>)}</ul>
          </>}
        </div>
      )}
      <Celebrate show={party} onDone={() => setParty(false)} detail={graded ? `All ${graded.total} parts right — that's the reasoning the examiners look for.` : ""} />
    </div>
  );
}
