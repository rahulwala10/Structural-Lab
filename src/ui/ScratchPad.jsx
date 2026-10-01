import React, { useEffect, useRef, useState } from "react";

/* A doodle pad over a figure: sketch your BMD or deflected shape on top of the
   structure, then compare with the solution overlay. Pointer events cover
   mouse, touch and stylus alike. Strokes live in viewBox units, so they stay
   put when the pad is resized. */

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const PENS = [
  { c: "#1B2A41", name: "ink" },
  { c: "#D4622A", name: "orange" },
  { c: "#0E8A7B", name: "teal" },
  { c: "#5B5BD6", name: "violet" },
];

const CSS = `
.sp{border:1.5px solid #1B2A41;border-radius:8px;background:#fff;overflow:hidden}
.sp .sp-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:7px 9px;border-bottom:1.2px dashed #D7E0E6;background:#F7F9FA}
.sp .sp-t{font:700 9px ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#5B6B7C;margin-right:4px}
.sp .sp-pen{width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1.3px #C2CDD6;cursor:pointer;padding:0;transition:transform .12s}
.sp .sp-pen.on{box-shadow:0 0 0 2.4px #1B2A41;transform:scale(1.12)}
.sp .sp-b{font:600 9.5px ${MONO};letter-spacing:.05em;padding:5px 9px;border:1.3px solid #C2CDD6;background:#fff;border-radius:5px;cursor:pointer;color:#1B2A41;text-transform:uppercase}
.sp .sp-b:hover{border-color:#1B2A41}
.sp .sp-b.on{background:#1B2A41;border-color:#1B2A41;color:#fff}
.sp .sp-b:disabled{opacity:.4;cursor:default}
.sp .sp-sp{flex:1}
.sp svg.sp-svg{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair;background:
  repeating-linear-gradient(0deg,transparent,transparent 23px,rgba(27,42,65,.045) 23px,rgba(27,42,65,.045) 24px),
  repeating-linear-gradient(90deg,transparent,transparent 23px,rgba(27,42,65,.045) 23px,rgba(27,42,65,.045) 24px),#fff}
.sp svg.sp-svg.erase{cursor:cell}
@media(max-width:760px){.sp .sp-pen{width:30px;height:30px}.sp .sp-b{padding:8px 11px;font-size:10.5px}}
`;

function pathOf(pts) {
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]} l0.01 0`;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    d += ` Q${x1.toFixed(1)} ${y1.toFixed(1)} ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}`;
  }
  const [xl, yl] = pts[pts.length - 1];
  return d + ` L${xl.toFixed(1)} ${yl.toFixed(1)}`;
}

export default function ScratchPad({ W = 760, H = 380, background = null, overlay = null, resetKey, title = "Scratch pad — sketch your answer", extra = null }) {
  const [strokes, setStrokes] = useState([]);
  const [pen, setPen] = useState(PENS[0].c);
  const [erase, setErase] = useState(false);
  const [width, setWidth] = useState(3);
  const live = useRef(null);
  const svgRef = useRef(null);
  const [, force] = useState(0);

  useEffect(() => { setStrokes([]); live.current = null; }, [resetKey]);

  const at = e => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const rubOut = p => setStrokes(ss => ss.filter(s => !s.pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 12)));

  const down = e => {
    e.preventDefault();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
    const p = at(e);
    if (erase) { live.current = { erasing: true }; rubOut(p); return; }
    live.current = { c: pen, w: width * (e.pointerType === "pen" && e.pressure ? 0.6 + e.pressure : 1), pts: [p] };
    force(n => n + 1);
  };
  const move = e => {
    const s = live.current;
    if (!s) return;
    const p = at(e);
    if (s.erasing) { rubOut(p); return; }
    const last = s.pts[s.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
    s.pts.push(p);
    force(n => n + 1);
  };
  const up = () => {
    const s = live.current;
    live.current = null;
    if (s && !s.erasing && s.pts.length) setStrokes(ss => [...ss, s]);
  };

  return (
    <div className="sp">
      <style>{CSS}</style>
      <div className="sp-bar">
        <span className="sp-t">{title}</span>
        {PENS.map(p => <button key={p.c} className={"sp-pen" + (!erase && pen === p.c ? " on" : "")} style={{ background: p.c }} title={`${p.name} pen`} aria-label={`${p.name} pen`} onClick={() => { setPen(p.c); setErase(false); }} />)}
        <button className={"sp-b" + (width > 3 ? " on" : "")} onClick={() => setWidth(w => (w > 3 ? 3 : 6))} title="thick / thin pen">{width > 3 ? "thick" : "thin"}</button>
        <button className={"sp-b" + (erase ? " on" : "")} onClick={() => setErase(v => !v)} title="rub out strokes">eraser</button>
        <button className="sp-b" disabled={!strokes.length} onClick={() => setStrokes(ss => ss.slice(0, -1))}>undo</button>
        <button className="sp-b" disabled={!strokes.length} onClick={() => setStrokes([])}>clear</button>
        <span className="sp-sp" />
        {extra}
      </div>
      <svg ref={svgRef} className={"sp-svg" + (erase ? " erase" : "")} viewBox={`0 0 ${W} ${H}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
        <g style={{ pointerEvents: "none" }}>{background}</g>
        {strokes.map((s, i) => <path key={i} d={pathOf(s.pts)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />)}
        {live.current && !live.current.erasing && <path d={pathOf(live.current.pts)} fill="none" stroke={live.current.c} strokeWidth={live.current.w} strokeLinecap="round" strokeLinejoin="round" />}
        <g style={{ pointerEvents: "none" }}>{overlay}</g>
      </svg>
    </div>
  );
}
