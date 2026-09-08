import React, { useState } from "react";
import BeamLab from "./BeamLab.jsx";
import StructuralLab from "./StructuralLab.jsx";

/* ============================================================
   Structural Lab — shell.
   Beams get their own dedicated 1D solver and narrated hand-solve;
   frames, trusses and arches share the 2D stiffness engine.
   ============================================================ */

const TABS = [
  { id: "beam",  label: "Beam",  sub: "SFD · BMD · δ" },
  { id: "frame", label: "Frame", sub: "N · V · M · δ" },
  { id: "truss", label: "Truss", sub: "axial T/C" },
  { id: "arch",  label: "Arch",  sub: "thrust · M" },
];

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const SHELL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.slshell{background:#EEF1F3;min-height:100vh}
.slshell .bar{position:sticky;top:0;z-index:50;background:#16263C;border-bottom:2px solid #1B2A41;
  display:grid;grid-template-columns:repeat(4,1fr);box-shadow:0 2px 10px rgba(27,42,65,.18)}
.slshell .bar::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,#2F77B5,#0E8A7B 34%,#D4622A 67%,#6D4FC0)}
.slshell .tab{padding:11px 4px 9px;background:transparent;border:none;border-right:1px solid rgba(255,255,255,.12);
  color:#8FA3B8;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;
  font:700 11px ${MONO};letter-spacing:.11em;text-transform:uppercase;transition:background .12s,color .12s}
.slshell .tab:last-child{border-right:none}
.slshell .tab .ts{font:500 8.5px ${MONO};letter-spacing:.04em;text-transform:none;opacity:.75}
.slshell .tab:hover{background:rgba(255,255,255,.06);color:#fff}
.slshell .tab.on{background:#EEF1F3;color:#1B2A41;box-shadow:inset 0 -3px 0 #D4622A}
.slshell .tab:focus-visible{outline:2px solid #D4622A;outline-offset:-3px}
@media(max-width:420px){.slshell .tab{font-size:10px;letter-spacing:.06em}.slshell .tab .ts{display:none}}
`;

export default function App() {
  const [tab, setTab] = useState("beam");
  return (
    <div className="slshell">
      <style>{SHELL_CSS}</style>
      <nav className="bar" role="tablist" aria-label="Structure type">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={"tab" + (tab === t.id ? " on" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="ts">{t.sub}</span>
          </button>
        ))}
      </nav>
      {tab === "beam"
        ? <BeamLab />
        /* key forces a clean remount so the panel loads that type's first preset */
        : <StructuralLab key={tab} initialKind={tab} hideKindBar />}
    </div>
  );
}
