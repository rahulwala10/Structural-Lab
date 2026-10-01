import React, { useMemo, useState } from "react";
import { randomQuestion } from "../engine/practice.mjs";
import QuizPanel from "./ui/QuizPanel.jsx";
import { SignCard } from "./ui/SignGlyphs.jsx";
import { BeamBuddy } from "./ui/Celebrate.jsx";
import { KEYFRAMES } from "./ui/motion.js";

/* ============================================================
   PRACTICE — random exam-style questions on beams and frames.
   Each question number rebuilds the same problem, so it can be
   revisited or shared. Answers come from the verified solver.
   ============================================================ */

const C = { sheet: "#EEF1F3", panel: "#FFFFFF", ink: "#1B2A41", inkSoft: "#5B6B7C", grid: "#D7E0E6", line: "#C2CDD6", nav: "#16263C", navSoft: "#8FA3B8", moment: "#D4622A", shear: "#0E8A7B", defl: "#5B5BD6", good: "#1E7F3C" };
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const newSeed = () => 100000 + Math.floor(Math.random() * 900000);

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
${KEYFRAMES}
.pr *{box-sizing:border-box}
.pr{min-height:100vh;padding:16px;color:${C.ink};font-family:'Archivo',system-ui,sans-serif;background:
  repeating-linear-gradient(90deg,transparent,transparent 27px,rgba(27,42,65,.022) 27px,rgba(27,42,65,.022) 28px),
  repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(27,42,65,.04) 27px,rgba(27,42,65,.04) 28px),
  radial-gradient(1100px 460px at 82% -8%,rgba(212,98,42,.07),transparent 60%),${C.sheet}}
.pr .tb{position:relative;border:2px solid ${C.ink};border-top-width:0;background:${C.panel};display:grid;grid-template-columns:1fr auto auto;box-shadow:3px 3px 0 rgba(27,42,65,.12)}
.pr .tb::before{content:"";position:absolute;top:-2px;left:-2px;right:-2px;height:5px;background:linear-gradient(90deg,${C.moment},${C.shear},${C.defl},${C.moment});background-size:200% 100%;animation:sl-shimmer 6s linear infinite}
.pr .tbc{padding:11px 16px;border-left:2px solid ${C.ink};display:flex;flex-direction:column;justify-content:center;gap:3px}
.pr .tbc:first-child{border-left:none;background:${C.nav};color:#fff}
.pr .ttl{font:800 19px 'Archivo';letter-spacing:.03em;display:flex;align-items:center;gap:9px}
.pr .tmeta{font:500 9px ${MONO};letter-spacing:.12em;color:${C.inkSoft};text-transform:uppercase}
.pr .tbc:first-child .tmeta{color:${C.navSoft}}
.pr .tval{font:600 13px ${MONO}}
.pr .stamp{border:2.5px solid var(--sc);color:var(--sc);padding:6px 12px;font:700 10.5px ${MONO};letter-spacing:.08em;transform:rotate(-2.5deg);white-space:nowrap;animation:sl-stamp .5s cubic-bezier(.3,1.4,.5,1) both}
.pr .work{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;margin-top:16px;align-items:start}
@media(max-width:1000px){.pr .work{grid-template-columns:1fr}}
.pr .panel{background:${C.panel};border:1.5px solid ${C.ink};border-radius:8px;margin-bottom:14px;overflow:hidden}
.pr .ph{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-bottom:1.5px solid ${C.ink};font:600 10px ${MONO};letter-spacing:.11em;text-transform:uppercase}
.pr .pad{padding:12px}
.pr .ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pr .seg{display:flex;border:1.5px solid ${C.ink};border-radius:7px;overflow:hidden}
.pr .seg button{font:600 10px ${MONO};letter-spacing:.06em;text-transform:uppercase;padding:9px 13px;border:none;border-right:1.2px solid ${C.ink};background:#fff;color:${C.ink};cursor:pointer}
.pr .seg button:last-child{border-right:none}
.pr .seg button.on{background:${C.ink};color:#fff}
.pr .dice{font:700 11px ${MONO};letter-spacing:.06em;text-transform:uppercase;padding:10px 16px;border-radius:7px;border:2px solid ${C.moment};background:${C.moment};color:#fff;cursor:pointer;display:inline-flex;gap:7px;align-items:center;transition:transform .1s}
.pr .dice:hover{transform:translateY(-1px) rotate(-1deg)}
.pr .dice:active{transform:scale(.95)}
.pr .dice .d{display:inline-block;transition:transform .5s cubic-bezier(.3,1.5,.5,1)}
.pr .dice:hover .d{transform:rotate(200deg)}
.pr .qn{display:flex;align-items:center;gap:6px;font:500 10px ${MONO};color:${C.inkSoft}}
.pr .qn input{width:96px;font:600 12px ${MONO};padding:7px;border:1.3px solid ${C.line};border-radius:5px}
.pr .btn{font:600 10px ${MONO};letter-spacing:.05em;text-transform:uppercase;padding:8px 11px;border:1.4px solid ${C.ink};border-radius:6px;background:#fff;cursor:pointer;color:${C.ink}}
.pr .btn:hover{background:${C.ink};color:#fff}
.pr .tally{display:flex;gap:14px;align-items:center}
.pr .tally b{font:800 22px 'Archivo'}
.pr .tally span{font:500 9px ${MONO};letter-spacing:.1em;text-transform:uppercase;color:${C.inkSoft};display:block}
.pr .tip{font:400 12.5px/1.6 'Archivo';color:#33455a;margin:0 0 8px}
.pr ol.steps{margin:4px 0 0;padding-left:20px}
.pr ol.steps li{font:400 12.5px/1.6 'Archivo';color:#33455a;margin-bottom:4px}
.pr ol.steps b{color:${C.ink}}
.pr .buddy{display:flex;gap:10px;align-items:center}
.pr .buddy svg{width:64px;height:78px;flex:0 0 auto}
.pr .fresh{animation:sl-rise .35s ease-out both}
@media(max-width:760px){.pr{padding:8px}.pr .tb{grid-template-columns:1fr}.pr .tbc{border-left:none;border-top:1.5px solid ${C.ink}}.pr .tbc:first-child{border-top:none}.pr .ttl{font-size:16px}.pr .seg button{padding:10px 12px}}
@media (prefers-reduced-motion: reduce){.pr .tb::before,.pr .stamp,.pr .fresh{animation:none}}
`;

export default function Practice({ onOpenInLab }) {
  const [family, setFamily] = useState("any");
  const [seed, setSeed] = useState(newSeed);
  const [typed, setTyped] = useState("");
  const [tally, setTally] = useState({ tried: 0, solved: 0, streak: 0 });
  const q = useMemo(() => randomQuestion(seed, family), [seed, family]);

  const next = () => { setSeed(newSeed()); setTally(t => ({ ...t, tried: t.tried + 1, streak: t.streak })); };
  const solved = () => setTally(t => ({ tried: t.tried, solved: t.solved + 1, streak: t.streak + 1 }));
  const load = () => { const n = parseInt(typed, 10); if (isFinite(n) && n > 0) setSeed(n); };
  const stamp = q.determinate ? { txt: "DETERMINATE", col: C.good } : { txt: `INDETERMINATE ×${q.SI}`, col: C.moment };

  return (
    <div className="pr">
      <style>{CSS}</style>
      <div className="tb">
        <div className="tbc">
          <div className="ttl">✎ PRACTICE · STRUCTURAL BEHAVIOUR</div>
          <div className="tmeta">Exam-style beams &amp; frames · sketch, reason, check</div>
        </div>
        <div className="tbc">
          <div className="tmeta">Question</div>
          <div className="tval">#{seed} · {q.family}</div>
        </div>
        <div className="tbc" style={{ alignItems: "center", justifyContent: "center" }}>
          <div key={seed} className="stamp" style={{ "--sc": stamp.col }}>{stamp.txt}</div>
        </div>
      </div>

      <div className="work">
        <div>
          <div className="panel">
            <div className="pad ctl">
              <div className="seg" role="group" aria-label="Structure type">
                {[["any", "Both"], ["beam", "Beams"], ["frame", "Frames"]].map(([k, lab]) => <button key={k} className={family === k ? "on" : ""} onClick={() => { setFamily(k); setSeed(newSeed()); }}>{lab}</button>)}
              </div>
              <button className="dice" onClick={next}><span className="d">🎲</span> New question</button>
              <span className="qn">or go to #<input value={typed} onChange={e => setTyped(e.target.value.replace(/\D/g, ""))} onKeyDown={e => { if (e.key === "Enter") load(); }} placeholder={String(seed)} aria-label="question number" /><button className="btn" onClick={load}>Go</button></span>
              {onOpenInLab && <button className="btn" onClick={() => onOpenInLab(q)} title="explore this structure with live diagrams">Open in {q.family === "beam" ? "Beam" : "Frame"} lab ↗</button>}
            </div>
          </div>
          <div className="panel fresh" key={`${family}:${seed}`}>
            <div className="pad">
              <QuizPanel model={q.model} title={q.title} prompt={q.prompt} seed={seed} standard={q.standard}
                tag={{ text: q.determinate ? "statics only" : q.standard ? "standard results" : "qualitative", color: q.determinate ? C.good : C.moment }}
                onNext={next} onSolved={solved} />
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="ph"><span>This session</span></div>
            <div className="pad">
              <div className="tally">
                <div><b>{tally.solved}</b><span>full marks</span></div>
                <div><b>{tally.tried + 1}</b><span>attempted</span></div>
                <div><b>{tally.streak}</b><span>streak</span></div>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="ph"><span>How to attack it</span></div>
            <div className="pad">
              <div className="buddy"><BeamBuddy /><p className="tip" style={{ margin: 0 }}>Doodle on the pad first — reactions, then the bending moment, then the deflected shape — and only then pick your answers. Get every part right and I'll dance.</p></div>
              <ol className="steps">
                <li><b>Determinacy.</b> Count reactions and releases. Zero → statics gives everything.</li>
                <li><b>Reactions.</b> Directions first: which way must each support push to stop the structure moving?</li>
                <li><b>Moment at the "easy" points.</b> Zero at pins, rollers, hinges and free ends; hogging at fixed ends under gravity.</li>
                <li><b>Shape between them.</b> Straight lines between point loads, parabolas under UDLs. For indeterminate members, hang the free moment from the closing line.</li>
                <li><b>Deflected shape last.</b> It must agree with the BMD: sagging bends like a smile, hogging like a frown; a fixed end leaves at zero slope; a hinge may kink.</li>
              </ol>
            </div>
          </div>
          <div className="panel"><div className="pad"><SignCard kind="frame" /></div></div>
        </div>
      </div>
    </div>
  );
}
