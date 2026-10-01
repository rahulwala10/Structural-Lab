/**
 * Practice questions in the spirit of the IStructE Structural Behaviour exam:
 * sketch the bending moment diagram and the deflected shape, and find (or
 * reason out) the reactions — for beams and plane frames.
 *
 * The questions are original. Each comes from a parametric template driven by
 * a seeded RNG, so a question number always rebuilds the same problem, and
 * every answer comes from the verified frame solver. Wrong multiple-choice
 * options are the correct solution of a deliberately mistaken model (fixity
 * ignored, hinge ignored, continuity ignored, sway ignored…), so each one
 * looks like a mistake a candidate could really make.
 */
import { analyzeFrame } from './frame.mjs';

/* ---------------- seeded randomness ---------------- */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    shuffle: arr => { const b = [...arr]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; },
  };
}

const NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const EI = 2e4, EA = 2e6;
// a model may carry its own default EI / EA (the frame lab passes its settings); otherwise the practice values
export const solve = model => analyzeFrame({ EI, EA, ...model, sub: 10 });
const fm = (v, dp = 1) => { const s = (+v).toFixed(dp); return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"); };

/* ---------------- model builders ---------------- */

/**
 * A horizontal beam as a frame model: nodes (A, B, C… left → right) at every
 * key x, members between them, point loads and couples applied at nodes,
 * UDLs spread over whichever members they cover, hinges inside members.
 */
export function beamModel({ xs, supports = [], udls = [], points = [], couples = [], hinges = [] }) {
  const keys = [...new Set(xs.map(v => +(+v).toFixed(6)))].sort((a, b) => a - b);
  const nodes = keys.map((x, i) => ({ id: NAMES[i], x, y: 0 }));
  const nodeAt = x => nodes.find(n => Math.abs(n.x - x) < 1e-6);
  const members = [];
  for (let i = 0; i < nodes.length - 1; i++) members.push({ id: nodes[i].id + nodes[i + 1].id, n1: nodes[i].id, n2: nodes[i + 1].id });
  const rank = { fixed: 3, pin: 2, rollerV: 1 };
  const sup = [];
  supports.forEach(s => {
    const n = nodeAt(s.x); if (!n) return;
    const type = s.type === "roller" ? "rollerV" : s.type;
    const cur = sup.find(q => q.node === n.id);
    if (!cur) sup.push({ node: n.id, type });
    else if ((rank[type] || 0) > (rank[cur.type] || 0)) cur.type = type;
  });
  let k = 0;
  const lid = () => "L" + (++k);
  const loads = [];
  points.forEach(p => { const n = nodeAt(p.x); if (n && Math.abs(p.P) > 1e-9) loads.push({ id: lid(), type: "node", node: n.id, Fx: 0, Fy: -p.P, M: 0 }); });
  couples.forEach(c => { const n = nodeAt(c.x); if (n && Math.abs(c.M) > 1e-9) loads.push({ id: lid(), type: "node", node: n.id, Fx: 0, Fy: 0, M: c.M }); });
  udls.forEach(u => {
    const x1 = Math.min(u.x1, u.x2), x2 = Math.max(u.x1, u.x2), w1 = u.w1, w2 = u.w2 == null ? u.w1 : u.w2;
    if (x2 - x1 < 1e-9) return;
    const wAt = x => w1 + (w2 - w1) * (x - x1) / (x2 - x1);
    members.forEach(mb => {
      const a = nodes.find(n => n.id === mb.n1).x, b = nodes.find(n => n.id === mb.n2).x;
      const lo = Math.max(a, x1), hi = Math.min(b, x2);
      if (hi - lo < 1e-9) return;
      loads.push({ id: lid(), type: "udl", member: mb.id, w: +wAt(lo).toFixed(6), w2: +wAt(hi).toFixed(6), t1: +((lo - a) / (b - a)).toFixed(6), t2: +((hi - a) / (b - a)).toFixed(6), dir: "grav" });
    });
  });
  const hg = [];
  hinges.forEach((x, i) => {
    const n = nodeAt(x);
    if (n) { // hinge at a node: release the member arriving there (or leaving, at the left end)
      const into = members.find(m => m.n2 === n.id), out = members.find(m => m.n1 === n.id);
      if (into && out) into.rel2 = true; else if (out) out.rel1 = true; else if (into) into.rel2 = true;
      return;
    }
    const mb = members.find(m => { const a = nodes.find(q => q.id === m.n1).x, b = nodes.find(q => q.id === m.n2).x; return x > a + 1e-6 && x < b - 1e-6; });
    if (!mb) return;
    const a = nodes.find(q => q.id === mb.n1).x, b = nodes.find(q => q.id === mb.n2).x;
    hg.push({ id: "H" + (i + 1), member: mb.id, t: +((x - a) / (b - a)).toFixed(6) });
  });
  return { nodes, members, supports: sup, loads, hinges: hg };
}

/** Convert a Beam-tab configuration into the frame format used by practice. */
export function beamToFrame({ L, supports = [], hinges = [], loads = [] }) {
  const xs = [0, L];
  supports.forEach(s => xs.push(Math.min(Math.max(s.x, 0), L)));
  const acts = loads.filter(l => (l.type === "point" && Math.abs(l.P) > 1e-9) || (l.type === "moment" && Math.abs(l.M) > 1e-9));
  acts.forEach(l => xs.push(Math.min(Math.max(l.x, 0), L)));
  let sup = supports.map(s => ({ x: Math.min(Math.max(s.x, 0), L), type: s.type }));
  // the frame solver needs a horizontal restraint; a beam has no horizontal load, so this changes nothing
  if (sup.length && !sup.some(s => s.type === "pin" || s.type === "fixed")) sup = sup.map((s, i) => (i === 0 ? { ...s, type: "pin" } : s));
  return beamModel({
    xs, supports: sup,
    points: acts.filter(l => l.type === "point").map(l => ({ x: Math.min(Math.max(l.x, 0), L), P: l.P })),
    couples: acts.filter(l => l.type === "moment").map(l => ({ x: Math.min(Math.max(l.x, 0), L), M: l.M })),
    udls: loads.filter(l => l.type === "udl" && l.x2 - l.x1 > 1e-9).map(l => ({ x1: Math.max(0, l.x1), x2: Math.min(L, l.x2), w1: l.w1, w2: l.w2 })),
    hinges: hinges.map(h => (h && typeof h === "object" ? h.x : h)).filter(x => x > 1e-6 && x < L - 1e-6),
  });
}

/** Inverse of beamModel: a horizontal frame-format beam back to a Beam-tab configuration. */
export function frameToBeam(model) {
  const N = {}; model.nodes.forEach(n => { N[n.id] = n; });
  const x0 = Math.min(...model.nodes.map(n => n.x)), L = Math.max(...model.nodes.map(n => n.x)) - x0;
  const X = id => N[id].x - x0;
  const mb = id => model.members.find(m => m.id === id);
  const at = (m, t) => X(m.n1) + (X(m.n2) - X(m.n1)) * t;
  const supports = (model.supports || []).map(s => ({ x: X(s.node), type: s.type === "rollerV" ? "roller" : s.type === "fixed" ? "fixed" : "pin" }));
  const loads = [];
  (model.loads || []).forEach(l => {
    if (l.type === "node") {
      if (Math.abs(l.Fy || 0) > 1e-9) loads.push({ type: "point", x: X(l.node), P: -l.Fy });
      if (Math.abs(l.M || 0) > 1e-9) loads.push({ type: "moment", x: X(l.node), M: l.M });
    } else if (l.type === "mpoint" && mb(l.member)) {
      const x = at(mb(l.member), l.t == null ? 0.5 : l.t);
      if (Math.abs(l.Fy || 0) > 1e-9) loads.push({ type: "point", x, P: -l.Fy });
      if (Math.abs(l.M || 0) > 1e-9) loads.push({ type: "moment", x, M: l.M });
    } else if (l.type === "udl" && mb(l.member)) {
      const m = mb(l.member), ta = l.t1 == null ? 0 : l.t1, tb = l.t2 == null ? 1 : l.t2;
      const xa = at(m, ta), xb = at(m, tb), wa = l.w || 0, wb = l.w2 == null ? wa : l.w2;
      loads.push(xa <= xb ? { type: "udl", x1: xa, x2: xb, w1: wa, w2: wb } : { type: "udl", x1: xb, x2: xa, w1: wb, w2: wa });
    }
  });
  const hinges = [];
  (model.hinges || []).forEach(h => { const m = mb(h.member); if (m) hinges.push({ x: at(m, h.t) }); });
  model.members.forEach(m => { if (m.rel1) hinges.push({ x: X(m.n1) }); if (m.rel2) hinges.push({ x: X(m.n2) }); });
  return { L, supports, hinges, loads };
}

const frameModel = (nodes, members, supports, loads, hinges = []) => ({
  nodes, members, supports, hinges,
  loads: loads.map((l, i) => ({ id: "L" + (i + 1), Fx: 0, Fy: 0, M: 0, ...l })),
});

/* ---------------- question templates (original) ---------------- */

const W = [5, 6, 8, 10, 12, 15];
// textbook cases whose indeterminate answers are standard results (wL²/8, 5wL/8, PL/8 …)
const std = m => ({ ...m, meta: { standard: true } });
const P = [10, 12, 15, 20, 24, 30];
const HL = [8, 10, 12, 15, 20];

export const TEMPLATES = [
  { key: "ss-overhang", family: "beam", title: "Beam with an overhang", make: r => {
    const a = r.pick([4, 5, 6]), c = r.pick([1.5, 2]), L = a + c, v = r.int(0, 2);
    const sup = [{ x: 0, type: "pin" }, { x: a, type: "roller" }];
    if (v === 0) return beamModel({ xs: [0, a, L], supports: sup, udls: [{ x1: 0, x2: L, w1: r.pick(W) }] });
    if (v === 1) return beamModel({ xs: [0, a, L], supports: sup, udls: [{ x1: 0, x2: a, w1: r.pick(W) }], points: [{ x: L, P: r.pick(P) }] });
    return beamModel({ xs: [0, a / 2, a, L], supports: sup, points: [{ x: a / 2, P: r.pick(P) }, { x: L, P: r.pick(P) }] });
  } },
  { key: "double-overhang", family: "beam", title: "Beam overhanging both supports", make: r => {
    const c1 = r.pick([1, 1.5, 2]), s = r.pick([4, 5, 6]), c2 = r.pick([1, 1.5, 2]), L = c1 + s + c2;
    const sup = [{ x: c1, type: "pin" }, { x: c1 + s, type: "roller" }];
    if (r.chance(0.5)) return beamModel({ xs: [0, c1, c1 + s, L], supports: sup, udls: [{ x1: 0, x2: L, w1: r.pick(W) }] });
    const p = r.pick(P);
    return beamModel({ xs: [0, c1, c1 + s, L], supports: sup, points: [{ x: 0, P: p }, { x: L, P: p }] });
  } },
  { key: "cantilever", family: "beam", title: "Cantilever", make: r => {
    const L = r.pick([3, 4, 5, 6]), right = r.chance(0.3), v = r.int(0, 2);
    const fx = right ? L : 0, tip = right ? 0 : L, mid = L / 2;
    const sup = [{ x: fx, type: "fixed" }];
    if (v === 0) return beamModel({ xs: [0, L], supports: sup, points: [{ x: tip, P: r.pick(P) }], udls: [{ x1: 0, x2: L, w1: r.pick(W) }] });
    if (v === 1) return beamModel({ xs: [0, mid, L], supports: sup, points: [{ x: mid, P: r.pick(P) }, { x: tip, P: -r.pick([5, 8, 10]) }] });
    return beamModel({ xs: [0, mid, L], supports: sup, udls: [right ? { x1: 0, x2: mid, w1: r.pick(W) } : { x1: mid, x2: L, w1: r.pick(W) }] });
  } },
  { key: "ss-couple", family: "beam", title: "Simply supported beam with a couple", make: r => {
    const L = r.pick([6, 8, 9]), a = r.pick([L / 3, L / 2]), C = r.pick([20, 30, 40]) * (r.chance(0.5) ? 1 : -1);
    const extra = r.chance(0.5) ? [{ x1: 0, x2: L, w1: r.pick([4, 5, 6]) }] : [];
    return beamModel({ xs: [0, a, L], supports: [{ x: 0, type: "pin" }, { x: L, type: "roller" }], couples: [{ x: a, M: C }], udls: extra });
  } },
  { key: "gerber", family: "beam", title: "Beam with an internal hinge", make: r => {
    if (r.chance(0.5)) {
      const L = r.pick([8, 10, 12]), h = r.pick([0.3, 0.4, 0.6]) * L; // not L/4: a propped cantilever's M is already 0 there
      return beamModel({ xs: [0, L], supports: [{ x: 0, type: "fixed" }, { x: L, type: "roller" }], hinges: [h], udls: [{ x1: 0, x2: L, w1: r.pick(W) }] });
    }
    const l1 = r.pick([5, 6]), l2 = r.pick([5, 6]), hx = l1 + r.pick([1, 1.5]);
    return beamModel({ xs: [0, l1, l1 + l2], supports: [{ x: 0, type: "pin" }, { x: l1, type: "roller" }, { x: l1 + l2, type: "roller" }], hinges: [hx], udls: [{ x1: 0, x2: l1 + l2, w1: r.pick(W) }] });
  } },
  { key: "propped", family: "beam", title: "Propped cantilever", make: r => {
    const L = r.pick([5, 6, 8]), rightFixed = r.chance(0.35);
    const sup = rightFixed ? [{ x: 0, type: "roller" }, { x: L, type: "fixed" }] : [{ x: 0, type: "fixed" }, { x: L, type: "roller" }];
    if (r.chance(0.55)) return std(beamModel({ xs: [0, L], supports: sup, udls: [{ x1: 0, x2: L, w1: r.pick(W) }] }));
    return std(beamModel({ xs: [0, L / 2, L], supports: sup, points: [{ x: L / 2, P: r.pick(P) }] }));
  } },
  { key: "fixed-fixed", family: "beam", title: "Fixed-ended beam", make: r => {
    const L = r.pick([4, 6, 8]), v = r.int(0, 2), sup = [{ x: 0, type: "fixed" }, { x: L, type: "fixed" }];
    if (v === 0) return std(beamModel({ xs: [0, L], supports: sup, udls: [{ x1: 0, x2: L, w1: r.pick(W) }] }));
    if (v === 1) return std(beamModel({ xs: [0, L / 2, L], supports: sup, points: [{ x: L / 2, P: r.pick(P) }] }));
    return beamModel({ xs: [0, L / 4, L], supports: sup, points: [{ x: L / 4, P: r.pick(P) }] });
  } },
  { key: "two-span", family: "beam", title: "Two-span continuous beam", make: r => {
    const l1 = r.pick([4, 5, 6]), l2 = r.pick([4, 5, 6]), L = l1 + l2, w = r.pick(W);
    const sup = [{ x: 0, type: "pin" }, { x: l1, type: "roller" }, { x: L, type: "roller" }], v = r.int(0, 2);
    if (v === 0) { const m = beamModel({ xs: [0, l1, L], supports: sup, udls: [{ x1: 0, x2: L, w1: w }] }); return l1 === l2 ? std(m) : m; }
    if (v === 1) return beamModel({ xs: [0, l1, L], supports: sup, udls: [{ x1: 0, x2: l1, w1: w }] });
    return beamModel({ xs: [0, l1 / 2, l1, l1 + l2 / 2, L], supports: sup, points: [{ x: l1 / 2, P: r.pick(P) }, { x: l1 + l2 / 2, P: r.pick(P) }] });
  } },

  { key: "portal-fixed-sway", family: "frame", title: "Fixed-base portal under sideways load", make: r => {
    const b = r.pick([5, 6, 8]), h = r.pick([3, 4, 5]);
    const loads = [{ type: "node", node: "B", Fx: r.pick(HL) }];
    if (r.chance(0.5)) loads.push({ type: "udl", member: "BC", w: r.pick(W), dir: "grav" });
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b, y: h }, { id: "D", x: b, y: 0 }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }, { id: "CD", n1: "C", n2: "D" }],
      [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }], loads);
  } },
  { key: "portal-pinned", family: "frame", title: "Pinned-base portal", make: r => {
    const b = r.pick([5, 6, 8]), h = r.pick([3, 4, 5]);
    const loads = [{ type: "udl", member: "BC", w: r.pick(W), dir: "grav" }];
    if (r.chance(0.4)) loads.push({ type: "node", node: "B", Fx: r.pick(HL) });
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b, y: h }, { id: "D", x: b, y: 0 }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }, { id: "CD", n1: "C", n2: "D" }],
      [{ node: "A", type: "pin" }, { node: "D", type: "pin" }], loads);
  } },
  { key: "three-pinned", family: "frame", title: "Three-pinned portal", make: r => {
    const b = r.pick([6, 8]), h = r.pick([3, 4]);
    const loads = r.chance(0.6) ? [{ type: "udl", member: "BC", w: r.pick(W), dir: "grav" }] : [{ type: "node", node: "B", Fx: r.pick(HL) }];
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b, y: h }, { id: "D", x: b, y: 0 }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }, { id: "CD", n1: "C", n2: "D" }],
      [{ node: "A", type: "pin" }, { node: "D", type: "pin" }], loads, [{ id: "H1", member: "BC", t: 0.5 }]);
  } },
  { key: "knee", family: "frame", title: "Cantilevered L-frame", make: r => {
    const h = r.pick([3, 4]), b = r.pick([2, 3, 4]), v = r.int(0, 2);
    const loads = v === 0 ? [{ type: "node", node: "C", Fy: -r.pick(P) }]
      : v === 1 ? [{ type: "node", node: "B", Fx: r.pick(HL) }, { type: "node", node: "C", Fy: -r.pick(P) }]
        : [{ type: "udl", member: "BC", w: r.pick(W), dir: "grav" }];
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b, y: h }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }], [{ node: "A", type: "fixed" }], loads);
  } },
  { key: "portal-mixed", family: "frame", title: "Portal with one fixed and one pinned foot", make: r => {
    const b = r.pick([5, 6]), h = r.pick([3, 4]);
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b, y: h }, { id: "D", x: b, y: 0 }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }, { id: "CD", n1: "C", n2: "D" }],
      [{ node: "A", type: "fixed" }, { node: "D", type: "pin" }], [{ type: "node", node: "B", Fx: r.pick(HL) }]);
  } },
  { key: "portal-link-beam", family: "frame", title: "Portal with a pin-ended beam", make: r => {
    const b = r.pick([5, 6, 8]), h = r.pick([3, 4]);
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b, y: h }, { id: "D", x: b, y: 0 }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C", rel1: true, rel2: true }, { id: "CD", n1: "C", n2: "D" }],
      [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }], [{ type: "node", node: "B", Fx: r.pick(HL) }]);
  } },
  { key: "portal-asym-gravity", family: "frame", title: "Fixed-base portal, off-centre load", make: r => {
    const b = r.pick([6, 8]), h = r.pick([3, 4]), a = b / r.pick([3, 4]);
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b, y: h }, { id: "D", x: b, y: 0 }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }, { id: "CD", n1: "C", n2: "D" }],
      [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }], [{ type: "mpoint", member: "BC", t: +(a / b).toFixed(6), Fx: 0, Fy: -r.pick(P) }]);
  } },
  { key: "gable", family: "frame", title: "Pitched portal", make: r => {
    const b = r.pick([8, 10]), h = r.pick([3, 4]), rise = r.pick([1.5, 2]);
    return frameModel([{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: h }, { id: "C", x: b / 2, y: h + rise }, { id: "D", x: b, y: h }, { id: "E", x: b, y: 0 }],
      [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }, { id: "CD", n1: "C", n2: "D" }, { id: "DE", n1: "D", n2: "E" }],
      [{ node: "A", type: "pin" }, { node: "E", type: "pin" }],
      [{ type: "udl", member: "BC", w: r.pick([4, 5, 6]), dir: "grav" }, { type: "udl", member: "CD", w: r.pick([4, 5, 6]), dir: "grav" }]);
  } },
];

/* ---------------- describing a model in words ---------------- */

const SUP_WORD = { fixed: "fixed", pin: "pinned", rollerV: "on a roller", rollerH: "on a vertical roller", guided: "guided", none: "on a spring" };

export function describe(model) {
  const N = {}; model.nodes.forEach(n => { N[n.id] = n; });
  const isBeam = model.nodes.every(n => Math.abs(n.y) < 1e-9);
  const len = mb => Math.hypot(N[mb.n2].x - N[mb.n1].x, N[mb.n2].y - N[mb.n1].y);
  const dims = model.members.map(mb => `${mb.n1}${mb.n2} = ${fm(len(mb), 2)} m`).join(", ");
  const groups = {};
  model.supports.forEach(s => { (groups[s.type] = groups[s.type] || []).push(s.node); });
  const list = a => a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const supTxt = list(Object.keys(groups).map(t => `${SUP_WORD[t] || t} at ${list(groups[t])}`));
  const extra = [];
  (model.hinges || []).forEach(h => {
    const mb = model.members.find(m => m.id === h.member); if (!mb) return;
    extra.push(`an internal hinge ${fm(h.t * len(mb), 2)} m from ${mb.n1} along ${mb.n1}${mb.n2}`);
  });
  model.members.forEach(mb => {
    if (mb.rel1 && mb.rel2) extra.push(`${mb.n1}${mb.n2} pin-connected at both ends`);
    else if (mb.rel1) extra.push(`${mb.n1}${mb.n2} pin-connected at ${mb.n1}`);
    else if (mb.rel2) extra.push(`${mb.n1}${mb.n2} pin-connected at ${mb.n2}`);
  });
  model.supports.forEach(s => {
    if (Math.abs(s.dy || 0) > 1e-9) extra.push(`support ${s.node} settling ${fm(Math.abs(s.dy) * 1000, 0)} mm ${s.dy < 0 ? "downward" : "upward"}`);
    if (Math.abs(s.dx || 0) > 1e-9) extra.push(`support ${s.node} moving ${fm(Math.abs(s.dx) * 1000, 0)} mm to the ${s.dx > 0 ? "right" : "left"}`);
  });
  const ld = [];
  const udlByVal = {};
  model.loads.filter(l => l.type === "udl").forEach(l => {
    const mb = model.members.find(m => m.id === l.member); if (!mb) return;
    const wa = l.w || 0, wb = l.w2 == null ? wa : l.w2, ta = l.t1 == null ? 0 : l.t1, tb = l.t2 == null ? 1 : l.t2;
    const full = ta < 1e-6 && tb > 1 - 1e-6;
    if (Math.abs(wa - wb) < 1e-9 && full) { (udlByVal[wa] = udlByVal[wa] || []).push(mb.n1 + mb.n2); return; }
    const L = len(mb);
    ld.push(`${Math.abs(wa - wb) < 1e-9 ? `a UDL of ${fm(wa)} kN/m` : `a load varying from ${fm(wa)} to ${fm(wb)} kN/m`} over ${fm((tb - ta) * L, 2)} m of ${mb.n1}${mb.n2}${ta > 1e-6 ? `, starting ${fm(ta * L, 2)} m from ${mb.n1}` : ` from ${mb.n1}`}`);
  });
  Object.keys(udlByVal).forEach(w => {
    const ms = udlByVal[w];
    const all = isBeam && ms.length === model.members.length;
    ld.unshift(`a UDL of ${fm(+w)} kN/m ${all ? "along its whole length" : `on ${list(ms)}`}`);
  });
  model.loads.filter(l => l.type === "node" || l.type === "mpoint").forEach(l => {
    const where = l.type === "node" ? `at ${l.node}` : (() => { const mb = model.members.find(m => m.id === l.member); return mb ? `${fm((l.t == null ? .5 : l.t) * len(mb), 2)} m from ${mb.n1} along ${mb.n1}${mb.n2}` : ""; })();
    if (Math.abs(l.Fy || 0) > 1e-9) ld.push(`${l.Fy < 0 ? "a downward" : "an upward"} point load of ${fm(Math.abs(l.Fy))} kN ${where}`);
    if (Math.abs(l.Fx || 0) > 1e-9) ld.push(`a horizontal load of ${fm(Math.abs(l.Fx))} kN ${where}, acting to the ${l.Fx > 0 ? "right" : "left"}`);
    if (Math.abs(l.M || 0) > 1e-9) ld.push(`${l.M > 0 ? "an anticlockwise" : "a clockwise"} couple of ${fm(Math.abs(l.M))} kN·m ${where}`);
  });
  const name = isBeam ? `Beam ${model.nodes.map(n => n.id).join("")}` : `Frame ${model.nodes.map(n => n.id).join("")}`;
  return {
    isBeam, name,
    text: `${name} (${dims}) is ${supTxt || "unsupported"}${extra.length ? `, with ${list(extra)}` : ""}. ${ld.length ? `It carries ${list(ld)}.` : "It is unloaded."}`,
  };
}

/* ---------------- diagram signatures (for telling sketches apart) ---------------- */

const FRACS = Array.from({ length: 11 }, (_, i) => i / 10);
function interp(samples, key, s) {
  if (s <= samples[0].s) return samples[0][key];
  for (let i = 1; i < samples.length; i++) {
    if (s <= samples[i].s + 1e-12) {
      const a = samples[i - 1], b = samples[i], d = b.s - a.s;
      return d < 1e-12 ? b[key] : a[key] + (b[key] - a[key]) * (s - a.s) / d;
    }
  }
  return samples[samples.length - 1][key];
}

const normed = a => { const mx = Math.max(1e-12, ...a.map(Math.abs)); return a.map(v => v / mx); };
export function signature(res, kind) {
  if (kind === "M") return normed(res.members.flatMap(mb => FRACS.map(f => interp(mb.samples, "M", f * mb.L))));
  // deflected shape: where it goes, plus how it slopes (a fixed end's zero slope vs a pin's rotation)
  const disp = [], slope = [];
  res.members.forEach(mb => {
    const pts = mb.defl.map(d => ({ s: (d.x - mb.x1) * mb.c + (d.y - mb.y1) * mb.s, ux: d.ux, uy: d.uy }));
    const v = FRACS.map(f => { const ux = interp(pts, "ux", f * mb.L), uy = interp(pts, "uy", f * mb.L); disp.push(ux, uy); return -mb.s * ux + mb.c * uy; });
    for (let k = 1; k < v.length; k++) slope.push(v[k] - v[k - 1]);
  });
  return [...normed(disp), ...normed(slope)];
}
export const sigDist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / Math.max(1, a.length));

/* ---------------- plausible mistakes ---------------- */

function mutations(model, res, kind) {
  const out = [];
  const clone = () => JSON.parse(JSON.stringify(model));
  const N = {}; model.nodes.forEach(n => { N[n.id] = n; });
  const len = mb => Math.hypot(N[mb.n2].x - N[mb.n1].x, N[mb.n2].y - N[mb.n1].y);
  const isBeam = model.nodes.every(n => Math.abs(n.y) < 1e-9);
  const isFlat = mb => Math.abs(N[mb.n1].y - N[mb.n2].y) < 1e-9;
  // supports
  model.supports.forEach((s, i) => {
    if (s.type === "fixed") { const m = clone(); m.supports[i].type = "pin"; out.push({ key: `pin-${s.node}`, label: `treats the fixed support at ${s.node} as pinned`, model: m }); }
    if (s.type === "pin") { const m = clone(); m.supports[i].type = "fixed"; out.push({ key: `fix-${s.node}`, label: `treats the pinned support at ${s.node} as fixed`, model: m }); }
  });
  if (model.supports.length === 1 && model.supports[0].type === "fixed") {
    const deg = {}; model.members.forEach(mb => { deg[mb.n1] = (deg[mb.n1] || 0) + 1; deg[mb.n2] = (deg[mb.n2] || 0) + 1; });
    const at = N[model.supports[0].node];
    const ends = model.nodes.filter(n => deg[n.id] === 1 && n.id !== at.id).sort((a, b) => Math.hypot(b.x - at.x, b.y - at.y) - Math.hypot(a.x - at.x, a.y - at.y));
    if (ends.length) { const m = clone(); m.supports[0].node = ends[0].id; out.push({ key: "wrongend", label: `fixes the wrong end (${ends[0].id} instead of ${at.id})`, model: m }); }
  }
  // hinges and pin connections
  (model.hinges || []).forEach((h, i) => {
    const m = clone(); m.hinges.splice(i, 1); out.push({ key: `nohinge-${i}`, label: "ignores the internal hinge", model: m });
    if (Math.abs(1 - 2 * h.t) > 0.2) { const q = clone(); q.hinges[i].t = +(1 - h.t).toFixed(6); out.push({ key: `movehinge-${i}`, label: "puts the hinge in the wrong place", model: q }); }
  });
  model.members.forEach((mb, i) => {
    if (mb.rel1 || mb.rel2) { const m = clone(); delete m.members[i].rel1; delete m.members[i].rel2; out.push({ key: `rigid-${mb.id}`, label: `treats ${mb.id} as rigidly connected`, model: m }); }
  });
  if (isBeam && model.supports.length >= 3) {
    const xs = model.supports.map(s => N[s.node].x).sort((a, b) => a - b);
    const m = clone();
    xs.slice(1, -1).forEach(x => { const nd = model.nodes.find(n => Math.abs(n.x - x) < 1e-6); const into = m.members.find(q => q.n2 === nd.id); if (into) into.rel2 = true; });
    out.push({ key: "nocontinuity", label: "treats each span as simply supported (ignores continuity)", model: m });
  }
  if (isBeam && res.SI > 0) {
    const longest = [...model.members].sort((p, q) => len(q) - len(p))[0];
    if (longest) { const m = clone(); m.hinges = [...(m.hinges || []), { id: "Hx", member: longest.id, t: 0.5 }]; out.push({ key: "addhinge", label: "puts a hinge where there is none", model: m }); }
  }
  // loads
  const horiz = model.loads.filter(l => (l.type === "node" || l.type === "mpoint") && Math.abs(l.Fx || 0) > 1e-9);
  const vert = model.loads.filter(l => l.type === "udl" || Math.abs(l.Fy || 0) > 1e-9);
  if (horiz.length && vert.length) {
    const a = clone(); a.loads = a.loads.filter(l => !horiz.some(h => h.id === l.id)); out.push({ key: "nolateral", label: "ignores the horizontal load", model: a });
    const b = clone(); b.loads = b.loads.filter(l => !vert.some(v => v.id === l.id)); out.push({ key: "nogravity", label: "ignores the vertical load", model: b });
  }
  const udls = model.loads.filter(l => l.type === "udl");
  if (udls.length) {
    const m = clone(); m.loads = m.loads.filter(l => l.type !== "udl");
    udls.forEach(u => {
      const mb = model.members.find(q => q.id === u.member); if (!mb) return;
      const ta = u.t1 == null ? 0 : u.t1, tb = u.t2 == null ? 1 : u.t2, wa = u.w || 0, wb = u.w2 == null ? wa : u.w2;
      const Wt = (wa + wb) / 2 * (tb - ta) * len(mb), tbar = Math.abs(wa + wb) > 1e-9 ? ta + (tb - ta) * (wa + 2 * wb) / (3 * (wa + wb)) : (ta + tb) / 2;
      const c = (N[mb.n2].x - N[mb.n1].x) / len(mb), sn = (N[mb.n2].y - N[mb.n1].y) / len(mb);
      const [fx, fy] = u.dir === "grav" ? [0, -Wt] : [-sn * Wt, c * Wt];
      m.loads.push({ id: u.id + "p", type: "mpoint", member: mb.id, t: Math.min(0.999, Math.max(0.001, tbar)), Fx: fx, Fy: fy, M: 0 });
    });
    out.push({ key: "udl-as-point", label: "treats the distributed load as a single point load", model: m });
  }
  const pts = model.loads.filter(l => (l.type === "node" || l.type === "mpoint") && Math.abs(l.Fy || 0) > 1e-9);
  if (pts.length) {
    const m = clone(); m.loads = m.loads.filter(l => !pts.some(q => q.id === l.id));
    if (isBeam) {
      const total = pts.reduce((s, q) => s + -q.Fy, 0), Lt = model.members.reduce((s, mb) => s + len(mb), 0);
      model.members.forEach(mb => m.loads.push({ id: "S" + mb.id, type: "udl", member: mb.id, w: total / Lt, dir: "grav" }));
    } else {
      pts.forEach(q => {
        const mb = q.type === "mpoint" ? model.members.find(x => x.id === q.member) : model.members.find(x => (x.n1 === q.node || x.n2 === q.node) && isFlat(x));
        if (!mb) { m.loads.push(q); return; }
        m.loads.push({ id: q.id + "u", type: "udl", member: mb.id, w: -q.Fy / len(mb), dir: "grav" });
        if (Math.abs(q.Fx || 0) > 1e-9 || Math.abs(q.M || 0) > 1e-9) m.loads.push({ ...q, Fy: 0 });
      });
    }
    out.push({ key: "point-as-udl", label: "spreads the point load out as a UDL", model: m });
  }
  if (!isBeam) {
    const top = [...model.nodes].sort((a, b) => b.y - a.y || a.x - b.x).find(n => !model.supports.some(q => q.node === n.id));
    if (top) { const m = clone(); m.supports.push({ node: top.id, type: "rollerH" }); out.push({ key: "nosway", label: "assumes the frame cannot sway", model: m }); }
  }
  // stiffness
  if (kind === "M" && !isBeam && res.SI > 0) {
    const flat = model.members.filter(isFlat).map(mb => mb.id);
    if (flat.length) {
      const a = clone(); a.members.forEach(mb => { if (flat.includes(mb.id)) mb.EI = EI * 1000; }); out.push({ key: "rigidbeam", label: "assumes the beam is rigid", model: a });
      const b = clone(); b.members.forEach(mb => { if (flat.includes(mb.id)) mb.EI = EI / 1000; }); out.push({ key: "softbeam", label: "assumes the beam is very flexible", model: b });
    }
  }
  if (kind === "D") model.members.forEach((mb, i) => {
    const m = clone(); m.members[i].EI = EI * 1e4; out.push({ key: `stiff-${mb.id}`, label: `forgets that ${mb.id} bends`, model: m });
  });
  return out;
}

export const MIN_GAP = 0.12;

/** Four sketches (one right, three plausible mistakes) for "M" or "D". */
export function diagramOptions(model, res, kind, r) {
  const sig0 = signature(res, kind);
  const correct = { key: "correct", label: "correct", model, res, flip: false, sig: sig0 };
  const isBeam = model.nodes.every(n => Math.abs(n.y) < 1e-9);
  const flipAll = { key: "flip", label: kind === "M" ? "is drawn on the compression face (every sign reversed)" : "deflects the wrong way", model, res, flip: true, sig: sig0.map(v => -v) };
  const mutated = [];
  mutations(model, res, kind).forEach(mu => {
    const rr = solve(mu.model);
    if (!rr.stable) return;
    mutated.push({ ...mu, res: rr, flip: false, sig: signature(rr, kind) });
  });
  // frames: the moment in one member drawn on the wrong face — the classic slip when turning a corner
  const partial = [];
  if (kind === "M" && !isBeam && res.members.length >= 2) {
    const per = FRACS.length, big = Math.max(...sig0.map(Math.abs));
    res.members.forEach((mb, i) => {
      const seg = sig0.slice(i * per, (i + 1) * per);
      if (Math.max(...seg.map(Math.abs)) < 0.1 * big) return;
      const sig = sig0.map((v, j) => (j >= i * per && j < (i + 1) * per ? -v : v));
      partial.push({ key: `flip-${mb.id}`, label: `has the moment in ${mb.id} on the wrong face`, model, res, flip: false, flipMembers: [mb.id], sig });
    });
  }
  const m = r.shuffle(mutated), pp = r.shuffle(partial);
  const primary = [...m.slice(0, 1), ...pp.slice(0, 1), ...(r.chance(0.7) ? [flipAll] : []), ...m.slice(1), ...pp.slice(1)];
  const backup = [...r.shuffle(mutated.map(m => ({ ...m, key: m.key + "-flip", label: `${m.label}, and ${kind === "M" ? "is drawn on the wrong face" : "deflects the wrong way"}`, flip: true, sig: m.sig.map(v => -v) }))), flipAll];
  const chosen = [];
  for (const c of [...primary, ...backup]) {
    if (chosen.length === 3) break;
    if (sigDist(c.sig, sig0) < MIN_GAP || chosen.some(o => o.key === c.key || sigDist(o.sig, c.sig) < MIN_GAP)) continue;
    chosen.push(c);
  }
  const options = r.shuffle([correct, ...chosen]).map((o, i) => ({ ...o, letter: "ABCD"[i] }));
  return { options, answer: options.findIndex(o => o.key === "correct") };
}

/* ---------------- the quiz ---------------- */

const RX_OPTS = {
  Rx: { label: "Horizontal reaction", unit: "kN", sense: "→ +", opts: ["→ right", "← left"] },
  Ry: { label: "Vertical reaction", unit: "kN", sense: "↑ +", opts: ["↑ up", "↓ down"] },
  M: { label: "Moment reaction", unit: "kN·m", sense: "↺ +", opts: ["↺ anticlockwise", "↻ clockwise"] },
};
const COMPS = { fixed: ["Rx", "Ry", "M"], pin: ["Rx", "Ry"], rollerV: ["Ry"], rollerH: ["Rx"], guided: ["Rx", "M"] };

export function countContraflexure(model, res) {
  if ((model.hinges || []).length || model.members.some(m => m.rel1 || m.rel2)) return null;
  const isBeam = model.nodes.every(n => Math.abs(n.y) < 1e-9);
  const runs = isBeam ? [res.members.slice().sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2)).flatMap(mb => mb.samples.map(p => p.M))] : res.members.map(mb => mb.samples.map(p => p.M));
  const big = Math.max(1e-9, ...runs.flat().map(Math.abs)), tol = 1e-3 * big;
  let n = 0;
  runs.forEach(vals => {
    let last = 0;
    vals.forEach(v => { if (Math.abs(v) < tol) return; const sg = Math.sign(v); if (last && sg !== last) n++; last = sg; });
  });
  return n;
}

/**
 * Everything the Practice tab needs for one model: solved result, answer parts
 * (numeric for determinate or standard cases, directions otherwise, plus the
 * BMD and deflected-shape sketches), and qualitative hints.
 */
export function buildQuiz(model, { seed = 1, standard = false } = {}) {
  const res = solve(model);
  if (!res.stable) return { stable: false, reason: res.reason, model, res };
  const r = rng(seed * 7919 + 17);
  const determinate = res.SI === 0;
  const numeric = determinate || standard;
  const parts = [];
  const big = { F: Math.max(1e-9, ...res.reactions.flatMap(q => [Math.abs(q.Rx), Math.abs(q.Ry)])), M: Math.max(1e-9, ...res.reactions.map(q => Math.abs(q.M))) };
  const order = [...model.supports].sort((a, b) => a.node.localeCompare(b.node));
  order.forEach(s => {
    const rc = res.reactions.find(q => q.node === s.node); if (!rc) return;
    (COMPS[s.type] || []).forEach(c => {
      const v = rc[c], meta = RX_OPTS[c];
      const tiny = Math.abs(v) < (c === "M" ? 0.02 * Math.max(big.M, big.F) : 0.02 * big.F) || Math.abs(v) < 0.05;
      if (tiny) return; // a zero component is not worth a question
      if (numeric) parts.push({ id: `R-${s.node}-${c}`, type: "num", group: "Reactions", label: `${meta.label} at ${s.node}`, unit: meta.unit, sense: meta.sense, expected: v, tolRel: determinate ? 0.02 : 0.05, tolAbs: 0.1 });
      else parts.push({ id: `D-${s.node}-${c}`, type: "dir", group: "Reactions", label: `${meta.label} at ${s.node}`, options: meta.opts, expected: v > 0 ? 0 : 1 });
    });
  });
  const bmd = diagramOptions(model, res, "M", r);
  parts.push({ id: "BMD", type: "mcq", group: "Sketches", kind: "M", label: "Which sketch is the bending moment diagram (drawn on the tension face)?", options: bmd.options, expected: bmd.answer });
  const dfl = diagramOptions(model, res, "D", r);
  parts.push({ id: "DEF", type: "mcq", group: "Sketches", kind: "D", label: "Which sketch is the deflected shape?", options: dfl.options, expected: dfl.answer });
  let peak = { v: 0, member: null, s: 0 };
  res.members.forEach(mb => mb.samples.forEach(p => { if (Math.abs(p.M) > Math.abs(peak.v)) peak = { v: p.M, member: mb.id, s: p.s }; }));
  if (numeric) parts.push({ id: "PEAK", type: "num", group: "Key values", label: "Largest bending moment anywhere (magnitude)", unit: "kN·m", sense: "size only", expected: Math.abs(peak.v), tolRel: determinate ? 0.02 : 0.05, tolAbs: 0.1, magnitude: true });
  const cf = countContraflexure(model, res);
  if (cf != null) parts.push({ id: "CF", type: "count", group: "Key values", label: "How many points of contraflexure are there?", expected: cf });
  return { stable: true, model, res, determinate, numeric, SI: res.SI, parts, peak, hints: hintsFor(model, res) };
}

export function gradeQuiz(quiz, answers) {
  const results = {};
  let correct = 0;
  quiz.parts.forEach(p => {
    const a = answers[p.id];
    let ok = false, msg = "";
    if (a === undefined || a === null || a === "") msg = "not answered";
    else if (p.type === "num") {
      const v = parseFloat(a);
      const tol = Math.max(p.tolAbs || 0, (p.tolRel || 0) * Math.abs(p.expected));
      if (!isFinite(v)) msg = "not a number";
      else if (Math.abs((p.magnitude ? Math.abs(v) : v) - p.expected) <= tol) ok = true;
      else if (!p.magnitude && Math.abs(-v - p.expected) <= tol) msg = "right size, wrong direction";
      else msg = "not quite";
    } else {
      ok = Number(a) === p.expected;
      if (!ok) msg = "not this one";
    }
    if (ok) correct++;
    results[p.id] = { ok, msg };
  });
  return { results, correct, total: quiz.parts.length, allCorrect: correct === quiz.parts.length && quiz.parts.length > 0 };
}

/* ---------------- hints (qualitative, exam-style) ---------------- */

export function hintsFor(model, res) {
  const h = [];
  const types = new Set(model.supports.map(s => s.type));
  const isBeam = model.nodes.every(n => Math.abs(n.y) < 1e-9);
  if (types.has("fixed")) h.push("A fixed support stops rotation, so it attracts moment — usually hogging under gravity load.");
  if (types.has("pin") || types.has("rollerV")) h.push("A pin or roller cannot resist moment: M = 0 there, unless a cantilever overhangs it.");
  if ((model.hinges || []).length || model.members.some(m => m.rel1 || m.rel2)) h.push("M = 0 at a hinge, and the deflected shape has a kink there (no slope continuity).");
  if (model.loads.some(l => l.type === "udl")) h.push("Under a UDL the bending moment is a parabola; between point loads it is a straight line with a kink under each load.");
  if (res.SI > 0) h.push("Sketch the free (simply supported) moment first, then hang it from the straight closing line between the end moments.");
  if (res.SI === 0) h.push("It is statically determinate: equilibrium alone (ΣFx, ΣFy, ΣM, plus M = 0 at any hinge) gives every reaction.");
  if (!isBeam && model.loads.some(l => Math.abs(l.Fx || 0) > 1e-9)) h.push("A sideways load makes the frame sway: moments in each column change sign up its height when the feet are fixed.");
  if (isBeam && model.supports.length >= 3) h.push("Over an internal support of a continuous beam the moment is hogging; the spans sag between.");
  h.push("Deflected shape and BMD must agree: sagging moment ⇒ curving like a smile, hogging ⇒ like a frown; points of contraflexure are where the curvature reverses.");
  return h;
}

/* ---------------- random question ---------------- */

export function randomQuestion(seed, family = "any") {
  const r = rng(seed);
  const pool = TEMPLATES.filter(t => family === "any" || t.family === family);
  for (let attempt = 0; attempt < 20; attempt++) {
    const t = r.pick(pool);
    const model = t.make(r);
    const res = solve(model);
    if (!res.stable) continue;
    const d = describe(model);
    const determinate = res.SI === 0;
    const ask = determinate
      ? "Find the reactions, sketch the bending moment diagram on the tension face with key values, and sketch the deflected shape."
      : model.meta && model.meta.standard
        ? "Using standard results, find the reactions and the largest bending moment, and sketch the bending moment diagram and the deflected shape."
        : "Without a full analysis, sketch the bending moment diagram and the deflected shape, and decide which way each reaction acts.";
    return { seed, key: t.key, family: t.family, title: t.title, standard: !!(model.meta && model.meta.standard), model, determinate, SI: res.SI, prompt: `${d.text} ${ask}` };
  }
  return null;
}
