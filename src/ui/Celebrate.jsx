import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

/* "Beam Buddy" — an I-beam in a hard hat who dances when every answer is right.
   Pure SVG + CSS keyframes; with reduced motion he just stands there, beaming. */

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const CHEERS = ["Spot on!", "Nailed it!", "Textbook!", "Bang on!", "Exam-ready!", "Structurally sound!"];
const COLORS = ["#D4622A", "#0E8A7B", "#5B5BD6", "#F4B400", "#2F77B5", "#C0392B", "#1E7F3C"];

const CSS = `
.cel{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(14,25,41,.45);animation:cel-in .25s ease-out both;cursor:pointer;padding:16px}
@keyframes cel-in{from{opacity:0}to{opacity:1}}
.cel .cel-card{position:relative;background:#fff;border:2px solid #1B2A41;border-radius:14px;box-shadow:6px 6px 0 rgba(212,98,42,.35);padding:14px 22px 18px;text-align:center;max-width:340px;width:100%;animation:cel-card .55s cubic-bezier(.3,1.5,.5,1) both}
@keyframes cel-card{0%{transform:scale(.5) rotate(-6deg);opacity:0}100%{transform:scale(1) rotate(0)}}
.cel .cel-h{font:800 26px 'Archivo',system-ui,sans-serif;color:#1B2A41;margin:2px 0 2px;letter-spacing:.01em}
.cel .cel-s{font:500 11px ${MONO};color:#5B6B7C;line-height:1.5}
.cel .cel-x{font:600 9.5px ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#8FA3B8;margin-top:10px}
.cel svg{display:block;width:180px;height:216px;margin:0 auto;overflow:visible}
.cel .bb-body{animation:bb-bounce .62s ease-in-out infinite alternate;transform-origin:100px 214px}
.cel .bb-armL{animation:bb-wave .31s ease-in-out infinite alternate;transform-origin:60px 107px}
.cel .bb-armR{animation:bb-wave .31s ease-in-out infinite alternate-reverse;transform-origin:140px 107px}
.cel .bb-legL{animation:bb-kick .62s ease-in-out infinite alternate;transform-origin:82px 168px}
.cel .bb-legR{animation:bb-kick .62s ease-in-out infinite alternate-reverse;transform-origin:118px 168px}
.cel .bb-hat{animation:bb-hat .31s ease-in-out infinite alternate;transform-origin:100px 52px}
.cel .bb-eyes{animation:bb-blink 2.4s infinite;transform-origin:100px 64px}
.cel .bb-shadow{animation:bb-shadow .62s ease-in-out infinite alternate;transform-origin:100px 222px}
@keyframes bb-bounce{0%{transform:translateY(0) rotate(-7deg)}100%{transform:translateY(-16px) rotate(7deg)}}
@keyframes bb-wave{0%{transform:rotate(-28deg)}100%{transform:rotate(30deg)}}
@keyframes bb-kick{0%{transform:rotate(-14deg)}100%{transform:rotate(16deg)}}
@keyframes bb-hat{0%{transform:translateY(0) rotate(-4deg)}100%{transform:translateY(-3px) rotate(4deg)}}
@keyframes bb-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes bb-shadow{0%{transform:scaleX(1);opacity:.25}100%{transform:scaleX(.72);opacity:.14}}
.cel .cf{position:fixed;top:-4vh;border-radius:2px;animation:cf-fall linear forwards;pointer-events:none}
@keyframes cf-fall{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(112vh) rotate(720deg)}}
@media (prefers-reduced-motion: reduce){.cel,.cel .cel-card,.cel .bb-body,.cel .bb-armL,.cel .bb-armR,.cel .bb-legL,.cel .bb-legR,.cel .bb-hat,.cel .bb-eyes,.cel .bb-shadow{animation:none}.cel .cf{display:none}}
`;

export function BeamBuddy() {
  const ink = "#1B2A41", steel = "#4F6D8F", steelHi = "#7D98B6", skin = "#FFD7B0";
  return (
    <svg viewBox="0 0 200 240" aria-hidden="true">
      <ellipse className="bb-shadow" cx="100" cy="222" rx="46" ry="7" fill={ink} opacity=".22" />
      <g className="bb-body">
        <g className="bb-legL"><line x1="82" y1="168" x2="74" y2="208" stroke={ink} strokeWidth="7" strokeLinecap="round" /><ellipse cx="68" cy="212" rx="12" ry="6.5" fill={ink} /></g>
        <g className="bb-legR"><line x1="118" y1="168" x2="126" y2="208" stroke={ink} strokeWidth="7" strokeLinecap="round" /><ellipse cx="132" cy="212" rx="12" ry="6.5" fill={ink} /></g>
        <g className="bb-armL"><line x1="60" y1="107" x2="34" y2="80" stroke={ink} strokeWidth="7" strokeLinecap="round" /><circle cx="31" cy="76" r="8" fill={skin} stroke={ink} strokeWidth="1.6" /></g>
        <g className="bb-armR"><line x1="140" y1="107" x2="166" y2="80" stroke={ink} strokeWidth="7" strokeLinecap="round" /><circle cx="169" cy="76" r="8" fill={skin} stroke={ink} strokeWidth="1.6" /></g>
        {/* I-section body: flange, web, flange */}
        <rect x="56" y="98" width="88" height="15" rx="3" fill={steel} stroke={ink} strokeWidth="1.8" />
        <rect x="89" y="112" width="22" height="46" fill={steel} stroke={ink} strokeWidth="1.8" />
        <rect x="56" y="157" width="88" height="15" rx="3" fill={steel} stroke={ink} strokeWidth="1.8" />
        <rect x="60" y="101" width="80" height="3.5" rx="1.5" fill={steelHi} opacity=".8" />
        <rect x="60" y="160" width="80" height="3.5" rx="1.5" fill={steelHi} opacity=".8" />
        {[66, 134].map(x => <g key={x}><circle cx={x} cy="106" r="2.2" fill={ink} /><circle cx={x} cy="165" r="2.2" fill={ink} /></g>)}
        <text x="100" y="141" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily={MONO} fill="#fff">EI</text>
        {/* head */}
        <circle cx="100" cy="64" r="30" fill={skin} stroke={ink} strokeWidth="1.8" />
        <circle cx="83" cy="75" r="5" fill="#F28B82" opacity=".55" /><circle cx="117" cy="75" r="5" fill="#F28B82" opacity=".55" />
        <g className="bb-eyes">
          <ellipse cx="89" cy="63" rx="3.8" ry="4.8" fill={ink} /><ellipse cx="111" cy="63" rx="3.8" ry="4.8" fill={ink} />
          <circle cx="90.3" cy="61.3" r="1.3" fill="#fff" /><circle cx="112.3" cy="61.3" r="1.3" fill="#fff" />
        </g>
        <path d="M87 75 Q100 90 113 75 Q100 81 87 75 Z" fill="#B23A2E" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        <g className="bb-hat">
          <path d="M70 52 Q72 22 100 21 Q128 22 130 52 Z" fill="#F4B400" stroke={ink} strokeWidth="1.8" />
          <path d="M100 21 L100 50" stroke="#D99A00" strokeWidth="5" />
          <rect x="62" y="48" width="76" height="9" rx="4.5" fill="#E8A800" stroke={ink} strokeWidth="1.8" />
        </g>
      </g>
    </svg>
  );
}

export default function Celebrate({ show, onDone, detail = "", ms = 6500 }) {
  const cheer = useMemo(() => CHEERS[Math.floor(Math.random() * CHEERS.length)], [show]);
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: Math.random() * 100, w: 6 + Math.random() * 7, h: 9 + Math.random() * 9, c: COLORS[i % COLORS.length],
    dur: 2.4 + Math.random() * 1.8, delay: Math.random() * 0.9, round: Math.random() < 0.3,
  })), [show]);
  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(() => onDone && onDone(), ms);
    const key = e => { if (e.key === "Escape" || e.key === "Enter") onDone && onDone(); };
    window.addEventListener("keydown", key);
    return () => { clearTimeout(t); window.removeEventListener("keydown", key); };
  }, [show, ms, onDone]);
  if (!show) return null;
  // portal to <body>: an animated (transformed) ancestor would otherwise trap position:fixed
  const overlay = (
    <div className="cel" role="dialog" aria-live="polite" aria-label={cheer} onClick={() => onDone && onDone()}>
      <style>{CSS}</style>
      {bits.map((b, i) => <span key={i} className="cf" style={{ left: `${b.left}%`, width: b.w, height: b.round ? b.w : b.h, background: b.c, borderRadius: b.round ? "50%" : 2, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} />)}
      <div className="cel-card">
        <BeamBuddy />
        <div className="cel-h">{cheer}</div>
        {detail && <div className="cel-s">{detail}</div>}
        <div className="cel-x">tap anywhere to carry on</div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}
