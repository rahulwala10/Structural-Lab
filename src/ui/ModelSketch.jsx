import React from "react";

/* Static drawing of a frame-format model (beams are just horizontal frames):
   members, supports, hinges, loads, dimensions — plus an optional bending
   moment diagram (tension face) or exaggerated deflected shape. Renders an
   SVG <g> so it can sit inside the scratch pad, aligned with any overlay. */

const C = { ink: "#1B2A41", soft: "#5B6B7C", line: "#C2CDD6", load: "#11304A", moment: "#D4622A", defl: "#6D4FC0", hinge: "#D4622A" };
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const f1 = v => { const a = Math.abs(v); const s = a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2); return s.replace(/\.?0+$/, ""); };

export function frameOf(model, W, H, compact) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  model.nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
  if (!isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
  const isBeam = maxY - minY < 1e-9;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const m = compact ? { l: 16, r: 16, t: 14, b: 16 } : { l: 52, r: 30, t: 30, b: isBeam ? 64 : 58 };
  const pad = 0.17 * span;
  const wx0 = minX - pad, wx1 = maxX + pad;
  const wy0 = isBeam ? minY - 0.3 * span : minY - pad, wy1 = isBeam ? maxY + 0.3 * span : maxY + pad;
  const sc = Math.min((W - m.l - m.r) / (wx1 - wx0), (H - m.t - m.b) / (wy1 - wy0));
  const offX = m.l + ((W - m.l - m.r) - (wx1 - wx0) * sc) / 2, offY = m.t + ((H - m.t - m.b) - (wy1 - wy0) * sc) / 2;
  return { SX: x => offX + (x - wx0) * sc, SY: y => offY + (wy1 - y) * sc, sc, span, isBeam, minX, maxX, minY, maxY };
}

const arrowHead = (x, y, ang, s, col) => (
  <path d={`M${x} ${y} L${x - s * Math.cos(ang - 0.42)} ${y - s * Math.sin(ang - 0.42)} L${x - s * Math.cos(ang + 0.42)} ${y - s * Math.sin(ang + 0.42)} Z`} fill={col} />
);
const arrow = (x1, y1, x2, y2, col, w = 2, s = 7) => (
  <g><line x1={x1} y1={y1} x2={x2 - (s * 0.8) * Math.cos(Math.atan2(y2 - y1, x2 - x1))} y2={y2 - (s * 0.8) * Math.sin(Math.atan2(y2 - y1, x2 - x1))} stroke={col} strokeWidth={w} />{arrowHead(x2, y2, Math.atan2(y2 - y1, x2 - x1), s, col)}</g>
);
const arc = (cx, cy, ccw, col, r = 13, w = 2) => {
  const d = ccw ? `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx} ${cy - r}` : `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
  const h = ccw ? `M ${cx - 1} ${cy - r - 4.5} L ${cx - 1} ${cy - r + 4.5} L ${cx - 8} ${cy - r} Z` : `M ${cx + 1} ${cy - r - 4.5} L ${cx + 1} ${cy - r + 4.5} L ${cx + 8} ${cy - r} Z`;
  return <g><path d={d} fill="none" stroke={col} strokeWidth={w} /><path d={h} fill={col} /></g>;
};

function supportGlyph(sp, n, model, SX, SY, k, key) {
  const cx = SX(n.x), cy = SY(n.y), ink = C.ink;
  const attached = model.members.filter(mb => mb.n1 === n.id || mb.n2 === n.id);
  const N = id => model.nodes.find(q => q.id === id);
  const flat = attached.length > 0 && attached.every(mb => Math.abs(N(mb.n1).y - N(mb.n2).y) < 1e-9);
  const hatch = (x1, y1, dx, dy, nTicks, len, ang) => Array.from({ length: nTicks }, (_, i) => {
    const t = nTicks === 1 ? 0.5 : i / (nTicks - 1), x = x1 + dx * t, y = y1 + dy * t;
    return <line key={i} x1={x} y1={y} x2={x + len * Math.cos(ang)} y2={y + len * Math.sin(ang)} stroke={ink} strokeWidth={1.2 * k} />;
  });
  if (sp.type === "fixed") {
    if (flat && attached.length === 1) {
      const other = N(attached[0].n1 === n.id ? attached[0].n2 : attached[0].n1), side = other.x > n.x ? -1 : 1;
      return <g key={key}><line x1={cx} y1={cy - 20 * k} x2={cx} y2={cy + 20 * k} stroke={ink} strokeWidth={3 * k} />{hatch(cx, cy - 18 * k, 0, 36 * k, 6, 9 * k, side < 0 ? Math.PI * 0.75 : Math.PI * 0.25)}</g>;
    }
    return <g key={key}><line x1={cx - 20 * k} y1={cy + 1} x2={cx + 20 * k} y2={cy + 1} stroke={ink} strokeWidth={3 * k} />{hatch(cx - 18 * k, cy + 2, 36 * k, 0, 6, 9 * k, Math.PI * 0.75)}</g>;
  }
  if (sp.type === "pin") return <g key={key}><path d={`M${cx} ${cy + 2} L${cx - 11 * k} ${cy + 18 * k} L${cx + 11 * k} ${cy + 18 * k} Z`} fill="#fff" stroke={ink} strokeWidth={1.8 * k} /><line x1={cx - 16 * k} y1={cy + 18 * k} x2={cx + 16 * k} y2={cy + 18 * k} stroke={ink} strokeWidth={1.8 * k} />{hatch(cx - 14 * k, cy + 18 * k, 28 * k, 0, 5, 6 * k, Math.PI * 0.72)}</g>;
  if (sp.type === "rollerV") return <g key={key}><path d={`M${cx} ${cy + 2} L${cx - 11 * k} ${cy + 15 * k} L${cx + 11 * k} ${cy + 15 * k} Z`} fill="#fff" stroke={ink} strokeWidth={1.8 * k} /><circle cx={cx - 5.5 * k} cy={cy + 19.5 * k} r={3.6 * k} fill="#fff" stroke={ink} strokeWidth={1.5 * k} /><circle cx={cx + 5.5 * k} cy={cy + 19.5 * k} r={3.6 * k} fill="#fff" stroke={ink} strokeWidth={1.5 * k} /><line x1={cx - 16 * k} y1={cy + 24 * k} x2={cx + 16 * k} y2={cy + 24 * k} stroke={ink} strokeWidth={1.8 * k} /></g>;
  if (sp.type === "rollerH") return <g key={key}><path d={`M${cx + 2} ${cy} L${cx + 15 * k} ${cy - 10 * k} L${cx + 15 * k} ${cy + 10 * k} Z`} fill="#fff" stroke={ink} strokeWidth={1.8 * k} /><circle cx={cx + 19.5 * k} cy={cy - 5 * k} r={3.4 * k} fill="#fff" stroke={ink} strokeWidth={1.5 * k} /><circle cx={cx + 19.5 * k} cy={cy + 5 * k} r={3.4 * k} fill="#fff" stroke={ink} strokeWidth={1.5 * k} /><line x1={cx + 24 * k} y1={cy - 14 * k} x2={cx + 24 * k} y2={cy + 14 * k} stroke={ink} strokeWidth={1.8 * k} /></g>;
  if (sp.type === "guided") return <g key={key}>{[-1, 1].map(sd => <line key={sd} x1={cx + sd * 7 * k} y1={cy - 12 * k} x2={cx + sd * 7 * k} y2={cy + 12 * k} stroke={ink} strokeWidth={2.4 * k} />)}<line x1={cx - 16 * k} y1={cy + 12 * k} x2={cx + 16 * k} y2={cy + 12 * k} stroke={ink} strokeWidth={1.6 * k} /></g>;
  if (sp.ky || sp.kx || sp.kr) {
    const zig = Array.from({ length: 6 }, (_, i) => `${cx + (i % 2 ? 7 : -7) * k} ${cy + (6 + i * 4.5) * k}`).join(" ");
    return <g key={key}><polyline points={`${cx} ${cy + 3} ${zig} ${cx} ${cy + 34 * k}`} fill="none" stroke="#0E8A7B" strokeWidth={1.8 * k} /><line x1={cx - 12 * k} y1={cy + 36 * k} x2={cx + 12 * k} y2={cy + 36 * k} stroke="#0E8A7B" strokeWidth={2 * k} /></g>;
  }
  return null;
}

export function SketchLayer({ model, res = null, diagram = null, flip = false, flipMembers = [], W = 760, H = 380, compact = false,
  showLoads = true, showDims = true, showLabels = true, showStructure = true, valueLabels = false, color, grow = 1 }) {
  const { SX, SY, sc, span, isBeam, minY } = frameOf(model, W, H, compact);
  const k = compact ? 0.68 : 1;
  const N = {}; model.nodes.forEach(n => { N[n.id] = n; });
  const mem = model.members.map(mb => {
    const a = N[mb.n1], b = N[mb.n2];
    if (!a || !b) return null;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { ...mb, a, b, L, c: (b.x - a.x) / L, s: (b.y - a.y) / L };
  }).filter(Boolean);
  const out = [];

  // ---- diagram (drawn first so the structure sits on top)
  if (diagram && res && res.stable) {
    if (diagram === "M") {
      const col = color || C.moment;
      let mx = 0; res.members.forEach(mb => mb.samples.forEach(p => { mx = Math.max(mx, Math.abs(p.M)); }));
      const dsc = mx > 1e-9 ? (0.19 * span) / mx : 0;
      res.members.forEach((mb, i) => {
        const sgn = (flip ? -1 : 1) * (flipMembers.includes(mb.id) ? -1 : 1);
        const px = -mb.s, py = mb.c;
        const pts = mb.samples.map(p => { const v = -p.M * sgn * grow; const bx = mb.x1 + mb.c * p.s, by = mb.y1 + mb.s * p.s; return { bx, by, tx: bx + v * dsc * px, ty: by + v * dsc * py, M: p.M, s: p.s }; });
        const poly = `M${SX(pts[0].bx)} ${SY(pts[0].by)} ` + pts.map(p => `L${SX(p.tx)} ${SY(p.ty)}`).join(" ") + ` L${SX(pts[pts.length - 1].bx)} ${SY(pts[pts.length - 1].by)} Z`;
        out.push(<path key={"mf" + i} d={poly} fill={col} opacity={0.17} />);
        out.push(<path key={"ml" + i} d={"M" + pts.map(p => `${SX(p.tx)} ${SY(p.ty)}`).join(" L")} fill="none" stroke={col} strokeWidth={compact ? 1.8 : 2.2} strokeLinejoin="round" />);
        if (valueLabels && mx > 1e-9) {
          let pk = pts[0]; pts.forEach(p => { if (Math.abs(p.M) > Math.abs(pk.M)) pk = p; });
          const marks = [pk, pts[0], pts[pts.length - 1]].filter((p, j, arr) => Math.abs(p.M) > 0.03 * mx && arr.findIndex(q => Math.abs(q.s - p.s) < 0.08 * mb.L) === j);
          marks.forEach((p, j) => {
            const sg = (-p.M * sgn) < 0 ? -1 : 1, ox = sg * px, oy = sg * py;
            out.push(<text key={`mv${i}-${j}`} x={SX(p.tx) + ox * 7} y={SY(p.ty) - oy * 7} fontSize={compact ? 9 : 10.5} fontFamily={MONO} fontWeight="700" fill={col} stroke="#fff" strokeWidth="3" paintOrder="stroke"
              textAnchor={ox > 0.35 ? "start" : ox < -0.35 ? "end" : "middle"} dominantBaseline={oy > 0.35 ? "auto" : oy < -0.35 ? "hanging" : "central"}>{f1(p.M)}</text>);
          });
        }
      });
    } else if (diagram === "D") {
      const col = color || C.defl;
      let mx = 0; res.members.forEach(mb => mb.defl.forEach(d => { mx = Math.max(mx, Math.hypot(d.ux, d.uy)); }));
      const kd = (mx > 1e-12 ? (0.11 * span) / mx : 0) * (flip ? -1 : 1) * grow;
      res.members.forEach((mb, i) => out.push(<path key={"d" + i} d={"M" + mb.defl.map(d => `${SX(d.x + d.ux * kd)} ${SY(d.y + d.uy * kd)}`).join(" L")} fill="none" stroke={col} strokeWidth={compact ? 2.2 : 2.6} strokeLinejoin="round" strokeLinecap="round" />));
    }
  }

  if (showStructure) {
    // ---- members
    mem.forEach(mb => out.push(<line key={"m" + mb.id} x1={SX(mb.a.x)} y1={SY(mb.a.y)} x2={SX(mb.b.x)} y2={SY(mb.b.y)} stroke={C.ink}
      strokeWidth={diagram === "D" ? 1.4 : compact ? 2.4 : 3.4} strokeDasharray={diagram === "D" ? "4 3" : undefined} strokeLinecap="round" opacity={diagram === "D" ? 0.55 : 1} />));
    // ---- hinges: internal ones and member-end releases
    (model.hinges || []).forEach((h, i) => {
      const mb = mem.find(q => q.id === h.member); if (!mb) return;
      out.push(<circle key={"h" + i} cx={SX(mb.a.x + (mb.b.x - mb.a.x) * h.t)} cy={SY(mb.a.y + (mb.b.y - mb.a.y) * h.t)} r={5 * k + 0.5} fill="#fff" stroke={C.hinge} strokeWidth={2.2 * k} />);
    });
    mem.forEach(mb => {
      const off = Math.min(0.34, mb.L * 0.18);
      if (mb.rel1) out.push(<circle key={"r1" + mb.id} cx={SX(mb.a.x + mb.c * off)} cy={SY(mb.a.y + mb.s * off)} r={4.5 * k + 0.5} fill="#fff" stroke={C.hinge} strokeWidth={2 * k} />);
      if (mb.rel2) out.push(<circle key={"r2" + mb.id} cx={SX(mb.b.x - mb.c * off)} cy={SY(mb.b.y - mb.s * off)} r={4.5 * k + 0.5} fill="#fff" stroke={C.hinge} strokeWidth={2 * k} />);
    });
    // ---- supports
    (model.supports || []).forEach((sp, i) => { const n = N[sp.node]; if (n) out.push(supportGlyph(sp, n, model, SX, SY, k, "s" + i)); });
    // ---- node labels
    if (showLabels) model.nodes.forEach(n => {
      const sup = (model.supports || []).some(s => s.node === n.id);
      out.push(<text key={"n" + n.id} x={SX(n.x) + (compact ? -7 : -10)} y={SY(n.y) + (isBeam ? (sup ? (compact ? -8 : -10) : (compact ? 13 : 18)) : -8)} fontSize={compact ? 9 : 11.5} fontFamily={MONO} fontWeight="700" fill={C.soft} stroke="#fff" strokeWidth="3" paintOrder="stroke" textAnchor="middle">{n.id}</text>);
    });
  }

  // ---- loads
  if (showLoads && showStructure) {
    const Lp = 36 * k, col = C.load;
    const along = (nid, vx, vy) => mem.some(mb => {
      const from = mb.n1 === nid ? mb.a : mb.n2 === nid ? mb.b : null, to = mb.n1 === nid ? mb.b : mb.a;
      return !!from && ((to.x - from.x) * vx + (to.y - from.y) * vy) / mb.L > 0.94;
    });
    (model.loads || []).forEach((l, i) => {
      if (l.type === "node") {
        const n = N[l.node]; if (!n) return;
        const cx = SX(n.x), cy = SY(n.y);
        // pushes in from outside; if a member leaves the node on that side, it pulls out the other way
        if (Math.abs(l.Fy || 0) > 1e-9) {
          const d = l.Fy < 0 ? 1 : -1, pull = along(l.node, 0, d);
          const y1 = pull ? cy + d * 6 : cy - d * (Lp + 8), y2 = pull ? cy + d * (Lp + 8) : cy - d * 6;
          out.push(<g key={"fy" + i}>{arrow(cx, y1, cx, y2, col, 2)}<text x={cx + 6} y={pull ? y2 - d * 4 + (d > 0 ? 0 : 8) : y1 - d * 4 + (d < 0 ? 8 : 0)} fontSize={10.5 * k} fontFamily={MONO} fontWeight="600" fill={col} stroke="#fff" strokeWidth="3" paintOrder="stroke">{f1(l.Fy)} kN</text></g>);
        }
        if (Math.abs(l.Fx || 0) > 1e-9) {
          const d = l.Fx > 0 ? 1 : -1, pull = along(l.node, -d, 0);
          const x1 = pull ? cx + d * 6 : cx - d * (Lp + 8), x2 = pull ? cx + d * (Lp + 8) : cx - d * 6;
          // the value sits at the arrow's outer end, clear of the node letter
          const ex = pull ? x2 + d * 5 : x1 - d * 5, anchor = (pull ? d > 0 : d < 0) ? "start" : "end";
          out.push(<g key={"fx" + i}>{arrow(x1, cy, x2, cy, col, 2)}<text x={ex} y={cy + 3.5 * k} fontSize={10.5 * k} fontFamily={MONO} fontWeight="600" fill={col} textAnchor={anchor} stroke="#fff" strokeWidth="3" paintOrder="stroke">{f1(l.Fx)} kN</text></g>);
        }
        if (Math.abs(l.M || 0) > 1e-9) out.push(<g key={"fm" + i}>{arc(cx, cy, l.M > 0, col, 14 * k)}<text x={cx} y={cy + 28 * k} fontSize={10 * k} fontFamily={MONO} fontWeight="600" fill={col} textAnchor="middle">{f1(l.M)} kN·m</text></g>);
      } else if (l.type === "udl") {
        const mb = mem.find(q => q.id === l.member); if (!mb) return;
        const ta = l.t1 == null ? 0 : l.t1, tb = l.t2 == null ? 1 : l.t2;
        if (tb - ta < 1e-9) return;
        const wa = l.w || 0, wb = (l.w2 == null ? l.w : l.w2) || 0, wm = Math.max(Math.abs(wa), Math.abs(wb)) || 1;
        // arrows point the way the load acts, so they start on the opposite side
        const dirv = l.dir === "grav" ? { x: 0, y: -1 } : { x: -mb.s, y: mb.c };
        const sgn = (wa + wb) >= 0 ? 1 : -1, from = { x: -dirv.x * sgn, y: -dirv.y * sgn };
        const hAt = t => (12 + 16 * Math.abs(wa + (wb - wa) * ((t - ta) / (tb - ta))) / wm) * k;
        const cnt = Math.max(3, Math.round((tb - ta) * mb.L * sc / 26));
        const tips = [];
        for (let j = 0; j <= cnt; j++) {
          const t = ta + (tb - ta) * j / cnt, bx = SX(mb.a.x + (mb.b.x - mb.a.x) * t), by = SY(mb.a.y + (mb.b.y - mb.a.y) * t), h = hAt(t);
          const sx = bx + from.x * h, sy = by - from.y * h;
          tips.push([sx, sy]);
          out.push(<g key={`u${i}-${j}`}>{arrow(sx, sy, bx - from.x * 3, by + from.y * 3, col, 1.2, 5 * k)}</g>);
        }
        out.push(<polyline key={"ul" + i} points={tips.map(p => p.join(" ")).join(" ")} fill="none" stroke={col} strokeWidth={1.5} />);
        const mid = tips[Math.floor(tips.length / 2)];
        out.push(<text key={"ut" + i} x={mid[0] + from.x * 10} y={mid[1] - from.y * 10 - (Math.abs(from.y) > 0.5 ? 2 : 0)} fontSize={10 * k} fontFamily={MONO} fontWeight="600" fill={col} textAnchor="middle">{Math.abs(wa - wb) < 1e-9 ? `${f1(wa)} kN/m` : `${f1(wa)}→${f1(wb)} kN/m`}</text>);
      } else if (l.type === "mpoint") {
        const mb = mem.find(q => q.id === l.member); if (!mb) return;
        const t = l.t == null ? 0.5 : l.t, cx = SX(mb.a.x + (mb.b.x - mb.a.x) * t), cy = SY(mb.a.y + (mb.b.y - mb.a.y) * t);
        const mag = Math.hypot(l.Fx || 0, l.Fy || 0);
        if (mag > 1e-9) {
          const ux = (l.Fx || 0) / mag, uy = (l.Fy || 0) / mag;
          // acting along the member: draw it alongside with a short bracket, or it hides in the member line
          const ax = Math.abs(ux * mb.c + uy * mb.s) > 0.94, ox = ax ? -mb.s * 13 * k : 0, oy = ax ? -mb.c * 13 * k : 0;
          const hx = ax ? cx + ox : cx - ux * 6, hy = ax ? cy + oy : cy + uy * 6, tx = cx - ux * (Lp + 8) + ox, ty = cy + uy * (Lp + 8) + oy;
          out.push(<g key={"p" + i}>{arrow(tx, ty, hx, hy, col, 2)}{ax && <line x1={hx} y1={hy} x2={cx} y2={cy} stroke={col} strokeWidth={1.4} />}<text x={tx + (ax && ox < 0 ? -6 : 6)} y={ty - 3} fontSize={10.5 * k} fontFamily={MONO} fontWeight="600" fill={col} textAnchor={ax && ox < 0 ? "end" : "start"} stroke="#fff" strokeWidth="3" paintOrder="stroke">{f1(mag)} kN</text></g>);
        }
        if (Math.abs(l.M || 0) > 1e-9) out.push(<g key={"pm" + i}>{arc(cx, cy, l.M > 0, col, 14 * k)}<text x={cx} y={cy + 28 * k} fontSize={10 * k} fontFamily={MONO} fontWeight="600" fill={col} textAnchor="middle">{f1(l.M)} kN·m</text></g>);
      }
    });
  }

  // ---- dimensions
  if (showDims && showStructure && !compact) {
    const xs = [...new Set(model.nodes.map(n => +n.x.toFixed(4)))].sort((a, b) => a - b);
    const yDim = SY(minY) + (isBeam ? 50 : 40);
    out.push(<line key="dx" x1={SX(xs[0])} y1={yDim} x2={SX(xs[xs.length - 1])} y2={yDim} stroke={C.soft} strokeWidth="1" />);
    xs.forEach((x, i) => {
      out.push(<line key={"dxt" + i} x1={SX(x)} y1={yDim - 5} x2={SX(x)} y2={yDim + 5} stroke={C.soft} strokeWidth="1.2" />);
      if (i > 0) out.push(<text key={"dxl" + i} x={(SX(x) + SX(xs[i - 1])) / 2} y={yDim + 15} fontSize="10.5" fontFamily={MONO} fill={C.soft} textAnchor="middle">{f1(x - xs[i - 1])} m</text>);
    });
    if (!isBeam) {
      const ys = [...new Set(model.nodes.map(n => +n.y.toFixed(4)))].sort((a, b) => a - b);
      const xDim = SX(Math.min(...model.nodes.map(n => n.x))) - 36;
      out.push(<line key="dy" x1={xDim} y1={SY(ys[0])} x2={xDim} y2={SY(ys[ys.length - 1])} stroke={C.soft} strokeWidth="1" />);
      ys.forEach((y, i) => {
        out.push(<line key={"dyt" + i} x1={xDim - 5} y1={SY(y)} x2={xDim + 5} y2={SY(y)} stroke={C.soft} strokeWidth="1.2" />);
        if (i > 0) out.push(<text key={"dyl" + i} x={xDim - 7} y={(SY(y) + SY(ys[i - 1])) / 2 + 3} fontSize="10.5" fontFamily={MONO} fill={C.soft} textAnchor="end">{f1(y - ys[i - 1])} m</text>);
      });
    }
  }
  return <g>{out}</g>;
}

export default function ModelSketch({ W = 760, H = 380, style, ...rest }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", ...style }}>
      <SketchLayer W={W} H={H} {...rest} />
    </svg>
  );
}
