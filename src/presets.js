/**
 * Preset library — worked study cases grouped by structure type.
 * Plain JS (no JSX) so the test suite can import and verify every preset.
 */
import { uid, makeArch, analyzeFrame, analyzeTruss } from "../engine/index.mjs";


const P_ = (nodes, members, supports, loads) => ({ nodes, members, supports, loads: loads.map(l => ({ id: uid(), ...l })) });

export const FRAME_PRESETS = [
  { name: "Portal · fixed feet", note: "The workhorse. SI = 3. Compare its base moments with the pinned version.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 6, y: 4 }, { id: "D", x: 6, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "bm", n1: "B", n2: "C" }, { id: "c2", n1: "C", n2: "D" }],
    [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }],
    [{ type: "udl", member: "bm", w: 15, dir: "grav" }, { type: "node", node: "B", Fx: 20, Fy: 0, M: 0 }]) },
  { name: "Portal · pinned feet", note: "Same frame, pinned bases. Base moment vanishes and everything else grows.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 6, y: 4 }, { id: "D", x: 6, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "bm", n1: "B", n2: "C" }, { id: "c2", n1: "C", n2: "D" }],
    [{ node: "A", type: "pin" }, { node: "D", type: "pin" }],
    [{ type: "udl", member: "bm", w: 15, dir: "grav" }, { type: "node", node: "B", Fx: 20, Fy: 0, M: 0 }]) },
  { name: "Portal · 3-pinned", note: "Pinned feet plus an apex hinge → SI = 0, fully determinate.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 3, y: 4 }, { id: "D", x: 6, y: 4 }, { id: "E", x: 6, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "b1", n1: "B", n2: "C" }, { id: "b2", n1: "C", n2: "D", rel1: true }, { id: "c2", n1: "D", n2: "E" }],
    [{ node: "A", type: "pin" }, { node: "E", type: "pin" }],
    [{ type: "udl", member: "b1", w: 15, dir: "grav" }, { type: "udl", member: "b2", w: 15, dir: "grav" }]) },
  { name: "Sway vs no-sway", note: "Symmetric frame, symmetric load — no sway. Add a lateral load and watch it shift.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 6, y: 4 }, { id: "D", x: 6, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "bm", n1: "B", n2: "C" }, { id: "c2", n1: "C", n2: "D" }],
    [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }],
    [{ type: "udl", member: "bm", w: 20, dir: "grav" }]) },
  { name: "Stiff beam / weak columns", note: "Beam EI ×100. Joints barely rotate, so columns bend in double curvature.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 6, y: 4 }, { id: "D", x: 6, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "bm", n1: "B", n2: "C", EI: 2e6 }, { id: "c2", n1: "C", n2: "D" }],
    [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }],
    [{ type: "node", node: "B", Fx: 20, Fy: 0, M: 0 }]) },
  { name: "Weak beam / stiff columns", note: "The mirror case. Columns act as cantilevers — base moments double.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 6, y: 4 }, { id: "D", x: 6, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B", EI: 2e5 }, { id: "bm", n1: "B", n2: "C", EI: 2e3 }, { id: "c2", n1: "C", n2: "D", EI: 2e5 }],
    [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }],
    [{ type: "node", node: "B", Fx: 20, Fy: 0, M: 0 }]) },
  { name: "Support settlement", note: "No load at all — 10 mm of settlement alone induces moments in an indeterminate frame.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 6, y: 4 }, { id: "D", x: 6, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "bm", n1: "B", n2: "C" }, { id: "c2", n1: "C", n2: "D" }],
    [{ node: "A", type: "fixed" }, { node: "D", type: "fixed", dy: -0.01 }],
    []) },
  { name: "Cantilever column", note: "M = PH at the base, δ = PH³/3EI at the tip. The reference case.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }],
    [{ id: "c1", n1: "A", n2: "B" }],
    [{ node: "A", type: "fixed" }],
    [{ type: "node", node: "B", Fx: 12, Fy: 0, M: 0 }]) },
  { name: "Simple beam", note: "wL²/8 and 5wL⁴/384EI — check the tool against what you already know.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }],
    [{ id: "bm", n1: "A", n2: "B" }],
    [{ node: "A", type: "pin" }, { node: "B", type: "rollerV" }],
    [{ type: "udl", member: "bm", w: 12, dir: "grav" }]) },
  { name: "Propped cantilever", note: "Fixed one end, propped the other: wL²/8 hogging, 5wL/8 and 3wL/8.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }],
    [{ id: "bm", n1: "A", n2: "B" }],
    [{ node: "A", type: "fixed" }, { node: "B", type: "rollerV" }],
    [{ type: "udl", member: "bm", w: 12, dir: "grav" }]) },
  { name: "Gerber (hinged) beam", note: "Two spans with a drop-in hinge — determinate, and the BMD shows why.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 4, y: 0 }, { id: "C", x: 6, y: 0 }, { id: "D", x: 10, y: 0 }],
    [{ id: "m1", n1: "A", n2: "B" }, { id: "m2", n1: "B", n2: "C", rel1: true }, { id: "m3", n1: "C", n2: "D" }],
    [{ node: "A", type: "fixed" }, { node: "C", type: "rollerV" }, { node: "D", type: "rollerV" }],
    [{ type: "udl", member: "m1", w: 10, dir: "grav" }, { type: "udl", member: "m2", w: 10, dir: "grav" }, { type: "udl", member: "m3", w: 10, dir: "grav" }]) },
  { name: "Knee frame (L)", note: "Statically determinate. Trace the moment round the corner.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 4, y: 4 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "bm", n1: "B", n2: "C" }],
    [{ node: "A", type: "fixed" }],
    [{ type: "node", node: "C", Fx: 0, Fy: -15, M: 0 }]) },
  { name: "Two-bay portal", note: "SI = 6. The middle column shares load from both bays.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 4 }, { id: "C", x: 5, y: 4 }, { id: "D", x: 5, y: 0 }, { id: "E", x: 10, y: 4 }, { id: "F", x: 10, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "b1", n1: "B", n2: "C" }, { id: "c2", n1: "C", n2: "D" }, { id: "b2", n1: "C", n2: "E" }, { id: "c3", n1: "E", n2: "F" }],
    [{ node: "A", type: "fixed" }, { node: "D", type: "fixed" }, { node: "F", type: "fixed" }],
    [{ type: "udl", member: "b1", w: 12, dir: "grav" }, { type: "udl", member: "b2", w: 12, dir: "grav" }, { type: "node", node: "B", Fx: 15, Fy: 0, M: 0 }]) },
  { name: "Pitched gable", note: "Sloping rafters generate horizontal thrust at the pinned feet.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 0, y: 3 }, { id: "C", x: 4, y: 5 }, { id: "D", x: 8, y: 3 }, { id: "E", x: 8, y: 0 }],
    [{ id: "c1", n1: "A", n2: "B" }, { id: "r1", n1: "B", n2: "C" }, { id: "r2", n1: "C", n2: "D" }, { id: "c2", n1: "D", n2: "E" }],
    [{ node: "A", type: "pin" }, { node: "E", type: "pin" }],
    [{ type: "udl", member: "r1", w: 8, dir: "grav" }, { type: "udl", member: "r2", w: 8, dir: "grav" }]) },
  { name: "Spring (flexible) support", note: "Swap a rigid prop for a spring and watch the moments redistribute.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }],
    [{ id: "bm", n1: "A", n2: "B" }],
    [{ node: "A", type: "fixed" }, { node: "B", type: "none", ky: 800 }],
    [{ type: "udl", member: "bm", w: 12, dir: "grav" }]) },
];

export const TRUSS_PRESETS = [
  { name: "Warren (4-panel)", note: "Alternating diagonals; verticals absent. Determinate.", make: () => P_(
    [{ id: "L0", x: 0, y: 0 }, { id: "L1", x: 2, y: 0 }, { id: "L2", x: 4, y: 0 }, { id: "L3", x: 6, y: 0 }, { id: "L4", x: 8, y: 0 }, { id: "U1", x: 1, y: 1.8 }, { id: "U2", x: 3, y: 1.8 }, { id: "U3", x: 5, y: 1.8 }, { id: "U4", x: 7, y: 1.8 }],
    [{ id: "b1", n1: "L0", n2: "L1" }, { id: "b2", n1: "L1", n2: "L2" }, { id: "b3", n1: "L2", n2: "L3" }, { id: "b4", n1: "L3", n2: "L4" }, { id: "t1", n1: "U1", n2: "U2" }, { id: "t2", n1: "U2", n2: "U3" }, { id: "t3", n1: "U3", n2: "U4" }, { id: "d1", n1: "L0", n2: "U1" }, { id: "d2", n1: "U1", n2: "L1" }, { id: "d3", n1: "L1", n2: "U2" }, { id: "d4", n1: "U2", n2: "L2" }, { id: "d5", n1: "L2", n2: "U3" }, { id: "d6", n1: "U3", n2: "L3" }, { id: "d7", n1: "L3", n2: "U4" }, { id: "d8", n1: "U4", n2: "L4" }],
    [{ node: "L0", type: "pin" }, { node: "L4", type: "rollerV" }],
    [{ type: "node", node: "U2", Fx: 0, Fy: -10, M: 0 }, { type: "node", node: "U3", Fx: 0, Fy: -10, M: 0 }]) },
  { name: "Pratt (parallel chord)", note: "Diagonals slope toward mid-span, so they act in tension.", make: () => P_(
    [{ id: "L0", x: 0, y: 0 }, { id: "L1", x: 3, y: 0 }, { id: "L2", x: 6, y: 0 }, { id: "L3", x: 9, y: 0 }, { id: "U1", x: 3, y: 2.4 }, { id: "U2", x: 6, y: 2.4 }],
    [{ id: "b1", n1: "L0", n2: "L1" }, { id: "b2", n1: "L1", n2: "L2" }, { id: "b3", n1: "L2", n2: "L3" }, { id: "t1", n1: "U1", n2: "U2" }, { id: "diL", n1: "L0", n2: "U1" }, { id: "v1", n1: "L1", n2: "U1" }, { id: "d1", n1: "U1", n2: "L2" }, { id: "v2", n1: "L2", n2: "U2" }, { id: "diR", n1: "U2", n2: "L3" }],
    [{ node: "L0", type: "pin" }, { node: "L3", type: "rollerV" }],
    [{ type: "node", node: "U1", Fx: 0, Fy: -12, M: 0 }, { type: "node", node: "U2", Fx: 0, Fy: -12, M: 0 }]) },
  { name: "Simple triangle", note: "Three bars, three joints — solve it by joints in under a minute.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 4, y: 0 }, { id: "C", x: 2, y: 3 }],
    [{ id: "AB", n1: "A", n2: "B" }, { id: "BC", n1: "B", n2: "C" }, { id: "CA", n1: "C", n2: "A" }],
    [{ node: "A", type: "pin" }, { node: "B", type: "rollerV" }],
    [{ type: "node", node: "C", Fx: 0, Fy: -10, M: 0 }]) },
  { name: "King-post roof", note: "Watch the post: it is a zero-force member until you load the apex.", make: () => P_(
    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }, { id: "C", x: 3, y: 2.4 }, { id: "D", x: 3, y: 0 }],
    [{ id: "tie1", n1: "A", n2: "D" }, { id: "tie2", n1: "D", n2: "B" }, { id: "raf1", n1: "A", n2: "C" }, { id: "raf2", n1: "C", n2: "B" }, { id: "post", n1: "C", n2: "D" }],
    [{ node: "A", type: "pin" }, { node: "B", type: "rollerV" }],
    [{ type: "node", node: "C", Fx: 0, Fy: -16, M: 0 }]) },
  { name: "Cantilever truss", note: "Top chord in tension, bottom in compression — the reverse of a simple span.", make: () => P_(
    [{ id: "A", x: 0, y: 3 }, { id: "B", x: 0, y: 0 }, { id: "C", x: 3, y: 3 }, { id: "D", x: 3, y: 0 }, { id: "E", x: 6, y: 3 }],
    [{ id: "t1", n1: "A", n2: "C" }, { id: "t2", n1: "C", n2: "E" }, { id: "b1", n1: "B", n2: "D" }, { id: "v0", n1: "A", n2: "B" }, { id: "v1", n1: "C", n2: "D" }, { id: "di1", n1: "B", n2: "C" }, { id: "di2", n1: "D", n2: "E" }],
    [{ node: "A", type: "pin" }, { node: "B", type: "rollerH" }],
    [{ type: "node", node: "E", Fx: 0, Fy: -10, M: 0 }]) },
];

export const ARCH_PRESETS = [
  { name: "Parabolic · 2-pin", note: "Under uniform load the parabola is funicular: almost pure compression.", make: () => makeArch({ span: 12, rise: 3.5, segs: 12, profile: "parabola", support: "pin" }) },
  { name: "Parabolic · fixed", note: "Fixed springings, SI = 3. Bending appears at the supports.", make: () => makeArch({ span: 12, rise: 3.5, segs: 12, profile: "parabola", support: "fixed" }) },
  { name: "Parabolic · 3-pinned", note: "Crown hinge makes it determinate — the classic exam arch.", make: () => makeArch({ span: 12, rise: 3.5, segs: 12, profile: "parabola", support: "pin", threePin: true }) },
  { name: "Circular · 2-pin", note: "A circle is not funicular for UDL, so bending shows up.", make: () => makeArch({ span: 10, rise: 3, segs: 14, profile: "circle", support: "pin" }) },
  { name: "Shallow arch (big thrust)", note: "Halve the rise and the thrust doubles: H = wL²/8h.", make: () => makeArch({ span: 12, rise: 1.5, segs: 12, profile: "parabola", support: "pin" }) },
  { name: "Crown point load", note: "Load no longer matches the shape → real bending in the arch.", make: () => { const a = makeArch({ span: 12, rise: 4, segs: 12, profile: "parabola", support: "pin" }); return { ...a, loads: [{ id: uid(), type: "node", node: a.nodes[6].id, Fx: 0, Fy: -30, M: 0 }] }; } },
];

export const KINDS = {
  frame: { label: "Frame", presets: FRAME_PRESETS, diagrams: ["model", "N", "V", "M", "D"], analyze: analyzeFrame, si: "3m + r − 3n − releases" },
  truss: { label: "Truss", presets: TRUSS_PRESETS, diagrams: ["model", "N", "D"], analyze: analyzeTruss, si: "m + r − 2n" },
  arch: { label: "Arch", presets: ARCH_PRESETS, diagrams: ["model", "N", "V", "M", "D"], analyze: analyzeFrame, si: "3m + r − 3n − releases" },
};
