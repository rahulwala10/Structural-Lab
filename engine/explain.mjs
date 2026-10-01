/**
 * Qualitative "how is this value found?" breakdowns.
 *
 * Every breakdown here is built from statics on top of a solved result, and
 * each one sums back to the solver's own number (engine/test/explain.mjs
 * checks that), so the teaching text can never disagree with the diagrams.
 *
 * Conventions match the solvers: loads down +, couples CCW +, reactions up +,
 * bending sagging +, shear anticlockwise + (V = −dM/dx).
 */

const EPS = 1e-6;
export const supportName = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");

/* ---------- beam helpers ---------- */

// ∫w dx and ∫w·x dx of a (possibly trapezoidal) UDL, clipped to [a, b]
function udlWS(u, a, b) {
  const lo = Math.max(a, u.x1), hi = Math.min(b, u.x2);
  if (hi - lo < 1e-12 || u.x2 - u.x1 < 1e-12) return [0, 0];
  const m = (u.w2 - u.w1) / (u.x2 - u.x1), w0 = u.w1 - m * u.x1; // w(x) = w0 + m·x
  const W = w0 * (hi - lo) + m * (hi * hi - lo * lo) / 2;
  const S = w0 * (hi * hi - lo * lo) / 2 + m * (hi ** 3 - lo ** 3) / 3;
  return [W, S];
}

function beamActs(loads) {
  return (loads || []).filter(l =>
    l.type === "point" ? Math.abs(l.P) > 1e-9 :
    l.type === "moment" ? Math.abs(l.M) > 1e-9 :
    l.type === "udl" && l.x2 - l.x1 > 1e-9 && (Math.abs(l.w1) > 1e-9 || Math.abs(l.w2) > 1e-9));
}

function momentAt(res, x, side) {
  const idx = [];
  for (let i = 0; i < res.xs.length; i++) if (Math.abs(res.xs[i] - x) < 1e-7) idx.push(i);
  if (idx.length) return res.M[side === "L" ? idx[0] : idx[idx.length - 1]];
  let bi = 0, bd = Infinity;
  for (let i = 0; i < res.xs.length; i++) { const d = Math.abs(res.xs[i] - x); if (d < bd) { bd = d; bi = i; } }
  return res.M[bi];
}

/**
 * How each beam reaction is made up: for every span between neighbouring
 * supports, the simply-supported ("free") share of the loads on that span plus
 * a continuity share (M_right − M_left)/l from the support moments; overhang
 * loads go straight to their support. Works for any stable beam, hinged or not.
 */
export function beamReactionBreakdown(L, loads, res) {
  if (!res || !res.stable) return null;
  const acts = beamActs(loads);
  const rx = res.reactions.map((r, i) => ({ ...r, name: supportName(i), parts: [] }));
  const xs = rx.map(r => r.x);
  const inOpen = (x, a, b) => x > a + EPS && x < b - EPS;
  // loads strictly inside (a, b): resultant W and first moment S, plus couples
  const loadIn = (a, b) => {
    let W = 0, S = 0, C = 0;
    acts.forEach(l => {
      if (l.type === "point" && inOpen(l.x, a, b)) { W += l.P; S += l.P * l.x; }
      else if (l.type === "moment" && inOpen(l.x, a, b)) C += l.M;
      else if (l.type === "udl") { const [w, s] = udlWS(l, a, b); W += w; S += s; }
    });
    return { W, S, C };
  };
  const spans = [];
  for (let i = 0; i < rx.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1], l = xb - xa;
    if (l < EPS) continue;
    const { W, S, C } = loadIn(xa, xb);
    const Ma = momentAt(res, xa, "R"), Mb = momentAt(res, xb, "L");
    const freeA = (xb * W - S + C) / l, cont = (Mb - Ma) / l;
    const span = { a: i, b: i + 1, xa, xb, l, W, C, Ma, Mb, freeA, freeB: W - freeA, cont };
    spans.push(span);
    rx[i].parts.push({ kind: "span", side: "right", span, free: span.freeA, cont });
    rx[i + 1].parts.push({ kind: "span", side: "left", span, free: span.freeB, cont: -cont });
  }
  // overhangs beyond the end supports
  if (rx.length) {
    const left = loadIn(-1, xs[0]), right = loadIn(xs[xs.length - 1], L + 1);
    if (xs[0] > EPS && Math.abs(left.W) > 1e-9) rx[0].parts.push({ kind: "overhang", side: "left", from: 0, to: xs[0], free: left.W, cont: 0 });
    if (xs[xs.length - 1] < L - EPS && Math.abs(right.W) > 1e-9) rx[rx.length - 1].parts.push({ kind: "overhang", side: "right", from: xs[xs.length - 1], to: L, free: right.W, cont: 0 });
  }
  // point loads sitting exactly on a support go straight into it
  acts.forEach(l => {
    if (l.type !== "point") return;
    const i = xs.findIndex(x => Math.abs(x - l.x) <= EPS);
    if (i >= 0) rx[i].parts.push({ kind: "direct", free: l.P, cont: 0 });
  });
  rx.forEach(r => { r.sum = r.parts.reduce((s, p) => s + p.free + p.cont, 0); });
  return { spans, supports: rx };
}

/**
 * The exam sketching method, span by span: the free (simply supported) moment
 * hangs from the straight closing line between the two support moments, so
 * M(x) = m₀(x) + M_a + (M_b − M_a)(x − x_a)/l. Reported where the free moment
 * peaks. m₀ is built from the span's own loads and its free reaction, not read
 * back from the solver, so the sum is a genuine check.
 */
export function beamSpanMoments(L, loads, res) {
  const bd = beamReactionBreakdown(L, loads, res);
  if (!bd) return null;
  const acts = beamActs(loads);
  const m0At = (sp, x) => {
    let m = sp.freeA * (x - sp.xa);
    acts.forEach(l => {
      if (l.type === "point" && l.x > sp.xa + EPS && l.x < x - 1e-7) m -= l.P * (x - l.x);
      else if (l.type === "moment" && l.x > sp.xa + EPS && l.x < x - 1e-7) m -= l.M;
      else if (l.type === "udl") { const [W, S] = udlWS(l, sp.xa, Math.min(x, sp.xb)); m -= x * W - S; }
    });
    return m;
  };
  const spans = bd.spans.map(sp => {
    let best = null;
    for (let i = 0; i < res.xs.length; i++) {
      const x = res.xs[i];
      if (x <= sp.xa + 1e-6 || x >= sp.xb - 1e-6) continue;
      const m0 = m0At(sp, x);
      if (!best || Math.abs(m0) > Math.abs(best.m0) + 1e-12) best = { x, m0, close: sp.Ma + (sp.Mb - sp.Ma) * (x - sp.xa) / sp.l, M: res.M[i] };
    }
    const loaded = Math.abs(sp.W) > 1e-9 || Math.abs(sp.C) > 1e-9;
    return { name: `${bd.supports[sp.a].name}–${bd.supports[sp.b].name}`, xa: sp.xa, xb: sp.xb, l: sp.l, Ma: sp.Ma, Mb: sp.Mb, peak: loaded ? best : null };
  });
  const xs = bd.supports.map(s => s.x), over = [];
  if (xs.length && xs[0] > EPS) over.push({ side: "left", at: bd.supports[0].name, x: xs[0], M: momentAt(res, xs[0], "L") });
  if (xs.length && xs[xs.length - 1] < L - EPS) over.push({ side: "right", at: bd.supports[xs.length - 1].name, x: xs[xs.length - 1], M: momentAt(res, xs[xs.length - 1], "R") });
  return { spans, overhangs: over, supports: bd.supports };
}

/**
 * M at x from the free body LEFT of the cut: reactions × lever arm, minus loads
 * × lever arm, minus couples (CCW +). `side` = "L" | "R" decides whether a
 * couple sitting exactly at x is included. Returns the terms and their total.
 */
export function beamMomentTerms(x, side, loads, res) {
  if (!res || !res.stable) return null;
  const terms = [];
  // a force exactly at the cut has no lever arm; a couple there counts on the right-hand side only
  const left = px => px < x - 1e-7;
  const coupleIn = px => left(px) || (Math.abs(px - x) <= 1e-7 && side === "R");
  res.reactions.forEach((r, i) => {
    const name = supportName(i);
    if (left(r.x) && Math.abs(r.R) > 1e-9) terms.push({ kind: "reaction", name, F: r.R, arm: x - r.x, value: r.R * (x - r.x) });
    if (r.type === "fixed" && coupleIn(r.x) && Math.abs(r.M) > 1e-9) terms.push({ kind: "fixing", name, C: r.M, value: -r.M });
  });
  beamActs(loads).forEach(l => {
    if (l.type === "point" && left(l.x)) terms.push({ kind: "point", F: l.P, arm: x - l.x, value: -l.P * (x - l.x) });
    else if (l.type === "moment" && coupleIn(l.x)) terms.push({ kind: "couple", C: l.M, value: -l.M });
    else if (l.type === "udl" && l.x1 < x - 1e-7) {
      const [W, S] = udlWS(l, l.x1, x);
      if (Math.abs(W) < 1e-12 && Math.abs(S) < 1e-12) return;
      const len = Math.min(x, l.x2) - l.x1, xbar = Math.abs(W) > 1e-12 ? S / W : (l.x1 + Math.min(x, l.x2)) / 2;
      terms.push({ kind: "udl", W, len, xbar, arm: x - xbar, uniform: Math.abs(l.w1 - l.w2) < 1e-9, w: l.w1, value: -(x * W - S) });
    }
  });
  return { x, side, terms, total: terms.reduce((s, t) => s + t.value, 0) };
}

/**
 * Where V passes through zero (that is where M peaks). With anticlockwise
 * shear, V = (load down to the left) − (reactions up to the left), so at a
 * crossing those two totals are equal.
 */
export function beamZeroShear(loads, res) {
  if (!res || !res.stable) return [];
  const out = [], scale = Math.max(Math.abs(res.Vmax.v), Math.abs(res.Vmin.v), 1e-9);
  const tol = 1e-6 * scale;
  const acts = beamActs(loads);
  const tally = x => {
    let down = 0, up = 0;
    acts.forEach(l => {
      if (l.type === "point" && l.x < x - 1e-7) down += l.P;
      else if (l.type === "udl") down += udlWS(l, l.x1, x)[0];
    });
    res.reactions.forEach(r => { if (r.x < x - 1e-7) up += r.R; });
    return { down, up };
  };
  for (let i = 0; i < res.xs.length - 1; i++) {
    const x1 = res.xs[i], x2 = res.xs[i + 1], v1 = res.V[i], v2 = res.V[i + 1];
    if (x1 < 1e-7 || x2 > res.L - 1e-7) continue; // ignore the free ends
    if (x2 - x1 < 1e-9) {
      // all samples at this x: compare the value just left with the value just right
      let j = i + 1; while (j + 1 < res.xs.length && res.xs[j + 1] - x1 < 1e-9) j++;
      const vr = res.V[j];
      if ((v1 < -tol && vr > tol) || (v1 > tol && vr < -tol)) out.push({ x: x1, kind: "jump", from: v1, to: vr });
      i = j - 1;
    } else if (v1 * v2 < 0 && Math.abs(v1) > tol && Math.abs(v2) > tol) {
      const x = x1 + (x2 - x1) * v1 / (v1 - v2);
      out.push({ x, kind: "cross", ...tally(x) });
    } else if (Math.abs(v2) <= tol && Math.abs(v1) > tol && i + 2 < res.xs.length && res.V[i + 2] * v1 < 0) {
      out.push({ x: x2, kind: "cross", ...tally(x2) });
    }
  }
  return out;
}

/* ---------- frame helpers ---------- */

// transverse loads on a member in its local axes (local +y = left of from→to)
function memberTransverse(model, mb) {
  const dist = [], pts = [];
  (model.loads || []).forEach(l => {
    if (l.member !== mb.id) return;
    if (l.type === "udl") {
      const ta = l.t1 == null ? 0 : l.t1, tb = l.t2 == null ? 1 : l.t2;
      if (tb - ta < 1e-9) return; // the solver ignores an inverted extent too
      const wa = l.w || 0, wb = (l.w2 == null ? l.w : l.w2) || 0;
      const k = l.dir === "grav" ? -mb.c : 1;
      dist.push({ sa: ta * mb.L, sb: tb * mb.L, qa: k * wa, qb: k * wb });
    } else if (l.type === "mpoint") {
      const t = l.t == null ? 0.5 : l.t;
      if (t <= 1e-6 || t >= 1 - 1e-6) return; // applied at the node, not inside the member
      pts.push({ s: t * mb.L, Q: -mb.s * (l.Fx || 0) + mb.c * (l.Fy || 0), C: l.M || 0 });
    }
  });
  return { dist, pts };
}

// resultant and first moment (about s = 0) of a linear patch, clipped to [0, x]
function patchWS(d, x) {
  const hi = Math.min(x, d.sb), lo = d.sa;
  if (hi - lo < 1e-12) return [0, 0];
  const m = (d.qb - d.qa) / (d.sb - d.sa), q0 = d.qa - m * d.sa;
  return [q0 * (hi - lo) + m * (hi * hi - lo * lo) / 2, q0 * (hi * hi - lo * lo) / 2 + m * (hi ** 3 - lo ** 3) / 3];
}

/**
 * Per member: end shear = free (simply supported) shear + (M₁ − M₂)/L, and
 * midspan moment = free midspan moment + the average of the end moments
 * (the free BMD "hangs" from the straight closing line between the ends).
 */
export function frameMemberBreakdown(model, res) {
  if (!res || !res.stable || !res.members) return [];
  return res.members.map(mb => {
    const { dist, pts } = memberTransverse(model, mb);
    const L = mb.L;
    let Q = 0, S = 0, C = 0;
    dist.forEach(d => { const [w, s] = patchWS(d, L); Q += w; S += s; });
    pts.forEach(p => { Q += p.Q; S += p.Q * p.s; C += p.C; });
    const R2 = -(S + C) / L, R1 = -Q - R2;            // free reactions, local +y
    const first = mb.samples[0], last = mb.samples[mb.samples.length - 1];
    const M1 = first.M, M2 = last.M, Vg = (M1 - M2) / L;
    const h = L / 2;
    let m0 = R1 * h;                                   // free moment at midspan
    dist.forEach(d => { const [w, s] = patchWS(d, h); m0 += h * w - s; });
    pts.forEach(p => { if (p.s < h - 1e-9) m0 += p.Q * (h - p.s) - p.C; });
    const mid = mb.samples.reduce((a, p) => (Math.abs(p.s - h) < Math.abs(a.s - h) ? p : a));
    return {
      id: mb.id, n1: mb.n1, n2: mb.n2, L, loaded: dist.length + pts.length > 0, Q,
      M1, M2, Vfree1: -R1, Vfree2: R2, Vg, V1: first.V, V2: last.V,
      m0, Mmid: (M1 + M2) / 2 + m0, MmidSolver: mid.M,
    };
  });
}

/**
 * Moment balance at every joint: what each member end does to the joint
 * (+M₁ at a "from" end, −M₂ at a "to" end, CCW +), plus applied and support
 * moments, must sum to zero.
 */
export function frameJointBalance(model, res) {
  if (!res || !res.stable || !res.members) return [];
  const joints = {};
  const at = id => (joints[id] = joints[id] || { node: id, items: [], applied: 0, reaction: 0 });
  res.members.forEach(mb => {
    at(mb.n1).items.push({ member: mb.id, end: 1, released: !!mb.rel1, m: mb.samples[0].M });
    at(mb.n2).items.push({ member: mb.id, end: 2, released: !!mb.rel2, m: -mb.samples[mb.samples.length - 1].M });
  });
  (model.loads || []).forEach(l => {
    if (l.type === "node" && joints[l.node]) joints[l.node].applied += l.M || 0;
    if (l.type === "mpoint" && Math.abs(l.M || 0) > 0) {
      const mb = res.members.find(m => m.id === l.member), t = l.t == null ? 0.5 : l.t;
      if (mb && t <= 1e-6) at(mb.n1).applied += l.M;
      if (mb && t >= 1 - 1e-6) at(mb.n2).applied += l.M;
    }
  });
  res.reactions.forEach(rc => { if (joints[rc.node]) joints[rc.node].reaction += rc.M || 0; });
  return Object.values(joints).map(j => ({ ...j, sum: j.items.reduce((s, it) => s + it.m, 0) + j.applied + j.reaction }));
}

/**
 * Reactions from global equilibrium: totals, each support's share of the
 * vertical load, and (for two horizontal restraints) the split of the
 * horizontal reactions into an equal "lateral share" and a self-balancing
 * "kick"; plus ΣM about the first support with every term listed.
 */
export function frameReactionStory(model, res) {
  if (!res || !res.stable) return null;
  const N = {}; (model.nodes || []).forEach(n => { N[n.id] = n; });
  const rcs = res.reactions.filter(r => N[r.node]);
  const totalDown = -res.appliedFy;
  const sup = rcs.map(r => ({ node: r.node, type: r.type, Rx: r.Rx, Ry: r.Ry, M: r.M, share: Math.abs(totalDown) > 1e-9 ? r.Ry / totalDown : null }));
  const O = N[rcs.length ? rcs[0].node : model.nodes[0].id];   // moments are taken about the first support
  sup.forEach(q => { q.x = N[q.node].x - O.x; });
  const hx = sup.filter(s => s.type === "fixed" || s.type === "pin" || s.type === "rollerH" || s.type === "guided");
  let split = null;
  if (hx.length === 2) {
    const [a, b] = N[hx[0].node].x <= N[hx[1].node].x ? hx : [hx[1], hx[0]];
    const lateral = (a.Rx + b.Rx) / 2, kick = (a.Rx - b.Rx) / 2;
    split = { left: a.node, right: b.node, lateral, kick, inward: kick > 0 };
  }
  // ΣM about the first support (CCW +): applied loads, then each reaction
  let loadM = 0, Wy = 0, Wyx = 0;                      // Wy, Wyx: vertical load and its first moment about O
  (model.loads || []).forEach(l => {
    if (l.type === "node" && N[l.node]) {
      loadM += (l.M || 0) + (N[l.node].x - O.x) * (l.Fy || 0) - (N[l.node].y - O.y) * (l.Fx || 0);
      Wy += l.Fy || 0; Wyx += (l.Fy || 0) * (N[l.node].x - O.x);
    }
  });
  const resMB = {}; (res.members || []).forEach(m => { resMB[m.id] = m; });
  (model.loads || []).forEach(l => {
    const mb = resMB[l.member]; if (!mb || (l.type !== "udl" && l.type !== "mpoint")) return;
    if (l.type === "mpoint") {
      const t = l.t == null ? 0.5 : l.t, px = mb.x1 + (mb.x2 - mb.x1) * t, py = mb.y1 + (mb.y2 - mb.y1) * t;
      loadM += (l.M || 0) + (px - O.x) * (l.Fy || 0) - (py - O.y) * (l.Fx || 0);
      Wy += l.Fy || 0; Wyx += (l.Fy || 0) * (px - O.x);
      return;
    }
    const ta = l.t1 == null ? 0 : l.t1, tb = l.t2 == null ? 1 : l.t2;
    if (tb - ta < 1e-9) return;
    const wa = l.w || 0, wb = (l.w2 == null ? l.w : l.w2) || 0, len = (tb - ta) * mb.L;
    // exact moment of a linear patch: (P0 × d)·∫w + (u × d)·∫w·ξ, with ξ measured along the patch
    const P0 = { x: mb.x1 + (mb.x2 - mb.x1) * ta - O.x, y: mb.y1 + (mb.y2 - mb.y1) * ta - O.y };
    const u = { x: mb.c, y: mb.s }, d = l.dir === "grav" ? { x: 0, y: -1 } : { x: -mb.s, y: mb.c };
    const cross = (a, b) => a.x * b.y - a.y * b.x;
    loadM += cross(P0, d) * (wa + wb) / 2 * len + cross(u, d) * len * len * (wa + 2 * wb) / 6;
    Wy += d.y * (wa + wb) / 2 * len; Wyx += d.y * (P0.x * (wa + wb) / 2 * len + u.x * len * len * (wa + 2 * wb) / 6);
  });
  // where the vertical load acts, and the split two supports would take by lever arms alone
  const xbar = Math.abs(Wy) > 1e-9 ? Wyx / Wy : null;
  const vs = sup.filter(q => Math.abs(q.Ry) > 1e-6);
  let lever = null;
  if (xbar != null && vs.length === 2 && Math.abs(vs[1].x - vs[0].x) > 1e-9) {
    const [p, q] = vs[0].x <= vs[1].x ? vs : [vs[1], vs[0]];
    const Rq = totalDown * (xbar - p.x) / (q.x - p.x);
    lever = { [p.node]: totalDown - Rq, [q.node]: Rq };
  }
  const reacTerms = rcs.map(r => ({ node: r.node, fromRy: (N[r.node].x - O.x) * r.Ry, fromRx: -(N[r.node].y - O.y) * r.Rx, M: r.M }));
  const sumM = loadM + reacTerms.reduce((s, t) => s + t.fromRy + t.fromRx + t.M, 0);
  return {
    sumFx: res.appliedFx, sumFy: res.appliedFy, reacFx: res.reacFx, reacFy: res.reacFy, totalDown,
    supports: sup, split, about: O.id, loadM, reacTerms, sumM, xbar, lever,
  };
}
