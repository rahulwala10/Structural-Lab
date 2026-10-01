import React from "react";

/* Small pictures of the sign conventions, sized for panel headers.
   Inline styles on purpose: the labs set `svg { width: 100% }`. */

const box = (w, h) => ({ display: "inline-block", width: w, height: h, verticalAlign: "middle", flex: "0 0 auto", overflow: "visible" });
const head = (x, y, dir, c) => {
  const d = { down: `M${x - 3} ${y - 5} L${x + 3} ${y - 5} L${x} ${y} Z`, up: `M${x - 3} ${y + 5} L${x + 3} ${y + 5} L${x} ${y} Z`,
    left: `M${x + 5} ${y - 3} L${x + 5} ${y + 3} L${x} ${y} Z`, right: `M${x - 5} ${y - 3} L${x - 5} ${y + 3} L${x} ${y} Z` }[dir];
  return <path d={d} fill={c} stroke="none" />;
};

/** +V: anticlockwise pair — left face pushed down, right face pushed up. */
export function ShearSign({ w = 46, h = 22, color = "currentColor", title = "Positive shear: turns a slice anticlockwise (left face down, right face up)" }) {
  return (
    <svg viewBox="0 0 46 22" style={box(w, h)} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="15" y="6" width="16" height="10" fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="10" y1="2" x2="10" y2="15" stroke={color} strokeWidth="1.6" />{head(10, 19, "down", color)}
      <line x1="36" y1="20" x2="36" y2="7" stroke={color} strokeWidth="1.6" />{head(36, 3, "up", color)}
      <path d="M21 3.2 a4 4 0 1 0 5 0" fill="none" stroke={color} strokeWidth="1" opacity=".7" />
    </svg>
  );
}

/** +M: sagging — the slice bends into a smile, bottom fibres in tension. */
export function MomentSign({ w = 46, h = 22, color = "currentColor", title = "Positive moment: sagging (bottom in tension)" }) {
  return (
    <svg viewBox="0 0 46 22" style={box(w, h)} role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M11 7 Q23 15 35 7" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <path d="M8.5 16 A6 6 0 0 1 5.5 5.5" fill="none" stroke={color} strokeWidth="1.4" />{head(6.6, 4.4, "right", color)}
      <path d="M37.5 16 A6 6 0 0 0 40.5 5.5" fill="none" stroke={color} strokeWidth="1.4" />{head(39.4, 4.4, "left", color)}
      <text x="23" y="21.5" textAnchor="middle" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill={color}>tension</text>
    </svg>
  );
}

/** +N: tension — the member is pulled apart. */
export function AxialSign({ w = 46, h = 22, color = "currentColor", title = "Positive axial force: tension" }) {
  return (
    <svg viewBox="0 0 46 22" style={box(w, h)} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="15" y="7" width="16" height="8" fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="13" y1="11" x2="6" y2="11" stroke={color} strokeWidth="1.6" />{head(2, 11, "left", color)}
      <line x1="33" y1="11" x2="40" y2="11" stroke={color} strokeWidth="1.6" />{head(44, 11, "right", color)}
    </svg>
  );
}

/** +δ: upward. */
export function DeflSign({ w = 22, h = 22, color = "currentColor", title = "Positive deflection: upward" }) {
  return (
    <svg viewBox="0 0 22 22" style={box(w, h)} role="img" aria-label={title}>
      <title>{title}</title>
      <line x1="11" y1="20" x2="11" y2="7" stroke={color} strokeWidth="1.7" />{head(11, 2, "up", color)}
      <line x1="4" y1="20" x2="18" y2="20" stroke={color} strokeWidth="1.2" opacity=".6" />
    </svg>
  );
}

/** A worked picture of every convention the diagrams use. */
export function SignCard({ kind = "beam", ink = "#1B2A41", soft = "#5B6B7C", colors = {} }) {
  const c = { shear: "#0E8A7B", moment: "#D4622A", axial: "#2F77B5", defl: "#5B5BD6", ...colors };
  const row = (glyph, name, body) => (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid #E4EAEE" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>{glyph}</div>
      <div style={{ font: "500 11.5px/1.5 'Archivo', system-ui, sans-serif", color: soft }}><b style={{ color: ink, fontFamily: "'IBM Plex Mono', monospace" }}>{name}</b> — {body}</div>
    </div>
  );
  return (
    <div style={{ border: "1.3px solid #C2CDD6", borderRadius: 7, background: "#fff", padding: "6px 12px 4px", margin: "10px 0" }}>
      <div style={{ font: "700 9px 'IBM Plex Mono', monospace", letterSpacing: ".13em", textTransform: "uppercase", color: ink, padding: "4px 0 6px" }}>Sign conventions on these diagrams</div>
      {row(<ShearSign w={64} h={30} color={c.shear} />, "Shear V +",
        <>turns a slice <b>anticlockwise</b>: left face pushed down, right face pushed up. {kind === "beam" ? "Plotted above the axis." : "Plotted on the member's local +y side (to the left looking from its start node to its end node) — above a beam drawn left to right."} V = −dM/dx.</>)}
      {row(<MomentSign w={64} h={30} color={c.moment} />, "Moment M +",
        <><b>sagging</b> — bends like a smile, bottom fibres in tension. Drawn on the <b>tension face</b>{kind === "beam" ? " (sagging below the beam by default)" : ""}.</>)}
      {kind !== "beam" && row(<AxialSign w={64} h={30} color={c.axial} />, "Axial N +", <><b>tension</b> — the member is being pulled; compression is negative.</>)}
      {row(<DeflSign w={30} h={30} color={c.defl} />, kind === "beam" ? "Deflection δ +" : "Deflected shape", kind === "beam" ? <>upward; the usual sag under gravity load is negative.</> : <>exaggerated so the shape reads; the undeformed frame is dashed.</>)}
      {row(<span style={{ font: "600 15px 'IBM Plex Mono', monospace", color: ink }}>↓ ↺ ↑</span>, "Loads & reactions", <>loads downward +, couples anticlockwise +, reactions upward + (and → +, ↺ +).</>)}
    </div>
  );
}
