import React, { useState, useMemo, useRef, useEffect } from "react";
import { analyzeFrame, analyzeTruss, makeArch, uid } from "../engine/index.mjs";
import { FRAME_PRESETS, KINDS } from "./presets.js";

/* ============================================================
   STRUCTURAL LAB — interactive frame / truss / arch explorer
   Analysis lives in ../engine (pure, unit-tested).
   Study cases live in ./presets.js. This file is presentation only.
   ============================================================ */

/* ---------------- design tokens ---------------- */
const C = {
  sheet: "#EEF1F3", panel: "#FFFFFF", ink: "#1B2A41", inkSoft: "#5B6B7C",
  grid: "#D7E0E6", line: "#C2CDD6", nav: "#16263C", navSoft: "#8FA3B8", sel: "#D4622A",
  axial: "#2F77B5", shear: "#0E8A7B", moment: "#D4622A", defl: "#6D4FC0",
  good: "#1E7F3C", bad: "#C0392B", load: "#11304A",
};
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

const DIAG = {
  model: { lab: "Model", col: C.ink },
  N: { lab: "Axial N", col: C.axial, unit: "kN" },
  V: { lab: "Shear V", col: C.shear, unit: "kN" },
  M: { lab: "Moment M", col: C.moment, unit: "kN·m" },
  D: { lab: "Deflection", col: C.defl, unit: "mm" },
};

const fmt = (v, dp = 2) => {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v); const d = a >= 1000 ? 0 : a >= 100 ? 1 : dp;
  let s = v.toFixed(d); if (parseFloat(s) === 0) s = (0).toFixed(d); return s;
};

/* ---------------- presets ---------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.fl *{box-sizing:border-box}
.fl{
  background:
    repeating-linear-gradient(90deg, transparent, transparent 27px, rgba(27,42,65,.022) 27px, rgba(27,42,65,.022) 28px),
    repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(27,42,65,.04) 27px, rgba(27,42,65,.04) 28px),
    radial-gradient(1200px 480px at 80% -8%, rgba(109,79,192,.06), transparent 60%),
    radial-gradient(1000px 420px at -6% 4%, rgba(14,138,123,.06), transparent 60%),
    ${C.sheet};
  min-height:100vh;padding:14px;color:${C.ink};font-family:'Archivo',system-ui,sans-serif}
.fl .mono{font-family:${MONO}}
.fl .dim{color:${C.inkSoft}}
.fl button{font-family:${MONO}}
.fl button:focus-visible,.fl input:focus-visible,.fl select:focus-visible{outline:2px solid ${C.moment};outline-offset:1px}

/* title block */
.fl .tb{position:relative;border:2px solid ${C.ink};border-top-width:0;background:${C.panel};display:grid;grid-template-columns:1fr auto auto;align-items:stretch;box-shadow:3px 3px 0 rgba(27,42,65,.12)}
.fl .tb::before{content:"";position:absolute;top:-2px;left:-2px;right:-2px;height:5px;background:linear-gradient(90deg,${C.axial},${C.shear} 34%,${C.moment} 67%,${C.defl})}
.fl .tbc{padding:11px 15px;border-left:2px solid ${C.ink};display:flex;flex-direction:column;justify-content:center;gap:3px}
.fl .tbc:first-child{border-left:none;background:${C.nav};color:#fff}
.fl .tbc:first-child .tmeta{color:${C.navSoft}}
.fl .ttl{font:800 18px 'Archivo';letter-spacing:.02em;color:#fff;display:flex;align-items:center;gap:9px}
.fl .ttl .glyph{width:18px;height:18px;flex:0 0 auto}
.fl .tmeta{font:500 9px ${MONO};letter-spacing:.11em;color:${C.inkSoft};text-transform:uppercase}
.fl .tval{font:600 12px ${MONO}}
.fl .stamp{border:2.5px solid var(--sc);color:var(--sc);padding:6px 12px;font:700 10.5px ${MONO};letter-spacing:.08em;transform:rotate(-2.5deg);white-space:nowrap}
.fl .live{display:inline-flex;align-items:center;gap:5px;font:600 9px ${MONO};letter-spacing:.1em;color:${C.good};text-transform:uppercase}
.fl .live .dot{width:7px;height:7px;border-radius:50%;background:${C.good};animation:flpulse 1.8s ease-in-out infinite}
@keyframes flpulse{0%,100%{opacity:1}50%{opacity:.3}}

.fl .banner{border:2px solid ${C.bad};background:#FDF1EF;color:${C.bad};padding:11px 13px;font:600 11.5px ${MONO};margin-top:13px;line-height:1.5;border-radius:5px}

/* layout */
.fl .work{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;margin-top:14px;align-items:start}
@media(max-width:920px){.fl .work{grid-template-columns:1fr}}
.fl .panel{background:${C.panel};border:1.5px solid ${C.ink};border-radius:6px;margin-bottom:13px;overflow:hidden}
.fl .panel.acc{border-top:3px solid var(--pac,${C.ink})}
.fl .ph{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 11px;border-bottom:1.5px solid ${C.ink};font:600 10px ${MONO};letter-spacing:.1em;text-transform:uppercase;color:var(--pac,${C.ink})}
.fl svg.stage{display:block;width:100%;height:auto;touch-action:pan-y;background:
  repeating-linear-gradient(0deg,transparent,transparent 23px,rgba(27,42,65,.05) 23px,rgba(27,42,65,.05) 24px),
  repeating-linear-gradient(90deg,transparent,transparent 23px,rgba(27,42,65,.05) 23px,rgba(27,42,65,.05) 24px),#fff}
.fl .hint{display:flex;gap:8px;align-items:center;padding:7px 11px;border-top:1.2px dashed ${C.grid};font:500 9.5px ${MONO};color:${C.inkSoft};line-height:1.5;flex-wrap:wrap}
.fl .hint b{color:${C.ink};font-weight:600}
.fl .legend{display:inline-flex;align-items:center;gap:5px}
.fl .legend .sw{width:10px;height:10px;border-radius:2px;display:inline-block}

/* readout */
.fl .readout{display:grid;grid-template-columns:repeat(4,1fr)}
.fl .rc{padding:8px 10px;border-left:1.5px solid ${C.grid}}
.fl .rc:first-child{border-left:none}
.fl .rl{font:500 9px ${MONO};letter-spacing:.09em;color:${C.inkSoft};text-transform:uppercase}
.fl .rv{font:600 13.5px ${MONO};margin-top:3px;color:var(--cvc,${C.ink})}

/* chips */
.fl .chips{display:flex;gap:6px;padding:9px;overflow-x:auto}
.fl .chip{flex:0 0 auto;font:500 10px ${MONO};padding:6px 10px;border:1.2px solid ${C.line};background:${C.panel};cursor:pointer;color:${C.ink};white-space:nowrap;border-radius:4px;transition:transform .1s,border-color .1s,background .1s}
.fl .chip:hover{border-color:${C.ink};transform:translateY(-1px)}
.fl .chip.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.fl .dchips{display:flex;gap:6px;padding:8px;overflow-x:auto;border-bottom:1.5px solid ${C.ink}}
.fl .dchip{flex:0 0 auto;display:flex;align-items:center;gap:6px;font:600 10px ${MONO};padding:6px 11px;border:1.4px solid ${C.line};background:#fff;cursor:pointer;color:${C.inkSoft};white-space:nowrap;border-radius:20px;letter-spacing:.04em}
.fl .dchip .dt{width:9px;height:9px;border-radius:50%}
.fl .dchip.on{color:#fff;border-color:var(--dc);background:var(--dc)}
.fl .dchip.on .dt{background:#fff}

/* nav tabs */
.fl .nav{display:grid;grid-template-columns:repeat(4,1fr);border:1.5px solid ${C.ink};background:${C.nav};margin-bottom:13px;border-radius:6px;overflow:hidden}
.fl .navb{padding:9px 4px 8px;background:transparent;border:none;border-right:1px solid rgba(255,255,255,.12);color:${C.navSoft};cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;font:600 9.5px ${MONO};letter-spacing:.06em;text-transform:uppercase}
.fl .navb:last-child{border-right:none}
.fl .navb svg{width:19px;height:19px}
.fl .navb.on{background:${C.panel};color:${C.ink};box-shadow:inset 0 -3px 0 ${C.moment}}
.fl .navb .cnt{font:600 8.5px ${MONO};padding:0 5px;border-radius:8px;background:rgba(255,255,255,.16);color:#fff;min-width:16px;text-align:center}
.fl .navb.on .cnt{background:${C.moment};color:#fff}

/* inspector */
.fl .pad{padding:11px}
.fl .sub{font:700 8.5px ${MONO};letter-spacing:.13em;text-transform:uppercase;color:${C.inkSoft};margin:13px 0 7px;display:flex;align-items:center;gap:7px}
.fl .sub:first-child{margin-top:0}
.fl .sub::after{content:"";flex:1;height:1px;background:${C.grid}}
.fl .item{display:flex;align-items:center;gap:9px;border:1.2px solid ${C.line};background:#fff;padding:7px 9px;margin-bottom:7px;cursor:pointer;border-radius:5px;transition:border-color .12s}
.fl .item:hover{border-color:${C.ink}}
.fl .item.sel{border-color:${C.sel};box-shadow:0 0 0 2px color-mix(in srgb,${C.sel} 18%,transparent)}
.fl .item .iz{width:22px;height:22px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:${C.ink}}
.fl .item .ib{flex:1;min-width:0}
.fl .item .it{font:600 11px ${MONO};color:${C.ink}}
.fl .item .is{font:500 9.5px ${MONO};color:${C.inkSoft};margin-top:1px}
.fl .del{border:none;background:none;color:${C.bad};cursor:pointer;font:700 14px ${MONO};padding:0 3px;line-height:1;flex:0 0 auto}
.fl .del:hover{color:#fff;background:${C.bad};border-radius:3px}

.fl .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fl .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.fl .fld{display:flex;flex-direction:column;gap:4px}
.fl .fl-l{font:600 8.5px ${MONO};letter-spacing:.07em;text-transform:uppercase;color:${C.inkSoft}}
.fl input[type=number],.fl select{width:100%;font:500 13px ${MONO};padding:7px 8px;border:1.2px solid ${C.line};color:${C.ink};background:#fff;border-radius:4px}
@media(max-width:760px){.fl input[type=number],.fl select{font-size:16px}}
.fl input[type=range]{width:100%;accent-color:${C.moment};height:26px}

.fl .seg{display:flex;flex-wrap:wrap;gap:5px}
.fl .sb{flex:1 1 auto;min-width:54px;padding:8px 4px;border:1.3px solid ${C.line};background:#fff;cursor:pointer;color:${C.ink};font:600 9px ${MONO};letter-spacing:.04em;text-transform:uppercase;border-radius:4px;display:flex;flex-direction:column;align-items:center;gap:3px}
.fl .sb svg{width:22px;height:16px}
.fl .sb:hover{border-color:${C.ink}}
.fl .sb.on{background:${C.ink};border-color:${C.ink};color:#fff}

.fl .add{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
.fl .btn{font:600 9.5px ${MONO};letter-spacing:.06em;padding:8px 11px;border:1.4px solid ${C.ink};background:#fff;cursor:pointer;color:${C.ink};text-transform:uppercase;border-radius:4px}
.fl .btn:hover{background:${C.ink};color:#fff}
.fl .btn.gh{border-color:${C.line};color:${C.inkSoft}}
.fl .btn.gh:hover{background:${C.ink};color:#fff;border-color:${C.ink}}
.fl .dirbtns{display:flex;gap:6px}
.fl .dirbtns .db{flex:1;padding:8px;border:1.3px solid ${C.line};background:#fff;cursor:pointer;color:${C.ink};font:600 9.5px ${MONO};border-radius:4px;text-transform:uppercase}
.fl .dirbtns .db.on{background:${C.ink};color:#fff;border-color:${C.ink}}

/* tables */
.fl table.vt{width:100%;border-collapse:collapse;font:500 10px ${MONO};margin:6px 0}
.fl .vt td,.fl .vt th{border:1px solid ${C.grid};padding:5px 6px;text-align:right;white-space:nowrap}
.fl .vt th{background:${C.sheet};font-weight:600}
.fl .vt td:first-child,.fl .vt th:first-child{text-align:left}
.fl .ok{color:${C.good};font-weight:700}
.fl .no{color:${C.bad};font-weight:700}

/* teaching */
.fl .teach{padding:2px 1px 4px}
.fl .intro{font:500 12px 'Archivo';line-height:1.55;color:${C.inkSoft};margin:2px 2px 12px;padding-left:11px;border-left:3px solid ${C.moment}}
.fl .lesson{border:1.5px solid ${C.ink};background:${C.panel};border-radius:7px;margin-bottom:12px;box-shadow:3px 3px 0 color-mix(in srgb,var(--lac) 18%,transparent);overflow:hidden}
.fl .lh{display:flex;align-items:center;gap:11px;padding:10px 12px;cursor:pointer;user-select:none;background:linear-gradient(90deg,color-mix(in srgb,var(--lac) 7%,#fff),#fff 70%)}
.fl .lh:hover{background:linear-gradient(90deg,color-mix(in srgb,var(--lac) 13%,#fff),#fff 75%)}
.fl .lesson.open .lh{border-bottom:1.5px solid color-mix(in srgb,var(--lac) 30%,${C.grid})}
.fl .lbadge{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:var(--lac);color:#fff;display:flex;align-items:center;justify-content:center;font:800 12px 'Archivo';box-shadow:inset 0 -2px 4px rgba(0,0,0,.18)}
.fl .lt{flex:1;min-width:0}
.fl .ltt{display:block;font:800 13px 'Archivo';color:${C.ink};line-height:1.2}
.fl .lts{display:block;font:500 9.5px ${MONO};color:${C.inkSoft};margin-top:2px}
.fl .lchev{flex:0 0 auto;color:var(--lac);font:700 13px ${MONO};transition:transform .16s}
.fl .lesson.open .lchev{transform:rotate(90deg)}
.fl .lb{padding:12px 13px 14px}
.fl .say{font:400 12.5px 'Archivo';line-height:1.62;color:#33455a;margin:0 0 10px}
.fl .say:last-child{margin-bottom:0}
.fl .say b{font-weight:700;color:${C.ink}}
.fl .eqn{font:500 11px ${MONO};line-height:1.7;background:${C.sheet};border-left:3px solid var(--lac,${C.ink});padding:10px 12px;margin:9px 0;border-radius:0 5px 5px 0}
.fl .eqn .step{display:block;margin:3px 0;white-space:pre-wrap;word-break:break-word}
.fl .eqn .res{color:var(--lac,${C.ink});font-weight:700;background:color-mix(in srgb,var(--lac) 12%,transparent);padding:1px 5px;border-radius:3px}
.fl .call{border-radius:6px;padding:9px 12px 10px;margin:10px 0;border:1px solid color-mix(in srgb,var(--cc) 45%,transparent);background:var(--cbg)}
.fl .call .ct{font:700 8.5px ${MONO};letter-spacing:.13em;text-transform:uppercase;color:var(--cc);display:flex;align-items:center;gap:6px;margin-bottom:4px}
.fl .call .cdot{width:7px;height:7px;border-radius:2px;background:var(--cc);transform:rotate(45deg)}
.fl .call .cx{font:500 11.5px 'Archivo';line-height:1.58;color:#2a3a4f}
.fl .call .cx b{font-family:${MONO};font-weight:600;color:${C.ink}}
@media (prefers-reduced-motion: reduce){.fl .chip,.fl .lchev,.fl .lh,.fl .live .dot{transition:none;animation:none}}

/* ================= phone layout ================= */
@media(max-width:760px){
  .fl{padding:8px}
  .fl .tb{grid-template-columns:1fr}
  .fl .tbc{border-left:none;border-top:1.5px solid ${C.ink};padding:9px 12px}
  .fl .tbc:first-child{border-top:none}
  .fl .ttl{font-size:16px}
  .fl .tb .tbc:nth-child(3){flex-direction:row;gap:10px;justify-content:flex-start !important;align-items:center !important}
  .fl .readout{grid-template-columns:1fr 1fr}
  .fl .rc:nth-child(3),.fl .rc:nth-child(4){border-top:1.5px solid ${C.grid}}
  .fl .rc:nth-child(3){border-left:none}
  .fl .rv{font-size:15px}
  .fl .panel{margin-bottom:10px}
  /* three number fields side by side is unusable at 375px */
  .fl .grid3{grid-template-columns:1fr 1fr}
  .fl .seg{gap:6px}
  .fl .sb{min-width:72px;padding:10px 5px;font-size:9px}
  .fl .btn{padding:10px 12px;font-size:10px}
  .fl .del{font-size:20px;padding:4px 9px}
  .fl .item{padding:10px 9px}
  .fl input[type=range]{height:34px}
  .fl .kindb{padding:13px 5px;font-size:11px}
  .fl .navb{padding:10px 3px 9px;font-size:9px;letter-spacing:.04em}
  .fl .navb svg{width:18px;height:18px}
  .fl .chip{padding:8px 11px;font-size:10.5px}
  .fl .dchip{padding:8px 12px;font-size:10.5px}
  .fl .tog{padding:10px 10px}
  .fl .lb{padding:12px 12px 14px}
  .fl .say{font-size:13.5px;line-height:1.68}
  .fl .eqn{font-size:11.5px;padding:11px 12px;overflow-x:auto}
  .fl table.vt{font-size:10.5px;display:block;overflow-x:auto;white-space:nowrap}
  .fl .hint{font-size:10px;padding:9px 10px}
  .fl .pnote{font-size:11px}
  /* diagram labels: the viewBox is smaller on phones, this lifts them to ~10px on screen */
  .fl svg.stage text{font-size:12px}
}
@media(max-width:400px){
  .fl .ttl{font-size:15px;gap:7px}
  .fl .tmeta{font-size:8.5px}
  .fl .grid3{grid-template-columns:1fr}
}

/* structure-type switch */
.fl .kindbar{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:2px solid ${C.ink};border-radius:7px;overflow:hidden;margin-top:13px;background:${C.panel}}
.fl .kindb{padding:11px 6px;background:${C.panel};border:none;border-right:1.5px solid ${C.ink};color:${C.inkSoft};cursor:pointer;font:700 11px ${MONO};letter-spacing:.1em;text-transform:uppercase}
.fl .kindb:last-child{border-right:none}
.fl .kindb:hover{background:${C.sheet};color:${C.ink}}
.fl .kindb.on{background:${C.nav};color:#fff}
.fl .pnote{font:500 10.5px ${MONO};color:${C.inkSoft};line-height:1.5;padding:0 10px 9px;margin-top:-3px}
.fl .pnote b{color:${C.ink}}
/* flags on list items */
.fl .flag{display:inline-block;font:700 8px ${MONO};letter-spacing:.07em;padding:1px 5px;border-radius:3px;margin-left:5px;vertical-align:middle}
.fl .flag.hinge{background:#FBEDE4;color:#C2531F;border:1px solid #E3B79A}
.fl .flag.stiff{background:#ECECFB;color:#4A4ACB;border:1px solid #B9B9EC}
.fl .flag.settle{background:#FBEBE9;color:${C.bad};border:1px solid #E9B4AE}
.fl .flag.spring{background:#E8F4F1;color:${C.shear};border:1px solid #A9D6CE}
/* toggle row */
.fl .tog{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1.2px solid ${C.line};border-radius:5px;margin-bottom:7px;cursor:pointer;background:#fff}
.fl .tog:hover{border-color:${C.ink}}
.fl .tog .tgb{width:34px;height:19px;border-radius:10px;background:${C.line};position:relative;flex:0 0 auto;transition:background .15s}
.fl .tog .tgb::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .15s}
.fl .tog.on .tgb{background:${C.moment}}
.fl .tog.on .tgb::after{transform:translateX(15px)}
.fl .tog .tgl{font:600 10.5px ${MONO};color:${C.ink}}
.fl .tog .tgs{font:500 9px ${MONO};color:${C.inkSoft};margin-top:1px}
`;

/* ---------------- icons ---------------- */
const IcoGeom = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20 V6 H16" /><path d="M4 6 L9 3 H20 L20 14" /><circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" /><circle cx="16" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="20" cy="14" r="1.6" fill="currentColor" stroke="none" /></svg>);
const IcoSup = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 L12 13" /><path d="M5 19 L12 13 L19 19" /><path d="M4 21 H20" /><path d="M6 21 L4 23 M10 21 L8 23 M14 21 L12 23 M18 21 L16 23" /></svg>);
const IcoLoad = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 V17" /><path d="M6 11 L12 17 L18 11" /><path d="M4 21 H20" /></svg>);
const IcoCheck = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 L9 17 L20 6" /></svg>);
const SupGlyph = ({ type }) => {
  if (type === "fixed") return <svg viewBox="0 0 24 16"><line x1="2" y1="4" x2="22" y2="4" stroke="currentColor" strokeWidth="2" /><path d="M4 4 L1 8 M9 4 L6 8 M14 4 L11 8 M19 4 L16 8 M23 4 L20 8" stroke="currentColor" strokeWidth="1.3" /></svg>;
  if (type === "pin") return <svg viewBox="0 0 24 16"><path d="M12 2 L4 12 H20 Z" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="2" y1="14" x2="22" y2="14" stroke="currentColor" strokeWidth="1.6" /></svg>;
  if (type === "rollerV") return <svg viewBox="0 0 24 16"><path d="M12 1 L5 9 H19 Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="16" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="1.3" /></svg>;
  if (type === "rollerH") return <svg viewBox="0 0 24 16"><path d="M22 8 L14 3 V13 Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="11" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="11" cy="11" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;
  return <svg viewBox="0 0 24 16"><circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
};

/* ---------------- teaching helpers ---------------- */
const CALLS = {
  tip: { cc: "#0E8A7B", cbg: "#E8F4F1", lab: "Tip" },
  remember: { cc: "#C2531F", cbg: "#FBEDE4", lab: "Remember this" },
  watch: { cc: "#C0392B", cbg: "#FBEBE9", lab: "Watch out" },
  fact: { cc: "#4A4ACB", cbg: "#ECECFB", lab: "Good to know" },
};
function Call({ kind = "tip", title, children }) {
  const c = CALLS[kind] || CALLS.tip;
  return <div className="call" style={{ "--cc": c.cc, "--cbg": c.cbg }}><div className="ct"><span className="cdot" />{title || c.lab}</div><div className="cx">{children}</div></div>;
}
function Lesson({ n, title, sub, accent = C.ink, open, children }) {
  const [o, setO] = useState(open !== false);
  return (
    <div className={"lesson" + (o ? " open" : "")} style={{ "--lac": accent }}>
      <div className="lh" role="button" tabIndex={0} onClick={() => setO(v => !v)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setO(v => !v); } }}>
        <span className="lbadge">{n}</span>
        <span className="lt"><span className="ltt">{title}</span>{sub && <span className="lts">{sub}</span>}</span>
        <span className="lchev">▸</span>
      </div>
      {o && <div className="lb">{children}</div>}
    </div>
  );
}
const Eqn = ({ children }) => <div className="eqn">{children}</div>;
const Step = ({ children }) => <span className="step">{children}</span>;


/* ============================================================
   CANVAS
   ============================================================ */
/** true when the viewport is phone-width; re-evaluates on resize/rotate */
function useNarrow(bp = 760) {
  const q = `(max-width:${bp}px)`;
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(q).matches : false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const m = window.matchMedia(q);
    const h = e => setN(e.matches);
    setN(m.matches);
    m.addEventListener ? m.addEventListener("change", h) : m.addListener(h);
    return () => { m.removeEventListener ? m.removeEventListener("change", h) : m.removeListener(h); };
  }, [q]);
  return n;
}

function FrameCanvas({ model, res, diagram, selection, onSelect, onDragNode, kind, narrow }) {
  const svgRef = useRef(null);
  const txRef = useRef(null);
  const drag = useRef(null);
  // smaller coordinate space on phones => labels/arrows render proportionally larger
  const VBW = narrow ? 430 : 760, VBH = narrow ? 400 : 520, M = narrow ? 34 : 52;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  model.nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
  if (!isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
  const worldW = Math.max(maxX - minX, 1e-3), worldH = Math.max(maxY - minY, 1e-3);
  const span = Math.max(worldW, worldH, 1);
  const pad = 0.2 * span;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const ww = maxX - minX, wh = maxY - minY;
  const scale = Math.min((VBW - 2 * M) / ww, (VBH - 2 * M) / wh);
  const offX = (VBW - 2 * M - ww * scale) / 2, offY = (VBH - 2 * M - wh * scale) / 2;
  const SX = x => M + offX + (x - minX) * scale;
  const SY = y => VBH - M - offY - (y - minY) * scale;
  txRef.current = { minX, minY, scale, M, offX, offY, VBH };

  const amp = 0.16 * span;
  const stable = res && res.stable;
  const isTruss = kind === "truss";
  let dscale = 0, defScale = 0, axMax = 0;
  if (stable && diagram !== "model" && diagram !== "D" && !isTruss) {
    let mxv = 0;
    res.members.forEach(mb => mb.samples.forEach(p => { mxv = Math.max(mxv, Math.abs(diagram === "M" ? -p.M : p[diagram])); }));
    dscale = mxv > 1e-9 ? amp / mxv : 0;
  }
  if (stable && isTruss) res.members.forEach(mb => { axMax = Math.max(axMax, Math.abs(mb.axial)); });
  if (stable && diagram === "D") defScale = res.dmax > 1e-12 ? (0.13 * span) / res.dmax : 0;

  const toWorld = (cx, cy) => {
    const svg = svgRef.current; if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const px = (cx - r.left) / r.width * VBW, py = (cy - r.top) / r.height * VBH;
    const t = txRef.current;
    return { x: t.minX + (px - t.M - t.offX) / t.scale, y: t.minY + (t.VBH - t.M - t.offY - py) / t.scale };
  };
  const snap = v => { const r = Math.round(v * 2) / 2; return Math.abs(r - v) < 0.18 ? r : Math.round(v * 10) / 10; };
  const onDown = (e, id) => { e.stopPropagation(); drag.current = { id, moved: false, sx: e.clientX, sy: e.clientY }; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = e => {
    const d = drag.current; if (!d) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    const w = toWorld(e.clientX, e.clientY); if (!w) return;
    onDragNode(d.id, snap(w.x), snap(w.y));
  };
  const onUp = () => { const d = drag.current; drag.current = null; if (d && !d.moved) onSelect("node", d.id); };

  const arrow = (x1, y1, x2, y2, col, w = 2) => {
    const ang = Math.atan2(y2 - y1, x2 - x1), h = 7;
    return <g><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={w} /><path d={`M${x2} ${y2} L${x2 - h * Math.cos(ang - 0.4)} ${y2 - h * Math.sin(ang - 0.4)} L${x2 - h * Math.cos(ang + 0.4)} ${y2 - h * Math.sin(ang + 0.4)} Z`} fill={col} /></g>;
  };
  const dgCol = DIAG[diagram] ? DIAG[diagram].col : C.ink;

  return (
    <svg ref={svgRef} className="stage" viewBox={`0 0 ${VBW} ${VBH}`} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerDown={() => onSelect(null)}>
      {/* N / V / M diagrams for frames & arches */}
      {!isTruss && stable && diagram !== "model" && diagram !== "D" && res.members.map((mb, i) => {
        const px = -mb.s, py = mb.c;
        const pts = mb.samples.map(p => { const val = diagram === "M" ? -p.M : p[diagram]; const bx = mb.x1 + mb.c * p.s, by = mb.y1 + mb.s * p.s; return { bx, by, tx: bx + val * dscale * px, ty: by + val * dscale * py, val }; });
        const base = `M${SX(pts[0].bx)} ${SY(pts[0].by)} ` + pts.map(p => `L${SX(p.tx)} ${SY(p.ty)}`).join(" ") + ` L${SX(pts[pts.length - 1].bx)} ${SY(pts[pts.length - 1].by)} Z`;
        const line = `M${SX(pts[0].tx)} ${SY(pts[0].ty)} ` + pts.map(p => `L${SX(p.tx)} ${SY(p.ty)}`).join(" ");
        let pk = pts[0]; pts.forEach(p => { if (Math.abs(p.val) > Math.abs(pk.val)) pk = p; });
        return <g key={"d" + i}>
          <path d={base} fill={dgCol} opacity="0.16" />
          <path d={line} fill="none" stroke={dgCol} strokeWidth="1.8" />
          {Math.abs(pk.val) > 1e-6 && <text x={SX(pk.tx) + px * 9} y={SY(pk.ty) - py * 9} fontSize="10.5" fontFamily={MONO} fontWeight="700" fill={dgCol} textAnchor="middle">{fmt(pk.val, 1)}</text>}
        </g>;
      })}

      {/* truss axial — colour the bars */}
      {isTruss && stable && diagram === "N" && res.members.map((mb, i) => {
        const zero = Math.abs(mb.axial) < Math.max(1e-3, 1e-3 * axMax);
        const col = zero ? C.inkSoft : (mb.axial > 0 ? C.axial : C.bad);
        const w = zero ? 1.6 : 3 + 5 * (Math.abs(mb.axial) / (axMax || 1));
        const mx = SX((mb.x1 + mb.x2) / 2), my = SY((mb.y1 + mb.y2) / 2);
        return <g key={"ax" + i}>
          <line x1={SX(mb.x1)} y1={SY(mb.y1)} x2={SX(mb.x2)} y2={SY(mb.y2)} stroke={col} strokeWidth={w} strokeLinecap="round" strokeDasharray={zero ? "4 4" : "0"} />
          <text x={mx + -mb.s * 12} y={my - mb.c * 12} fontSize="10" fontFamily={MONO} fontWeight="700" fill={col} textAnchor="middle">{zero ? "0" : fmt(Math.abs(mb.axial), 1) + (mb.axial > 0 ? " T" : " C")}</text>
        </g>;
      })}

      {/* deflected shape */}
      {stable && diagram === "D" && <>
        {res.members.map((mb, i) => <line key={"g" + i} x1={SX(mb.x1)} y1={SY(mb.y1)} x2={SX(mb.x2)} y2={SY(mb.y2)} stroke={C.line} strokeWidth="1.5" strokeDasharray="3 3" />)}
        {res.members.map((mb, i) => <path key={"dd" + i} d={"M" + mb.defl.map(p => `${SX(p.x + p.ux * defScale)} ${SY(p.y + p.uy * defScale)}`).join(" L")} fill="none" stroke={C.defl} strokeWidth="2.4" />)}
      </>}

      {/* members */}
      {diagram !== "D" && !(isTruss && diagram === "N") && model.members.map(mb => {
        const a = model.nodes.find(n => n.id === mb.n1), b = model.nodes.find(n => n.id === mb.n2);
        if (!a || !b) return null;
        const sel = selection && selection.kind === "member" && selection.id === mb.id;
        const stiff = mb.EI != null;
        return <line key={mb.id} x1={SX(a.x)} y1={SY(a.y)} x2={SX(b.x)} y2={SY(b.y)} stroke={sel ? C.sel : C.ink} strokeWidth={sel ? 5.5 : (diagram === "model" ? (stiff ? 6 : 4) : 2.4)} strokeLinecap="round" style={{ cursor: "pointer" }} onPointerDown={e => { e.stopPropagation(); onSelect("member", mb.id); }} />;
      })}

      {/* fat invisible hit lines */}
      {model.members.map(mb => { const a = model.nodes.find(n => n.id === mb.n1), b = model.nodes.find(n => n.id === mb.n2); if (!a || !b) return null; return <line key={"h" + mb.id} x1={SX(a.x)} y1={SY(a.y)} x2={SX(b.x)} y2={SY(b.y)} stroke="transparent" strokeWidth="18" style={{ cursor: "pointer" }} onPointerDown={e => { e.stopPropagation(); onSelect("member", mb.id); }} />; })}

      {/* internal hinges (member end releases) */}
      {diagram !== "D" && model.members.map(mb => {
        const a = model.nodes.find(n => n.id === mb.n1), b = model.nodes.find(n => n.id === mb.n2);
        if (!a || !b) return null;
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
        const off = Math.min(0.34, L * 0.18);
        const g = [];
        if (mb.rel1) g.push(<circle key="1" cx={SX(a.x + ux * off)} cy={SY(a.y + uy * off)} r="5" fill="#fff" stroke={C.moment} strokeWidth="2.2" />);
        if (mb.rel2) g.push(<circle key="2" cx={SX(b.x - ux * off)} cy={SY(b.y - uy * off)} r="5" fill="#fff" stroke={C.moment} strokeWidth="2.2" />);
        return g.length ? <g key={"hg" + mb.id}>{g}</g> : null;
      })}

      {/* loads */}
      {diagram === "model" && model.loads.map(l => {
        if (l.type === "node") {
          const n = model.nodes.find(x => x.id === l.node); if (!n) return null;
          const cx = SX(n.x), cy = SY(n.y), els = [], Lp = 40;
          if (Math.abs(l.Fy) > 1e-9) { const d = l.Fy < 0 ? 1 : -1; els.push(<g key="fy">{arrow(cx, cy - d * Lp, cx, cy - d * 7, C.load, 2.2)}<text x={cx + 8} y={cy - d * Lp + (d < 0 ? 12 : 0)} fontSize="10" fontFamily={MONO} fontWeight="600" fill={C.load}>{fmt(Math.abs(l.Fy), 1)}</text></g>); }
          if (Math.abs(l.Fx) > 1e-9) { const d = l.Fx > 0 ? 1 : -1; els.push(<g key="fx">{arrow(cx - d * Lp, cy, cx - d * 7, cy, C.load, 2.2)}<text x={cx - d * Lp} y={cy - 8} fontSize="10" fontFamily={MONO} fontWeight="600" fill={C.load}>{fmt(Math.abs(l.Fx), 1)}</text></g>); }
          if (Math.abs(l.M) > 1e-9) { const ccw = l.M > 0; els.push(<g key="m"><path d={`M ${cx + 15} ${cy} A 15 15 0 1 ${ccw ? 0 : 1} ${cx - 15} ${cy}`} fill="none" stroke={C.load} strokeWidth="2.2" /><path d={`M${cx - 15} ${cy} l ${ccw ? 5 : -5} -5 M${cx - 15} ${cy} l ${ccw ? 5 : -5} 5`} stroke={C.load} strokeWidth="2.2" fill="none" /><text x={cx} y={cy - 21} fontSize="10" fontFamily={MONO} fontWeight="600" fill={C.load} textAnchor="middle">{fmt(Math.abs(l.M), 1)}</text></g>); }
          return <g key={l.id}>{els}</g>;
        }
        if (l.type === "udl") {
          const mb = model.members.find(x => x.id === l.member); if (!mb) return null;
          const a = model.nodes.find(n => n.id === mb.n1), b = model.nodes.find(n => n.id === mb.n2); if (!a || !b) return null;
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), c = dx / L, s = dy / L;
          const nrm = l.dir === "grav" ? { x: 0, y: 1 } : { x: -s, y: c };
          const ta = l.t1 == null ? 0 : l.t1, tb = l.t2 == null ? 1 : l.t2;
          const wa = l.w || 0, wb = (l.w2 == null ? l.w : l.w2) || 0;
          const wMax = Math.max(Math.abs(wa), Math.abs(wb)) || 1;
          const base = 16, extra = 20;
          const hAt = t => { const f = (tb - ta) < 1e-9 ? 0 : (t - ta) / (tb - ta); const w = wa + (wb - wa) * f; return base + extra * Math.abs(w) / wMax; };
          const cnt = Math.max(3, Math.round((tb - ta) * L * scale / 30));
          const arr = [];
          for (let k = 0; k <= cnt; k++) {
            const t = ta + (tb - ta) * k / cnt;
            const bx = SX(a.x + dx * t), by = SY(a.y + dy * t), h = hAt(t);
            arr.push(<line key={k} x1={bx + nrm.x * h} y1={by - nrm.y * h} x2={bx} y2={by} stroke={C.load} strokeWidth="1.4" opacity="0.85" />);
          }
          const p1x = SX(a.x + dx * ta) + nrm.x * hAt(ta), p1y = SY(a.y + dy * ta) - nrm.y * hAt(ta);
          const p2x = SX(a.x + dx * tb) + nrm.x * hAt(tb), p2y = SY(a.y + dy * tb) - nrm.y * hAt(tb);
          const tm = (ta + tb) / 2;
          return <g key={l.id}>
            <line x1={p1x} y1={p1y} x2={p2x} y2={p2y} stroke={C.load} strokeWidth="1.6" />
            {arr}
            <text x={SX(a.x + dx * tm) + nrm.x * (hAt(tm) + 8)} y={SY(a.y + dy * tm) - nrm.y * (hAt(tm) + 8)} fontSize="9.5" fontFamily={MONO} fontWeight="600" fill={C.load} textAnchor="middle">{wa === wb ? `${fmt(wa, 1)} kN/m` : `${fmt(wa, 1)}→${fmt(wb, 1)}`}</text>
          </g>;
        }
        if (l.type === "mpoint") {
          const mb = model.members.find(x => x.id === l.member); if (!mb) return null;
          const a = model.nodes.find(n => n.id === mb.n1), b = model.nodes.find(n => n.id === mb.n2); if (!a || !b) return null;
          const t = l.t == null ? 0.5 : l.t;
          const cx = SX(a.x + (b.x - a.x) * t), cy = SY(a.y + (b.y - a.y) * t);
          const mag = Math.hypot(l.Fx || 0, l.Fy || 0);
          if (mag < 1e-9 && Math.abs(l.M || 0) > 1e-9) {
            const ccw = l.M > 0;
            return <g key={l.id}><path d={`M ${cx + 15} ${cy} A 15 15 0 1 ${ccw ? 0 : 1} ${cx - 15} ${cy}`} fill="none" stroke={C.load} strokeWidth="2.2" /><path d={`M${cx - 15} ${cy} l ${ccw ? 5 : -5} -5 M${cx - 15} ${cy} l ${ccw ? 5 : -5} 5`} stroke={C.load} strokeWidth="2.2" fill="none" /><text x={cx} y={cy - 21} fontSize="10" fontFamily={MONO} fontWeight="600" fill={C.load} textAnchor="middle">{fmt(Math.abs(l.M), 1)}</text></g>;
          }
          const ux = (l.Fx || 0) / (mag || 1), uy = (l.Fy || 0) / (mag || 1), Lp = 38;
          return <g key={l.id}>{arrow(cx - ux * Lp, cy + uy * Lp, cx - ux * 6, cy + uy * 6, C.load, 2.2)}<text x={cx - ux * Lp + 6} y={cy + uy * Lp} fontSize="10" fontFamily={MONO} fontWeight="600" fill={C.load}>{fmt(mag, 1)}</text></g>;
        }
        return null;
      })}

      {/* supports */}
      {model.supports && model.supports.map((sp, i) => {
        const n = model.nodes.find(x => x.id === sp.node); if (!n) return null;
        const cx = SX(n.x), cy = SY(n.y);
        const isSpring = !!(sp.kx || sp.ky || sp.kr);
        const settled = !!(sp.dx || sp.dy || sp.rz);
        if (isSpring && sp.type === "none") {
          const zig = []; const x0 = cx, y0 = cy + 6;
          for (let k = 0; k < 6; k++) zig.push(`${x0 + (k % 2 ? 7 : -7)} ${y0 + 4 + k * 4.5}`);
          return <g key={"s" + i}><polyline points={`${x0} ${y0} ` + zig.join(" ") + ` ${x0} ${y0 + 32}`} fill="none" stroke={C.shear} strokeWidth="1.9" /><line x1={cx - 12} y1={cy + 38} x2={cx + 12} y2={cy + 38} stroke={C.shear} strokeWidth="2" /></g>;
        }
        const horiz = sp.type === "rollerH";
        return <g key={"s" + i}>
          <g transform={`translate(${horiz ? cx + 2 : cx - 13}, ${horiz ? cy - 8 : cy + 2})`} style={{ color: settled ? C.bad : C.ink }}>
            <svg x="0" y="0" width="26" height="22" viewBox="0 0 24 16" preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}><SupGlyph type={sp.type} /></svg>
          </g>
          {settled && <text x={cx + 16} y={cy + 30} fontSize="9" fontFamily={MONO} fontWeight="700" fill={C.bad}>↓{fmt(Math.abs((sp.dy || 0) * 1000), 0)}mm</text>}
        </g>;
      })}

      {/* reactions */}
      {stable && diagram === "model" && res.reactions.map((rc, i) => {
        const n = model.nodes.find(x => x.id === rc.node); if (!n) return null;
        const cx = SX(n.x), cy = SY(n.y), els = [], Lp = 34;
        if (Math.abs(rc.Ry) > 1e-3) { const d = rc.Ry > 0 ? 1 : -1; els.push(<g key="ry">{arrow(cx, cy + d * Lp, cx, cy + d * 9, C.good, 2)}<text x={cx - 24} y={cy + d * Lp + (d > 0 ? 12 : -2)} fontSize="9.5" fontFamily={MONO} fontWeight="700" fill={C.good}>{fmt(Math.abs(rc.Ry), 1)}</text></g>); }
        if (Math.abs(rc.Rx) > 1e-3) { const d = rc.Rx > 0 ? 1 : -1; els.push(<g key="rx">{arrow(cx - d * Lp, cy, cx - d * 9, cy, C.good, 2)}<text x={cx - d * Lp} y={cy + 17} fontSize="9.5" fontFamily={MONO} fontWeight="700" fill={C.good}>{fmt(Math.abs(rc.Rx), 1)}</text></g>); }
        return <g key={"r" + i}>{els}</g>;
      })}

      {/* nodes */}
      {model.nodes.map(n => {
        const sel = selection && selection.kind === "node" && selection.id === n.id;
        const cx = SX(n.x), cy = SY(n.y);
        return <g key={n.id}>
          <circle cx={cx} cy={cy} r={narrow ? 20 : 14} fill="transparent" style={{ cursor: "grab", touchAction: "none" }} onPointerDown={e => onDown(e, n.id)} />
          <rect x={cx - 4} y={cy - 4} width="8" height="8" fill={sel ? C.sel : C.ink} stroke="#fff" strokeWidth="1.2" style={{ pointerEvents: "none" }} />
          {diagram === "model" && <text x={cx + 8} y={cy - 8} fontSize="9.5" fontFamily={MONO} fontWeight="600" fill={C.inkSoft} style={{ pointerEvents: "none" }}>{n.id}</text>}
        </g>;
      })}
    </svg>
  );
}

/* ---------------- UI helpers ---------------- */
function loadSummary(l) {
  if (l.type === "node") { const p = []; if (l.Fx) p.push(`Fx ${fmt(l.Fx, 1)}`); if (l.Fy) p.push(`Fy ${fmt(l.Fy, 1)}`); if (l.M) p.push(`M ${fmt(l.M, 1)}`); return `Node ${l.node} · ${p.join(", ") || "—"}`; }
  if (l.type === "udl") {
    const ta = l.t1 == null ? 0 : l.t1, tb = l.t2 == null ? 1 : l.t2;
    const wa = l.w || 0, wb = l.w2 == null ? l.w : l.w2;
    const mag = wa === wb ? `${fmt(wa, 1)} kN/m` : `${fmt(wa, 1)}→${fmt(wb, 1)} kN/m`;
    const ext = (ta === 0 && tb === 1) ? "full" : `${Math.round(ta * 100)}–${Math.round(tb * 100)}%`;
    return `${mag} on ${l.member} · ${ext} · ${l.dir === "grav" ? "gravity" : "perp"}`;
  }
  if (l.type === "mpoint") {
    const mag = Math.hypot(l.Fx || 0, l.Fy || 0);
    const at = `@ ${Math.round((l.t == null ? .5 : l.t) * 100)}%`;
    return mag > 1e-9 ? `Point ${fmt(mag, 1)} kN on ${l.member} ${at}` : `Moment ${fmt(l.M || 0, 1)} kN·m on ${l.member} ${at}`;
  }
  return "";
}
function loadTitle(l) {
  if (l.type === "node") return "Nodal load";
  if (l.type === "udl") { const wa = l.w || 0, wb = l.w2 == null ? l.w : l.w2; const full = (l.t1 == null || l.t1 === 0) && (l.t2 == null || l.t2 === 1); return wa === wb ? (full ? "Member UDL" : "Partial UDL") : "Varying (trapezoidal) load"; }
  return (Math.hypot(l.Fx || 0, l.Fy || 0) > 1e-9) ? "Member point load" : "Member point moment";
}
function nextNodeId(nodes) { for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!nodes.some(n => n.id === ch)) return ch; return "N" + uid().slice(0, 3); }
function nextMemberId(members) { let i = 1; while (members.some(m => m.id === "m" + i)) i++; return "m" + i; }

/* ---------------- VERIFY : TRUSS ---------------- */
function VerifyTruss({ res, model }) {
  const m = model.members.length, nn = model.nodes.length;
  const rOf = t => (t === "pin" || t === "fixed") ? 2 : (t === "rollerV" || t === "rollerH") ? 1 : 0;
  const r = (model.supports || []).reduce((a, s) => a + rOf(s.type) + (s.kx ? 1 : 0) + (s.ky ? 1 : 0), 0);
  const SI = res.SI;
  const det = (
    <Lesson n="0" title="Is the truss solvable and rigid?" sub="members + reactions vs joints" accent={C.defl}>
      <p className="say">Every bar in a pin-jointed truss is a <b>two-force member</b> — pure push or pull, no bending. Each joint gives two equations (ΣFx, ΣFy), so <b>2n</b> in total, against m bar forces plus r reactions.</p>
      <Eqn><Step>SI = m + r − 2n = {m} + {r} − 2×{nn} = <span className="res">{SI}</span></Step></Eqn>
      <p className="say">{!res.stable ? <><b>Mechanism.</b> {res.reason}</> : SI === 0 ? <><b>Determinate.</b> Method of joints or sections solves it from equilibrium alone.</> : SI > 0 ? <><b>Indeterminate to degree {SI}</b> — redundant bars, so member stiffness (EA) decides the split.</> : <><b>SI = {SI}</b> — not enough bars or restraints.</>}</p>
      <Call kind="remember">A simple truss satisfies <b>m + r = 2n</b>. Build from triangles: one triangle, then two new bars per new joint. A square panel with no diagonal is always a mechanism.</Call>
    </Lesson>
  );
  if (!res.stable) return <div className="teach">{det}</div>;
  const sorted = [...res.members].sort((a, b) => Math.abs(b.axial) - Math.abs(a.axial));
  const maxT = res.members.reduce((x, mb) => Math.max(x, mb.axial), 0);
  const maxC = res.members.reduce((x, mb) => Math.min(x, mb.axial), 0);
  const lim = Math.max(1e-3, 1e-3 * Math.max(Math.abs(maxT), Math.abs(maxC)));
  const zeros = res.members.filter(mb => Math.abs(mb.axial) < lim);
  return (
    <div className="teach">
      <p className="intro">A determinate truss is the friendliest structure to check by hand — every bar follows from joint equilibrium. This mirrors the method of joints and updates as you edit.</p>
      {det}
      <Lesson n="1" title="Reactions & global balance" sub="ΣFx = ΣFy = 0" accent={C.good}>
        <table className="vt"><thead><tr><th>joint</th><th>type</th><th>Rx kN</th><th>Ry kN</th></tr></thead><tbody>
          {res.reactions.map((rc, i) => <tr key={i}><td>{rc.node}</td><td>{rc.type}</td><td>{fmt(rc.Rx, 1)}</td><td>{fmt(rc.Ry, 1)}</td></tr>)}
        </tbody></table>
        <Eqn>
          <Step>ΣFx: {fmt(res.appliedFx, 1)} + {fmt(res.reacFx, 1)} = {fmt(res.appliedFx + res.reacFx, 2)}</Step>
          <Step>ΣFy: {fmt(res.appliedFy, 1)} + {fmt(res.reacFy, 1)} = {fmt(res.appliedFy + res.reacFy, 2)}</Step>
          <Step><span className={res.eqOK ? "ok" : "no"}>{res.eqOK ? "balanced ✓" : "not balanced ✗"}</span></Step>
        </Eqn>
        <Call kind="tip">Reactions first, then start at a joint with only two unknown bars — two equations, two unknowns, no simultaneous algebra.</Call>
      </Lesson>
      <Lesson n="2" title="Member forces" sub="tension, compression, zero-force" accent={C.axial}>
        <table className="vt"><thead><tr><th>bar</th><th>force kN</th><th>sense</th></tr></thead><tbody>
          {sorted.map((mb, i) => { const z = Math.abs(mb.axial) < lim; return <tr key={i}><td>{mb.id}</td><td>{fmt(Math.abs(mb.axial), 1)}</td><td style={{ color: z ? C.inkSoft : (mb.axial > 0 ? C.axial : C.bad), fontWeight: 700 }}>{z ? "zero-force" : (mb.axial > 0 ? "TENSION" : "COMPRESSION")}</td></tr>; })}
        </tbody></table>
        <Call kind="fact">Switch the canvas to <b>Axial</b> to see it in colour — blue tension, red compression, dashed grey zero-force, thickness scaled to magnitude.</Call>
        {zeros.length > 0 && <Call kind="remember">{zeros.length} zero-force bar{zeros.length > 1 ? "s" : ""}. Spot them by inspection: an unloaded joint with two collinear bars plus one other → the odd bar is zero. They still brace the compression members, so they are not useless.</Call>}
      </Lesson>
      <Lesson n="3" title="Governing results" sub="what sizes the members" accent={C.moment}>
        <Eqn>
          <Step>Largest tension = <b>{fmt(maxT, 1)} kN</b> — sizes ties (yield & connections).</Step>
          <Step>Largest compression = <b>{fmt(maxC, 1)} kN</b> — sizes struts (buckling governs).</Step>
          <Step>Max joint movement = <b>{fmt(res.dmax * 1000, 2)} mm</b>.</Step>
        </Eqn>
        <Call kind="watch" title="Compression ≠ tension">A 20 kN tie and a 20 kN strut are not the same job — the strut can buckle long before it yields. Keep struts short or braced.</Call>
      </Lesson>
    </div>
  );
}

/* ---------------- VERIFY : FRAME / ARCH ---------------- */
function VerifyFrame({ res, model, kind }) {
  const m = res.members ? res.members.length : model.members.length;
  const nn = res.nUsed == null ? model.nodes.length : res.nUsed;
  const rOf = s => { let n = s.type === "fixed" ? 3 : s.type === "pin" ? 2 : s.type === "guided" ? 2 : (s.type === "rollerV" || s.type === "rollerH") ? 1 : 0; if (s.kx) n++; if (s.ky) n++; if (s.kr) n++; return n; };
  const r = res.rCount == null ? (model.supports || []).reduce((a, s) => a + rOf(s), 0) : res.rCount;
  const rel = res.releases == null ? 0 : res.releases;
  const SI = res.SI;
  const stiffVaries = model.members.some(mb => mb.EI != null);
  const anySettle = (model.supports || []).some(s => s.dx || s.dy || s.rz);

  const det = (
    <Lesson n="0" title="Is it solvable, and how locked is it?" sub="unknowns vs equations" accent={C.defl}>
      <p className="say">Each joint of a plane frame gives <b>three</b> equations (ΣFx, ΣFy, ΣM), so <b>3n</b> in all. Every rigid member carries three end actions, each support supplies r components, and every internal hinge removes one unknown moment:</p>
      <Eqn>
        <Step>SI = 3m + r − 3n − releases</Step>
        <Step>SI = 3×{m} + {r} − 3×{nn} − {rel} = <span className="res">{SI}</span></Step>
      </Eqn>
      <p className="say">
        {!res.stable ? <><b>Mechanism.</b> {res.reason}</>
          : SI === 0 ? <><b>SI = 0 → determinate.</b> Equilibrium alone gives every force; stiffness is irrelevant to the answer.</>
            : <><b>SI = {SI} → indeterminate to degree {SI}.</b> Equilibrium is not enough — the extra unknowns are settled by relative stiffness. That is exactly why <i>changing an EI changes the answer</i>, and why settlement can induce moments.</>}
      </p>
      <Call kind="remember">Reaction components: <b>fixed 3</b>, <b>pin 2</b>, <b>roller 1</b>. Each hinge subtracts 1. Fixed-base portal = 3; pin the feet → 1; add an apex hinge → 0.</Call>
      {rel > 0 && <Call kind="fact">This model has <b>{rel} release{rel > 1 ? "s" : ""}</b> (orange circles on the canvas). The moment there is zero by definition — a useful check on the moment diagram.</Call>}
    </Lesson>
  );
  if (!res.stable) return <div className="teach">{det}</div>;

  let pM = { v: 0 }, pV = { v: 0 }, pN = { v: 0 };
  res.members.forEach(mb => mb.samples.forEach(p => {
    if (Math.abs(p.M) > Math.abs(pM.v)) pM = { v: p.M, id: mb.id, s: p.s };
    if (Math.abs(p.V) > Math.abs(pV.v)) pV = { v: p.V, id: mb.id };
    if (Math.abs(p.N) > Math.abs(pN.v)) pN = { v: p.N, id: mb.id };
  }));
  let dn = res.nodes[0]; res.nodes.forEach(n => { if (Math.hypot(n.ux, n.uy) > Math.hypot(dn.ux, dn.uy)) dn = n; });
  const sway = Math.max(...res.nodes.map(n => Math.abs(n.ux)));

  return (
    <div className="teach">
      <p className="intro">A hand-solve of an indeterminate frame is long, so these checks verify the result the way you would defend it in a viva: equilibrium must balance, and every quantity is laid out for inspection.</p>
      {kind === "arch" && <Call kind="fact" title="Arch action">An arch carries load mainly in <b>compression</b> and pushes outward at its springings — that horizontal <b>thrust</b> is the whole point (see Rx below). A parabola under uniform load is <i>funicular</i>: the thrust line follows the arch, bending nearly vanishes, and H ≈ wL²/8h. Change the shape or the load and bending reappears.</Call>}
      {det}

      <Lesson n="1" title="Global equilibrium — the master check" sub="ΣFx = ΣFy = ΣM = 0" accent={C.good}>
        <p className="say">Whatever happens internally, applied loads and reactions must cancel. If this fails, nothing else is trustworthy.</p>
        <Eqn>
          <Step>ΣFx: applied {fmt(res.appliedFx, 1)} + reactions {fmt(res.reacFx, 1)} = {fmt(res.appliedFx + res.reacFx, 2)} kN</Step>
          <Step>ΣFy: applied {fmt(res.appliedFy, 1)} + reactions {fmt(res.reacFy, 1)} = {fmt(res.appliedFy + res.reacFy, 2)} kN</Step>
          <Step><span className={res.eqOK ? "ok" : "no"}>{res.eqOK ? "balanced ✓ (forces and moments)" : "NOT balanced ✗"}</span></Step>
        </Eqn>
        {anySettle && <Call kind="tip">With settlement and no applied load, the reactions must sum to <b>zero</b> — they are a self-equilibrating set. That is the signature of a locked-in (secondary) stress state.</Call>}
      </Lesson>

      <Lesson n="2" title="Support reactions" sub="how the ground holds it" accent={C.shear}>
        <table className="vt"><thead><tr><th>node</th><th>type</th><th>Rx kN</th><th>Ry kN</th><th>M kN·m</th></tr></thead><tbody>
          {res.reactions.map((rc, i) => <tr key={i}><td>{rc.node}{rc.settled ? " ↓" : ""}{rc.spring ? " ~" : ""}</td><td>{rc.type === "none" ? "spring" : rc.type}</td><td>{fmt(rc.Rx, 1)}</td><td>{fmt(rc.Ry, 1)}</td><td>{Math.abs(rc.M) > 1e-6 ? fmt(rc.M, 1) : "—"}</td></tr>)}
        </tbody></table>
        <p className="say dim">+Rx acts right, +Ry up, +M anticlockwise. A pin gives Rx and Ry; a fixed base adds a moment; a roller gives one component normal to its surface.</p>
      </Lesson>

      <Lesson n="3" title="Member end actions" sub="axial · shear · moment at each end" accent={C.axial}>
        <table className="vt"><thead><tr><th>member</th><th>N₁</th><th>V₁</th><th>M₁</th><th>N₂</th><th>V₂</th><th>M₂</th></tr></thead><tbody>
          {res.members.map((mb, i) => { const a = mb.samples[0], b = mb.samples[mb.samples.length - 1]; return <tr key={i}><td>{mb.id}{(mb.rel1 || mb.rel2) ? " ○" : ""}</td><td>{fmt(a.N, 1)}</td><td>{fmt(a.V, 1)}</td><td>{fmt(a.M, 1)}</td><td>{fmt(b.N, 1)}</td><td>{fmt(b.V, 1)}</td><td>{fmt(b.M, 1)}</td></tr>; })}
        </tbody></table>
        <Call kind="tip">Joint check: at a rigid joint the member moments must sum to zero (plus any applied joint moment). Pick a corner and add up its M values — a fast way to prove a moment diagram in the exam.</Call>
      </Lesson>

      {stiffVaries && (
        <Lesson n="4" title="Relative stiffness is doing the work" sub="why EI ratios change the answer" accent={C.defl}>
          <table className="vt"><thead><tr><th>member</th><th>EI kN·m²</th><th>L m</th><th>stiffness EI/L</th></tr></thead><tbody>
            {res.members.map((mb, i) => <tr key={i}><td>{mb.id}</td><td>{fmt(mb.EI, 0)}</td><td>{fmt(mb.L, 2)}</td><td>{fmt(mb.EI / mb.L, 0)}</td></tr>)}
          </tbody></table>
          <p className="say">In an indeterminate structure, moment flows toward stiffness. At a joint, each member takes a share of the moment in proportion to its <b>distribution factor</b> — its own EI/L over the sum of all EI/L at that joint. That single idea is the whole of moment distribution.</p>
          <Call kind="remember">Stiffen a member and it attracts more moment. It does not shed load by being strong — it attracts load by being <i>stiff</i>. Counter-intuitive, and examiners love it.</Call>
        </Lesson>
      )}

      <Lesson n={stiffVaries ? "5" : "4"} title="Governing results" sub="the numbers that size the members" accent={C.moment}>
        <Eqn>
          <Step>Max bending |M| = <b>{fmt(Math.abs(pM.v), 1)} kN·m</b> in {pM.id} (s = {fmt(pM.s)} m)</Step>
          <Step>Max shear |V| = <b>{fmt(Math.abs(pV.v), 1)} kN</b> in {pV.id}</Step>
          <Step>Axial: tension {fmt(Math.max(0, res.Nmax), 1)} kN · compression {fmt(Math.min(0, res.Nmin), 1)} kN</Step>
          <Step>Max movement <b>{fmt(res.dmax * 1000, 1)} mm</b> at node {dn.id} · lateral sway {fmt(sway * 1000, 1)} mm</Step>
        </Eqn>
        <Call kind="remember">Sway governs lateral serviceability — typically height/300 to height/500. Vertical sag on beams is the usual span/360 check.</Call>
      </Lesson>

      <Lesson n="✓" title="How to attack a frame by hand" sub="exam method" accent={C.ink} open={false}>
        <Eqn>
          <Step>1. Determinacy: SI = 3m + r − 3n − releases. Zero → pure statics.</Step>
          <Step>2. Look for symmetry. Symmetric frame + symmetric load ⇒ no sway, and the shear at the axis is zero.</Step>
          <Step>3. Reactions from whole-frame equilibrium; use hinges to supply extra equations (M = 0 there).</Step>
          <Step>4. Cut each member free, apply end actions, draw N, V, M in local axes.</Step>
          <Step>5. Joint equilibrium: moments into a rigid joint sum to zero.</Step>
          <Step>6. Deflected shape: joints keep their angles, members stay continuous, and curvature must agree in sign with the moment diagram.</Step>
        </Eqn>
        <Call kind="fact">Anchors worth memorising: cantilever PH and PH³/3EI · simply supported wL²/8 and 5wL⁴/384EI · fixed-fixed wL²/12 and wL²/24 · propped wL²/8, 5wL/8, 3wL/8 · sway of a rigid-beam portal Hh³/24EI with base moment Hh/4.</Call>
        <Call kind="watch" title="What this tool does not model">First-order elastic analysis only — no P-delta or buckling capacity, no plastic hinges or collapse mechanisms, no shear deformation, and supports are rigid, sprung or settled but never inclined. Members are prismatic (no haunches).</Call>
      </Lesson>
    </div>
  );
}

/* ============================================================
   MAIN
   ============================================================ */
export default function StructuralLab({ initialKind = "frame", hideKindBar = false }) {
  const init = useMemo(() => KINDS[initialKind].presets[0].make(), [initialKind]);
  const [nodes, setNodes] = useState(init.nodes);
  const [members, setMembers] = useState(init.members);
  const [supports, setSupports] = useState(init.supports);
  const [loads, setLoads] = useState(init.loads);
  const [EA, setEA] = useState(2e6);
  const [EI, setEI] = useState(2e4);
  const [selection, setSelection] = useState(null);
  const [diagram, setDiagram] = useState("model");
  // arches open on Geometry so the generator (span/rise/profile) is visible at once
  const [section, setSection] = useState(initialKind === "arch" ? "geometry" : "loads");
  const [kind, setKind] = useState(initialKind);
  const [preset, setPreset] = useState(KINDS[initialKind].presets[0].name);
  const narrow = useNarrow();
  const [archCfg, setArchCfg] = useState({ span: 12, rise: 3.5, segs: 12, profile: "parabola", support: "pin", threePin: false });

  const model = { nodes, members, supports, loads };
  const res = useMemo(() => KINDS[kind].analyze({ nodes, members, supports, loads, EA, EI, sub: 10 }), [kind, nodes, members, supports, loads, EA, EI]);
  const diagrams = KINDS[kind].diagrams;
  const presetNote = (KINDS[kind].presets.find(p => p.name === preset) || {}).note;

  const loadModel = c => { setNodes(c.nodes); setMembers(c.members); setSupports(c.supports); setLoads(c.loads); setSelection(null); };
  const applyPreset = p => { loadModel(p.make()); setPreset(p.name); setDiagram("model"); };
  const switchKind = k => {
    if (k === kind) return;
    setKind(k); const p = KINDS[k].presets[0]; loadModel(p.make()); setPreset(p.name);
    setDiagram("model"); setSection(k === "arch" ? "geometry" : "loads");
  };
  const regenArch = patch => { const a = { ...archCfg, ...patch }; setArchCfg(a); loadModel(makeArch(a)); setPreset(""); };

  const updNode = (id, patch) => setNodes(ns => ns.map(n => n.id === id ? { ...n, ...patch } : n));
  const addNode = () => { const id = nextNodeId(nodes); const mx = Math.max(0, ...nodes.map(n => n.x)); setNodes(ns => [...ns, { id, x: Math.round(mx) + 2, y: 0 }]); setSelection({ kind: "node", id }); setSection("geometry"); };
  const delNode = id => {
    const gone = members.filter(m => m.n1 === id || m.n2 === id).map(m => m.id);
    setMembers(ms => ms.filter(m => m.n1 !== id && m.n2 !== id));
    setSupports(ss => ss.filter(s => s.node !== id));
    setLoads(ls => ls.filter(l => !(l.type === "node" && l.node === id) && !((l.type === "udl" || l.type === "mpoint") && gone.indexOf(l.member) >= 0)));
    setNodes(ns => ns.filter(n => n.id !== id));
    setSelection(null);
  };
  const onDragNode = (id, x, y) => updNode(id, { x, y });

  const updMember = (id, patch) => setMembers(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m));
  const addMember = () => { if (nodes.length < 2) return; const id = nextMemberId(members); setMembers(ms => [...ms, { id, n1: nodes[0].id, n2: nodes[1].id }]); setSelection({ kind: "member", id }); setSection("geometry"); };
  const delMember = id => { setLoads(ls => ls.filter(l => !((l.type === "udl" || l.type === "mpoint") && l.member === id))); setMembers(ms => ms.filter(m => m.id !== id)); setSelection(null); };

  const getSup = node => (supports || []).find(x => x.node === node) || null;
  const setSupType = (node, type) => setSupports(ss => {
    const cur = ss.find(s => s.node === node) || {};
    const rest = ss.filter(s => s.node !== node);
    if (type === "none" && !cur.kx && !cur.ky && !cur.kr) return rest;
    return [...rest, { ...cur, node, type }];
  });
  const patchSup = (node, patch) => setSupports(ss => {
    const cur = ss.find(s => s.node === node);
    const rest = ss.filter(s => s.node !== node);
    return [...rest, { node, type: "none", ...cur, ...patch }];
  });

  const updLoad = (id, patch) => setLoads(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const delLoad = id => { setLoads(ls => ls.filter(l => l.id !== id)); setSelection(null); };
  const addLoad = type => {
    const id = uid();
    if (type === "node") { const node = (selection && selection.kind === "node") ? selection.id : nodes[0].id; setLoads(ls => [...ls, { id, type: "node", node, Fx: 0, Fy: -10, M: 0 }]); }
    else {
      const member = (selection && selection.kind === "member") ? selection.id : (members[0] && members[0].id);
      if (!member) return;
      if (type === "udl") setLoads(ls => [...ls, { id, type: "udl", member, w: 10, w2: 10, t1: 0, t2: 1, dir: "grav" }]);
      else if (type === "mpoint") setLoads(ls => [...ls, { id, type: "mpoint", member, t: 0.5, Fx: 0, Fy: -10, M: 0 }]);
      else setLoads(ls => [...ls, { id, type: "mpoint", member, t: 0.5, Fx: 0, Fy: 0, M: 20 }]);
    }
    setSelection({ kind: "load", id }); setSection("loads");
  };

  const select = (k, id) => {
    if (!k) { setSelection(null); return; }
    setSelection({ kind: k, id });
    if (k === "load") setSection("loads");
    else if (section !== "loads" && section !== "supports") setSection("geometry");
  };

  const stamp = (!res.stable || res.SI < 0) ? { txt: "MECHANISM", col: C.bad } : res.SI === 0 ? { txt: "DETERMINATE", col: C.good } : { txt: `INDETERMINATE ×${res.SI}`, col: C.moment };
  const counts = { geometry: nodes.length + members.length, supports: (supports || []).length, loads: loads.length };
  const num = (v, on, step) => <input type="number" step={step || "any"} value={Number.isFinite(v) ? v : 0} onChange={e => on(parseFloat(e.target.value) || 0)} />;
  const selLoad = selection && selection.kind === "load" ? loads.find(l => l.id === selection.id) : null;
  const selMember = selection && selection.kind === "member" ? members.find(m => m.id === selection.id) : null;
  const nodeOpts = nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>);
  const memberOpts = members.map(m => <option key={m.id} value={m.id}>{m.id} ({m.n1}→{m.n2})</option>);
  const isTruss = kind === "truss";

  return (
    <div className="fl">
      <style>{CSS}</style>

      <div className="tb">
        <div className="tbc">
          <div className="ttl">
            <svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21 V6 H20 V21" /><path d="M2 21 H22" /><path d="M4 6 H20" /></svg>
            STRUCTURAL LAB
          </div>
          <div className="tmeta">{isTruss ? "Plane trusses — axial · deflection" : kind === "arch" ? "Arches — thrust · N · V · M · deflection" : "Plane frames — N · V · M · deflection"} · IStructE prep</div>
        </div>
        <div className="tbc">
          <div className="live"><span className="dot" />auto-solve</div>
          <div className="tmeta" style={{ marginTop: 3 }}>{isTruss ? "EA default" : "EI · EA default"}</div>
          <div className="tval">{isTruss ? fmt(EA, 0) : `${fmt(EI, 0)} · ${fmt(EA, 0)}`}</div>
        </div>
        <div className="tbc" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="stamp" style={{ "--sc": stamp.col }}>{stamp.txt}</div>
          <div className="tmeta" style={{ marginTop: 6 }}>SI = {KINDS[kind].si} = {res.SI}</div>
        </div>
      </div>

      {!res.stable && <div className="banner">⚠ MECHANISM — {res.reason}</div>}

      {!hideKindBar && <div className="kindbar">
        {Object.keys(KINDS).map(k => <button key={k} className={"kindb" + (kind === k ? " on" : "")} onClick={() => switchKind(k)}>{KINDS[k].label}</button>)}
      </div>}

      <div className="chips">
        {KINDS[kind].presets.map(p => <button key={p.name} className={"chip" + (preset === p.name ? " on" : "")} onClick={() => applyPreset(p)}>{p.name}</button>)}
      </div>
      {presetNote && <div className="pnote">{presetNote}</div>}

      <div className="work">
        <div>
          <div className="panel readout">
            {isTruss ? <>
              <div className="rc"><div className="rl">Max tension</div><div className="rv" style={{ "--cvc": C.axial }}>{res.stable ? fmt(Math.max(0, res.Nmax), 1) : "—"}</div></div>
              <div className="rc"><div className="rl">Max comp.</div><div className="rv" style={{ "--cvc": C.bad }}>{res.stable ? fmt(Math.min(0, res.Nmin), 1) : "—"}</div></div>
              <div className="rc"><div className="rl">SI</div><div className="rv">{res.stable ? res.SI : "—"}</div></div>
              <div className="rc"><div className="rl">Max δ</div><div className="rv" style={{ "--cvc": C.defl }}>{res.stable ? `${fmt(res.dmax * 1000, 2)} mm` : "—"}</div></div>
            </> : <>
              <div className="rc"><div className="rl">Max M</div><div className="rv" style={{ "--cvc": C.moment }}>{res.stable ? fmt(Math.max(Math.abs(res.Mmax), Math.abs(res.Mmin)), 1) : "—"}</div></div>
              <div className="rc"><div className="rl">Max V</div><div className="rv" style={{ "--cvc": C.shear }}>{res.stable ? fmt(Math.max(Math.abs(res.Vmax), Math.abs(res.Vmin)), 1) : "—"}</div></div>
              <div className="rc"><div className="rl">Max N</div><div className="rv" style={{ "--cvc": C.axial }}>{res.stable ? fmt(Math.max(Math.abs(res.Nmax), Math.abs(res.Nmin)), 1) : "—"}</div></div>
              <div className="rc"><div className="rl">Max δ</div><div className="rv" style={{ "--cvc": C.defl }}>{res.stable ? `${fmt(res.dmax * 1000, 1)} mm` : "—"}</div></div>
            </>}
          </div>

          <div className="panel">
            <div className="dchips">
              {diagrams.map(k => <button key={k} className={"dchip" + (diagram === k ? " on" : "")} style={{ "--dc": DIAG[k].col }} onClick={() => setDiagram(k)}><span className="dt" style={{ background: DIAG[k].col }} />{isTruss && k === "N" ? "Axial (T/C)" : DIAG[k].lab}</button>)}
            </div>
            <FrameCanvas narrow={narrow} model={model} res={res} diagram={diagram} selection={selection} onSelect={select} onDragNode={onDragNode} kind={kind} />
            <div className="hint">
              <span><b>Drag</b> nodes · <b>tap</b> a node or member to edit</span>
              {diagram === "M" && <span className="legend"><span className="sw" style={{ background: C.moment }} />plotted on the tension face · ○ = hinge, M = 0</span>}
              {diagram === "N" && isTruss && <span className="legend"><span className="sw" style={{ background: C.axial }} />tension</span>}
              {diagram === "N" && isTruss && <span className="legend"><span className="sw" style={{ background: C.bad }} />compression · dashed = zero-force</span>}
              {diagram === "N" && !isTruss && <span className="legend"><span className="sw" style={{ background: C.axial }} />tension + · compression −</span>}
              {diagram === "V" && <span className="legend"><span className="sw" style={{ background: C.shear }} />shear, local sign</span>}
              {diagram === "D" && <span className="legend"><span className="sw" style={{ background: C.defl }} />deformed (exaggerated) vs dashed original</span>}
              {diagram === "model" && <span className="legend"><span className="sw" style={{ background: C.good }} />green = reactions · navy = loads</span>}
            </div>
          </div>
        </div>

        <div>
          <div className="nav">
            {[["geometry", "Geometry", <IcoGeom key="g" />], ["supports", "Supports", <IcoSup key="s" />], ["loads", "Loads", <IcoLoad key="l" />], ["verify", "Verify", <IcoCheck key="v" />]].map(([k, lab, ico]) => (
              <button key={k} className={"navb" + (section === k ? " on" : "")} onClick={() => setSection(k)}>{ico}{lab}{k !== "verify" && <span className="cnt">{counts[k]}</span>}</button>
            ))}
          </div>

          {section === "geometry" && (
            <div className="panel"><div className="pad">
              {kind === "arch" && <>
                <div className="sub">Arch generator</div>
                <div className="grid2">
                  <div className="fld"><span className="fl-l">span L (m)</span>{num(archCfg.span, v => regenArch({ span: Math.max(2, v) }))}</div>
                  <div className="fld"><span className="fl-l">rise h (m)</span>{num(archCfg.rise, v => regenArch({ rise: Math.max(0.2, v) }))}</div>
                </div>
                <div className="fld" style={{ marginTop: 8 }}><span className="fl-l">segments {archCfg.segs}</span>
                  <input type="range" min="4" max="24" step="2" value={archCfg.segs} onChange={e => regenArch({ segs: parseInt(e.target.value, 10) })} /></div>
                <div className="grid2" style={{ marginTop: 4 }}>
                  <div className="fld"><span className="fl-l">profile</span>
                    <div className="dirbtns">
                      <button className={"db" + (archCfg.profile === "parabola" ? " on" : "")} onClick={() => regenArch({ profile: "parabola" })}>parabola</button>
                      <button className={"db" + (archCfg.profile === "circle" ? " on" : "")} onClick={() => regenArch({ profile: "circle" })}>circle</button>
                    </div></div>
                  <div className="fld"><span className="fl-l">springings</span>
                    <div className="dirbtns">
                      <button className={"db" + (archCfg.support === "pin" ? " on" : "")} onClick={() => regenArch({ support: "pin" })}>pinned</button>
                      <button className={"db" + (archCfg.support === "fixed" ? " on" : "")} onClick={() => regenArch({ support: "fixed" })}>fixed</button>
                    </div></div>
                </div>
                <div className={"tog" + (archCfg.threePin ? " on" : "")} style={{ marginTop: 9 }} onClick={() => regenArch({ threePin: !archCfg.threePin })}>
                  <span className="tgb" /><span><span className="tgl">Crown hinge (3-pinned)</span><span className="tgs">makes a pinned arch statically determinate</span></span>
                </div>
                <Call kind="fact">Thrust H ≈ wL²/8h. Halve the rise and the thrust doubles — try it with the slider.</Call>
              </>}

              <div className="sub">Default stiffness</div>
              <div className={isTruss ? "" : "grid2"}>
                {!isTruss && <div className="fld"><span className="fl-l">EI (kN·m²)</span>{num(EI, setEI)}</div>}
                <div className="fld"><span className="fl-l">EA (kN)</span>{num(EA, setEA)}</div>
              </div>

              <div className="sub">Nodes (m)</div>
              {nodes.map(n => (
                <div key={n.id} className={"item" + (selection && selection.kind === "node" && selection.id === n.id ? " sel" : "")} onClick={() => select("node", n.id)}>
                  <div className="iz" style={{ font: "700 12px " + MONO }}>{n.id}</div>
                  <div className="ib grid2" onClick={e => e.stopPropagation()}>
                    <div className="fld"><span className="fl-l">x</span>{num(n.x, v => updNode(n.id, { x: v }))}</div>
                    <div className="fld"><span className="fl-l">y</span>{num(n.y, v => updNode(n.id, { y: v }))}</div>
                  </div>
                  <button className="del" onClick={e => { e.stopPropagation(); delNode(n.id); }}>×</button>
                </div>
              ))}
              <div className="add"><button className="btn" onClick={addNode}>+ node</button></div>

              <div className="sub">Members</div>
              {members.map(mb => (
                <div key={mb.id} className={"item" + (selMember && selMember.id === mb.id ? " sel" : "")} onClick={() => select("member", mb.id)}>
                  <div className="iz" style={{ font: "700 11px " + MONO }}>{mb.id}</div>
                  <div className="ib grid2" onClick={e => e.stopPropagation()}>
                    <div className="fld"><span className="fl-l">from</span><select value={mb.n1} onChange={e => updMember(mb.id, { n1: e.target.value })}>{nodeOpts}</select></div>
                    <div className="fld"><span className="fl-l">to</span><select value={mb.n2} onChange={e => updMember(mb.id, { n2: e.target.value })}>{nodeOpts}</select></div>
                  </div>
                  <button className="del" onClick={e => { e.stopPropagation(); delMember(mb.id); }}>×</button>
                </div>
              ))}
              <div className="add"><button className="btn" onClick={addMember}>+ member</button></div>

              {selMember && !isTruss && (
                <div className="panel acc" style={{ "--pac": C.defl, marginTop: 11, marginBottom: 0 }}>
                  <div className="ph" style={{ "--pac": C.defl }}>Member {selMember.id} · properties</div>
                  <div className="pad">
                    <div className="fld"><span className="fl-l">EI (blank = default {fmt(EI, 0)})</span>
                      <input type="number" value={selMember.EI == null ? "" : selMember.EI} placeholder={String(EI)} onChange={e => updMember(selMember.id, { EI: e.target.value === "" ? undefined : (parseFloat(e.target.value) || 0) })} /></div>
                    <div className="seg" style={{ marginTop: 8 }}>
                      {[0.5, 1, 2, 5, 10].map(f => <button key={f} className="sb" onClick={() => updMember(selMember.id, { EI: EI * f })}>{f}× EI</button>)}
                      <button className="sb" onClick={() => updMember(selMember.id, { EI: undefined })}>reset</button>
                    </div>
                    <div className="sub" style={{ marginTop: 13 }}>End releases (internal hinges)</div>
                    <div className={"tog" + (selMember.rel1 ? " on" : "")} onClick={() => updMember(selMember.id, { rel1: !selMember.rel1 })}>
                      <span className="tgb" /><span><span className="tgl">Hinge at {selMember.n1} end</span><span className="tgs">moment released — M = 0 there</span></span>
                    </div>
                    <div className={"tog" + (selMember.rel2 ? " on" : "")} onClick={() => updMember(selMember.id, { rel2: !selMember.rel2 })}>
                      <span className="tgb" /><span><span className="tgl">Hinge at {selMember.n2} end</span><span className="tgs">moment released — M = 0 there</span></span>
                    </div>
                    <Call kind="tip">Releasing both ends of a beam turns a fixed-fixed member into a simply supported one. Release one end of a member at a joint to build a three-pinned frame or a Gerber beam.</Call>
                  </div>
                </div>
              )}
            </div></div>
          )}

          {section === "supports" && (
            <div className="panel"><div className="pad">
              <div className="sub">Restraint at each node</div>
              {nodes.map(n => {
                const sp = getSup(n.id) || {};
                const t = sp.type || "none";
                const opts = isTruss ? [["none", "Free"], ["pin", "Pin"], ["rollerV", "Roller V"], ["rollerH", "Roller H"]] : [["none", "Free"], ["pin", "Pin"], ["fixed", "Fixed"], ["rollerV", "Roller V"], ["rollerH", "Roller H"], ["guided", "Guided"]];
                return (
                  <div key={n.id} style={{ marginBottom: 14 }}>
                    <div style={{ font: "600 10px " + MONO, color: C.inkSoft, marginBottom: 5 }}>Node {n.id}
                      {(sp.dx || sp.dy) ? <span className="flag settle">settled</span> : null}
                      {(sp.kx || sp.ky || sp.kr) ? <span className="flag spring">spring</span> : null}
                    </div>
                    <div className="seg">
                      {opts.map(([tt, lab]) => <button key={tt} className={"sb" + (t === tt ? " on" : "")} onClick={() => setSupType(n.id, tt)}>{tt !== "none" && <SupGlyph type={tt} />}{lab}</button>)}
                    </div>
                    {t !== "none" && !isTruss && (
                      <div className="grid2" style={{ marginTop: 7 }}>
                        <div className="fld"><span className="fl-l">settle dy (mm)</span>
                          <input type="number" value={sp.dy ? Math.round(sp.dy * 1000) : 0} onChange={e => patchSup(n.id, { dy: (parseFloat(e.target.value) || 0) / 1000 })} /></div>
                        <div className="fld"><span className="fl-l">settle dx (mm)</span>
                          <input type="number" value={sp.dx ? Math.round(sp.dx * 1000) : 0} onChange={e => patchSup(n.id, { dx: (parseFloat(e.target.value) || 0) / 1000 })} /></div>
                      </div>
                    )}
                    <div className="grid2" style={{ marginTop: 7 }}>
                      <div className="fld"><span className="fl-l">spring ky (kN/m)</span>
                        <input type="number" value={sp.ky || 0} onChange={e => patchSup(n.id, { ky: parseFloat(e.target.value) || 0 })} /></div>
                      {!isTruss && <div className="fld"><span className="fl-l">spring kr (kNm/rad)</span>
                        <input type="number" value={sp.kr || 0} onChange={e => patchSup(n.id, { kr: parseFloat(e.target.value) || 0 })} /></div>}
                    </div>
                  </div>
                );
              })}
              <Call kind="tip">Roller V rests on a horizontal surface (vertical reaction); Roller H bears against a vertical one. <b>Guided</b> slides but cannot rotate. A <b>spring</b> is a flexible support — set ky and leave the type Free to see how a soft prop redistributes moment.</Call>
              {!isTruss && <Call kind="remember">Settlement only causes stress in an <b>indeterminate</b> structure. Settle a support on the Simple beam preset and nothing happens; do it on a portal and moments appear from nowhere.</Call>}
            </div></div>
          )}

          {section === "loads" && (
            <div className="panel"><div className="pad">
              <div className="add" style={{ marginTop: 0, marginBottom: 10 }}>
                <button className="btn" onClick={() => addLoad("node")}>+ {isTruss ? "joint" : "nodal"}</button>
                {!isTruss && <button className="btn" onClick={() => addLoad("udl")}>+ UDL / varying</button>}
                {!isTruss && <button className="btn" onClick={() => addLoad("mpoint")}>+ point</button>}
                {!isTruss && <button className="btn gh" onClick={() => addLoad("mmoment")}>+ moment</button>}
              </div>
              {isTruss && <Call kind="remember">A pin-jointed truss can only take load <b>at its joints</b>. A load applied along a bar would bend it, which a true truss member cannot do — that is why only joint loads are offered here.</Call>}
              {loads.length === 0 && <div style={{ font: "500 11px " + MONO, color: C.inkSoft, padding: "6px 2px" }}>No loads — the structure is unloaded.</div>}
              {loads.map(l => (
                <div key={l.id} className={"item" + (selLoad && selLoad.id === l.id ? " sel" : "")} onClick={() => select("load", l.id)}>
                  <div className="ib"><div className="it">{loadTitle(l)}</div><div className="is">{loadSummary(l)}</div></div>
                  <button className="del" onClick={e => { e.stopPropagation(); delLoad(l.id); }}>×</button>
                </div>
              ))}
              {selLoad && <div className="panel acc" style={{ "--pac": C.load, marginTop: 10, marginBottom: 0 }}>
                <div className="ph" style={{ "--pac": C.load }}>Edit · {loadTitle(selLoad)}</div>
                <div className="pad">
                  {selLoad.type === "node" && <>
                    <div className="fld" style={{ marginBottom: 8 }}><span className="fl-l">at node</span><select value={selLoad.node} onChange={e => updLoad(selLoad.id, { node: e.target.value })}>{nodeOpts}</select></div>
                    <div className={isTruss ? "grid2" : "grid3"}>
                      <div className="fld"><span className="fl-l">Fx kN (→+)</span>{num(selLoad.Fx, v => updLoad(selLoad.id, { Fx: v }))}</div>
                      <div className="fld"><span className="fl-l">Fy kN (↑+)</span>{num(selLoad.Fy, v => updLoad(selLoad.id, { Fy: v }))}</div>
                      {!isTruss && <div className="fld"><span className="fl-l">M kN·m (↺+)</span>{num(selLoad.M, v => updLoad(selLoad.id, { M: v }))}</div>}
                    </div>
                  </>}
                  {selLoad.type === "udl" && <>
                    <div className="fld" style={{ marginBottom: 8 }}><span className="fl-l">on member</span><select value={selLoad.member} onChange={e => updLoad(selLoad.id, { member: e.target.value })}>{memberOpts}</select></div>
                    <div className="grid2">
                      <div className="fld"><span className="fl-l">w start kN/m</span>{num(selLoad.w, v => updLoad(selLoad.id, { w: v }))}</div>
                      <div className="fld"><span className="fl-l">w end kN/m</span>{num(selLoad.w2 == null ? selLoad.w : selLoad.w2, v => updLoad(selLoad.id, { w2: v }))}</div>
                    </div>
                    <div className="seg" style={{ marginTop: 7 }}>
                      <button className="sb" onClick={() => updLoad(selLoad.id, { w2: selLoad.w })}>uniform</button>
                      <button className="sb" onClick={() => updLoad(selLoad.id, { w: 0, w2: selLoad.w || 10 })}>triangular</button>
                      <button className="sb" onClick={() => updLoad(selLoad.id, { t1: 0, t2: 1 })}>full span</button>
                    </div>
                    <div className="grid2" style={{ marginTop: 8 }}>
                      <div className="fld"><span className="fl-l">from {Math.round((selLoad.t1 == null ? 0 : selLoad.t1) * 100)}%</span>
                        <input type="range" min="0" max="1" step="0.05" value={selLoad.t1 == null ? 0 : selLoad.t1} onChange={e => updLoad(selLoad.id, { t1: Math.min(parseFloat(e.target.value), (selLoad.t2 == null ? 1 : selLoad.t2) - 0.05) })} /></div>
                      <div className="fld"><span className="fl-l">to {Math.round((selLoad.t2 == null ? 1 : selLoad.t2) * 100)}%</span>
                        <input type="range" min="0" max="1" step="0.05" value={selLoad.t2 == null ? 1 : selLoad.t2} onChange={e => updLoad(selLoad.id, { t2: Math.max(parseFloat(e.target.value), (selLoad.t1 == null ? 0 : selLoad.t1) + 0.05) })} /></div>
                    </div>
                    <div className="fld" style={{ marginTop: 8 }}><span className="fl-l">direction</span>
                      <div className="dirbtns">
                        <button className={"db" + (selLoad.dir === "grav" ? " on" : "")} onClick={() => updLoad(selLoad.id, { dir: "grav" })}>gravity ↓</button>
                        <button className={"db" + (selLoad.dir === "perp" ? " on" : "")} onClick={() => updLoad(selLoad.id, { dir: "perp" })}>perp (wind)</button>
                      </div></div>
                  </>}
                  {selLoad.type === "mpoint" && <>
                    <div className="fld" style={{ marginBottom: 8 }}><span className="fl-l">on member</span><select value={selLoad.member} onChange={e => updLoad(selLoad.id, { member: e.target.value })}>{memberOpts}</select></div>
                    <div className="fld" style={{ marginBottom: 8 }}><span className="fl-l">position {Math.round((selLoad.t == null ? .5 : selLoad.t) * 100)}% from start</span>
                      <input type="range" min="0" max="1" step="0.05" value={selLoad.t == null ? .5 : selLoad.t} onChange={e => updLoad(selLoad.id, { t: parseFloat(e.target.value) })} /></div>
                    <div className="grid3">
                      <div className="fld"><span className="fl-l">Fx kN</span>{num(selLoad.Fx, v => updLoad(selLoad.id, { Fx: v }))}</div>
                      <div className="fld"><span className="fl-l">Fy kN</span>{num(selLoad.Fy, v => updLoad(selLoad.id, { Fy: v }))}</div>
                      <div className="fld"><span className="fl-l">M kN·m</span>{num(selLoad.M, v => updLoad(selLoad.id, { M: v }))}</div>
                    </div>
                  </>}
                </div>
              </div>}
            </div></div>
          )}

          {section === "verify" && (isTruss
            ? <VerifyTruss res={res} model={model} />
            : <VerifyFrame res={res} model={model} kind={kind} />)}
        </div>
      </div>
    </div>
  );
}
