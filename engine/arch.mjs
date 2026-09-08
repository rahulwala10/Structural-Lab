import { uid } from './util.mjs';

/* ---------------- ARCH geometry (solved by the frame engine) ---------------- */
export function makeArch(o) {
  const L = o.span == null ? 12 : o.span, h = o.rise == null ? 3.5 : o.rise;
  const n = Math.max(4, Math.round(o.segs == null ? 12 : o.segs));
  const profile = o.profile || "parabola", support = o.support || "pin";
  const yfun = profile === "circle"
    ? (() => { const R = L * L / (8 * h) + h / 2, cy = h - R; return x => cy + Math.sqrt(Math.max(0, R * R - (x - L / 2) ** 2)); })()
    : (x => 4 * h * x * (L - x) / (L * L));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", ids = [], nodes = [];
  for (let i = 0; i <= n; i++) { const x = L * i / n; const id = i < 26 ? letters[i] : "n" + i; ids.push(id); nodes.push({ id, x: +x.toFixed(3), y: +yfun(x).toFixed(3) }); }
  const members = []; for (let i = 0; i < n; i++) members.push({ id: "s" + (i + 1), n1: ids[i], n2: ids[i + 1] });
  const supports = [{ node: ids[0], type: support }, { node: ids[n], type: support }];
  if (o.threePin) members[Math.floor(n / 2)] = { ...members[Math.floor(n / 2)], rel1: true };
  const loads = members.map(m => ({ id: uid(), type: "udl", member: m.id, w: 10, dir: "grav" }));
  return { nodes, members, supports, loads };
}
