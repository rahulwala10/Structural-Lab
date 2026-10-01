# Structural Lab

Interactive **beam, plane frame, truss and arch** analysis in the browser — built to develop intuition for how structures actually behave, rather than just to produce numbers.

Change a support, drag a load, slide a hinge along a member, stiffen a member, settle a foundation, and watch the bending moment, shear, axial force and deflected shape update instantly.

Built as revision support for the **IStructE Structural Behaviour Exam**, but it works as a general-purpose teaching and checking tool. A **Practice** tab deals out endless exam-style beam and frame questions with a scratch pad to sketch on — and a small hard-hatted I-beam who dances when you get everything right.

---

## Why this exists

Most free analysis tools give you an answer. The point here is the **why**: every model carries a live `Verify` panel that works through determinacy, global equilibrium, reactions, member end actions and the governing results in plain language — the way you would defend the result in a viva. It explains **how each value arises**: what share of the load each support takes and why, where the shear passes through zero, and how every key moment builds up from the free (simply supported) diagram hung from the line between the end moments.

And because the exam is about sketching *before* calculating, any beam or frame can be turned into a quiz: **Test yourself** hides the answers, gives you a scratch pad, and checks your reactions, bending moment sketch and deflected shape.

The exam rewards understanding relationships, so the presets are deliberately built as **paired comparisons**:

| Compare | And notice |
|---|---|
| Beam: simply supported → propped → fixed–fixed | Peak moment falls wL²/8 → wL²/8 (hog) → wL²/12; deflection drops 5/384 → → 1/384 |
| Beam: add a hinge to a fixed–propped span | n drops to 0 — it becomes solvable by statics alone |
| Portal · fixed feet → pinned feet → 3-pinned | SI goes 3 → 1 → 0; base moment disappears, span moment grows |
| Stiff beam / weak columns → weak beam / stiff columns | Base moment moves between *Hh*/4 and *Hh*/2 |
| Sway vs no-sway | Symmetric frame + symmetric load ⇒ no sway |
| Support settlement (no applied load at all) | Moments appear from nothing — only in an indeterminate structure |
| Shallow arch vs deep arch | Thrust doubles when the rise halves: *H* = *wL*²/8*h* |

---

## Features

**Five tabs across the top:**

- **Beam** — its own dedicated 1D solver with a fully narrated hand-solve: reactions worked by taking moments (and split into a *free* share plus a *continuity* share over each span), a left-to-right walk building the shear diagram (anticlockwise shear positive), where the shear crosses zero, every key moment as a free body, the bending diagram explained through V = −dM/dx and the free BMD hung from the closing line, deflection from curvature = M/EI, three independent checks, and a closed-form textbook cross-check that shows *hand vs engine* side by side. Supports internal hinges (Gerber beams), continuous spans, overhangs and applied couples.
- **Frame** — plane frames with per-member stiffness, **internal hinges anywhere along a member**, settlement and springs.
- **Truss** — pin-jointed, with tension/compression colouring and zero-force detection.
- **Arch** — live generator (span, rise, profile, springings, optional crown hinge).
- **Practice** — random exam-style questions (below).

**Drag to edit** — everything on the canvas moves by hand, on a mouse or a touch screen:
- Beam: supports, point loads, couples, UDL ends and whole UDLs, and hinges, along the beam.
- Frame: nodes; nodal loads (drop them on another node); member point loads and couples (slide them along a member, or onto another one); UDLs (stretch either end, or slide the whole patch); and internal hinges (slide them anywhere along any member — *M* = 0 there). Positions snap to quarter and third points.
- A quick-add bar under each canvas: point load, UDL, moment, support, **○ hinge (M = 0)**.

**Reactions on the model** — three display modes: **off** (work them out yourself), **arrows** (directions only), **values** (arrows with numbers).

**Sign conventions on the diagrams** — every diagram carries a small picture of its sign convention (anticlockwise shear pair, sagging moment, tension), and Verify opens with a worked card of all of them.

**Motion** — diagrams spring out of the members when you change view or preset, reactions pop in, the determinacy stamp lands, and a **▶ load cycle** button breathes the load on and off so you can watch the structure deflect. All of it stands down if your device asks for reduced motion.

**Practice — Structural Behaviour-style questions**
- A new numbered question each time (the same number always rebuilds the same question, so you can come back to it or share it), from 16 templates across beams and frames: simply supported with overhangs, cantilevers, propped and fixed-ended beams, two-span continuous beams, Gerber beams with an internal hinge, applied couples, fixed / pinned / mixed portals under sway and gravity, three-pinned portals, linked portals, knee frames and pitched gables.
- Each asks what the exam asks: reaction directions (and values where statics gives them), **which sketch is the bending moment diagram**, **which is the deflected shape**, points of contraflexure and the governing moment. The wrong options are the diagrams of common mistakes — the hinge forgotten, a pin taken as fixed, sway ignored, continuity ignored, moments drawn on the wrong face.
- A **scratch pad** with the figure on it: pens, eraser, undo. Hints on request; **Reveal** overlays the true BMD or deflected shape on your own sketch and explains how the numbers arise.
- Full marks brings out **Beam Buddy**, who dances.
- **Open in lab** loads any question into the Beam or Frame tab to explore it live.
- The questions are generated by the app, in the spirit of qualitative-analysis practice (Brohn-style "sketch it first"); none is copied from a book or past paper.

**Loading**
- Nodal *Fx*, *Fy*, *M*
- Member UDL — gravity or perpendicular (wind)
- **Partial UDL** over any extent of a member
- **Trapezoidal and triangular** distributed loads
- Point load anywhere along a member
- **Point moment** on a member
- **Support settlement** as a load case

**Supports** — fixed, pin, roller (vertical or horizontal), guided, **elastic springs** (*k*ᵧ, *k*ᵣ), and **imposed settlement**.

**Members** — per-member **EI** and **EA** (relative stiffness studies), **moment releases at either end**, and **internal hinges at any point along a member** — for three-pinned frames, Gerber beams and hinged portals.

**Output** — axial *N*, shear *V* (anticlockwise positive), moment *M* plotted on the tension face, exaggerated deflected shape over the original, reactions, determinacy, member end-action table and a stiffness / distribution-factor table.

Works on phone, tablet and laptop: two columns collapse to one, the canvas auto-fits, and nodes are drag-editable by touch.

---

## Quick start

```bash
git clone https://github.com/<you>/structural-lab.git
cd structural-lab
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm test            # run the verification suite (no browser needed)
npm run build       # production build into dist/
npm run preview     # serve the production build locally
npm run standalone  # regenerate the single-file builds in standalone/
```

Requires Node 18+.

---

## Deploying to GitHub Pages

The repo ships a workflow that builds, tests and publishes on every push to `main`.

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The site appears at `https://<you>.github.io/<repo-name>/`.

`vite.config.js` reads `BASE_PATH`, which the workflow sets from the repository name, so the same build works locally and on Pages without editing anything.

---

## Verification

The solver is not trusted on the basis that it looks right. `npm test` runs **220 checks** against independent closed-form solutions, hand methods and equilibrium invariants — including the narrated explanations and the practice questions — and exits non-zero on any failure (so CI fails loudly).

Covered, among others:

| Check | Expected |
|---|---|
| Cantilever, tip load | *M* = *PH*, δ = *PH*³/3*EI* |
| Simply supported, UDL | *wL*²/8, 5*wL*⁴/384*EI* |
| Fixed–fixed, UDL | *wL*²/12 ends, *wL*²/24 mid |
| Propped cantilever | *wL*²/8, 5*wL*/8, 3*wL*/8 |
| Off-centre point load | *Pab*/*L* |
| Triangular load | *R* = *wL*/6 and *wL*/3, *M*ₘₐₓ = 0.0642*wL*² |
| Partial UDL (half span) | *R* = 3*wL*/8 and *wL*/8 |
| Point moment | reactions *M*₀/*L*, peak *M*₀/2 |
| Both member ends released | reverts to *wL*²/8 (simply supported) |
| Hinge at midspan, fixed ends | *M*ꜰᵢₓ = *wL*²/8, *M* = 0 at the hinge |
| Internal hinge anywhere along a member | *M* = 0 at the hinge; a hinge inside the beam of a pinned portal gives the three-pinned answer; SI drops by one per hinge |
| Support settlement (fixed–fixed) | *M* = 6*EI*Δ/*L*², *V* = 12*EI*Δ/*L*³ |
| Support settlement (propped) | *R* = 3*EI*Δ/*L*³, *M* = 3*EI*Δ/*L*² |
| Rigid-beam portal sway | *M*base = *Hh*/4, Δ = *Hh*³/24*EI* |
| Spring support | δ = *P*/(3*EI*/*L*³ + *k*) |
| Truss (triangle, Warren) | method of joints, to 3 decimals |
| Parabolic 2-pin arch under UDL | *H* = *wL*²/8*h*, bending < 3% of *wL*²/8 |
| Determinacy bookkeeping | portal 3 → 1 → 0; releases at a pin not double-counted |
| Shear sign (anticlockwise +) | SS UDL: *V* = −*wL*/2 at A, +*wL*/2 at B, even with the member drawn B→A; column with a rightward tip load *V* = −*P*; beam and frame solvers agree; *V* = −d*M*/d*s* in every member of a swaying portal |

### Beam solver (93 of those checks)

| Check | Expected |
|---|---|
| Simply supported: central / off-centre point | P/2, PL/4, PL³/48EI; Pb/L and Pab/L |
| Simply supported: UDL, triangular, part-UDL | wL²/8 & 5wL⁴/384EI; wL/6, wL/3, wL²/9√3; 3wL/8 & wL/8 |
| Simply supported: applied couple | R = ±M₀/L, M steps by −M₀ |
| Cantilever: tip, UDL, part-span, mirrored | PL & PL³/3EI; wL²/2 & wL⁴/8EI; Pa²(3L−a)/6EI |
| Propped cantilever: UDL and central point | wL²/8, 3wL/8, 5wL/8, 9wL²/128; 3PL/16, 5P/16, 5PL/32 |
| Fixed–fixed: UDL and central point | wL²/12, wL²/24, wL⁴/384EI; PL/8, PL³/192EI |
| Two equal spans continuous | wl²/8 at centre support, 1.25wl, 0.375wl, contraflexure at 0.75l |
| Overhang | hogging −wc²/2 at the inner support |
| Internal hinge (Gerber) | M = 0 at the hinge, R = wc/2, M_fix = wa²/2 + V·a |
| Mechanism detection | no support / single pin / simply supported + mid hinge |
| Self-check integrity | the in-app *hand vs engine* table flags a deliberately corrupted result |
| Shear sign (anticlockwise +) | SS UDL −wL/2 → +wL/2; cantilever V = −P fixed left, +P fixed right; a downward point load lifts V by P; V = −dM/dx on every preset; the narrated walk follows suit |

Plus all 26 frame/truss/arch presets and all 12 beam presets solved for stability, equilibrium and shear closure, and a robustness set (missing nodes, zero-length members, coincident supports, unrestrained models, inverted load extents, uplift loads, 0.5 m and 60 m spans, 10⁶ stiffness ratios) that must never throw.

### Explanations (24 checks) and practice questions (25 checks)

The narration is held to the same standard as the solver — every number it shows must rebuild the solver's answer:

| Check | Expected |
|---|---|
| Beam reaction make-up | free share + continuity share = each solver reaction, on every preset |
| Beam moment by free body | Σ(force × lever arm) left of any cut = solver *M* |
| Free BMD + closing line | *m*₀ + *M*ₐ + (*M*ᵦ − *M*ₐ)·x/l = solver *M* on every loaded span |
| Zero shear | each smooth crossing balances the load to its left; a point load makes *V* jump across zero |
| Frame members | end shear = free shear + (*M*₁ − *M*₂)/*L*; midspan *M* = free + average end moment |
| Frame joints and reactions | moments balance at every joint; ΣM about a support closes term by term; the resultant of the vertical load and the lever-arm split are exact |
| Questions | reproducible from their number; 600 generated questions all solve, offer four visibly different sketches with exactly one right, and have finite keys; grading accepts the key and 1 % slips, rejects reversed signs and blanks; Beam-tab models convert to frame form exactly |

---

## Repository layout

```
engine/                 pure solvers — no React, no DOM
  beam.mjs              1D beam: direct stiffness + exact statics
                        post-processing, internal hinges,
                        plus the closed-form cross-check helpers
  frame.mjs             2D plane frame, direct stiffness
                        per-member EI/EA, end releases, hinges
                        anywhere along a member, settlement,
                        springs, varying loads
  truss.mjs             pin-jointed truss (axial only)
  arch.mjs              arch geometry generator
  explain.mjs           how each reaction, shear and moment arises
                        (free + continuity shares, free bodies,
                        closing lines, joint balance)
  practice.mjs          exam-style question generator, sketch
                        options from common mistakes, grading
  index.mjs             public API
  test/
    closed-form.mjs     closed-form checks of the frame solver
    beam.mjs            closed-form checks of the beam solver
    explain.mjs         the explanations rebuild the solver's numbers
    practice.mjs        questions are well formed and grade fairly
    verify.mjs          full suite — run by `npm test`
src/
  App.jsx               five-tab shell
  BeamLab.jsx           beam UI + narrated hand-solve
  StructuralLab.jsx     frame / truss / arch UI
  Practice.jsx          random exam-style questions
  ui/                   scratch pad, quiz panel, model sketches,
                        sign-convention glyphs, Beam Buddy, motion
  presets.js            study cases, grouped by structure type
  main.jsx              React entry point
scripts/
  build-standalone.mjs  writes the single-file builds
standalone/             single-file builds (generated, see below)
  StructuralLabApp.standalone.jsx
  BeamLab.standalone.jsx
  StructuralLab.standalone.jsx
```

The UI imports the engine, so the tests exercise the code that actually ships.

### Using the engine on its own

```js
import { analyzeFrame } from "./engine/index.mjs";

const result = analyzeFrame({
  EI: 2e4, EA: 2e6,
  nodes:    [{ id: "A", x: 0, y: 0 }, { id: "B", x: 6, y: 0 }],
  members:  [{ id: "m", n1: "A", n2: "B" }],
  supports: [{ node: "A", type: "pin" }, { node: "B", type: "rollerV" }],
  loads:    [{ type: "udl", member: "m", w: 12, dir: "grav" }],
});

result.Mmax;        // 54  ->  wL²/8
result.dmax * 1000; // 10.125 mm  ->  5wL⁴/384EI
result.eqOK;        // true — built-in equilibrium check
```

Internal hinges go in `hinges: [{ member: "m", t: 0.4 }]` — `t` is the fraction of the way along the member from its `n1` node.

### Standalone single files

`npm run standalone` bundles each entry point, engine included, into one self-contained component whose only imports are `react` and `react-dom` — handy for pasting into a Claude artifact, CodeSandbox or any single-file playground:

- `standalone/StructuralLabApp.standalone.jsx` — the whole app, Practice tab included
- `standalone/BeamLab.standalone.jsx` — the Beam lab
- `standalone/StructuralLab.standalone.jsx` — the Frame / Truss / Arch lab

They are generated: develop against `src/` and `engine/`, then re-run the script.

---

## Conventions

- Geometry: global **X** right positive, **Y** up positive, rotation **anticlockwise** positive
- Internal forces: **axial tension positive**, **bending sagging positive**, **shear anticlockwise positive**
- A positive shear pair turns a slice of member **anticlockwise** (left face pushed down, right face pushed up), so *V* = −d*M*/d*x* and *w* = d*V*/d*x* (*w* downward). On a beam, *V* at a cut is the net downward force to its left
- Moments are plotted on the **tension face** — with anticlockwise-positive shear, the shear diagram reads directly as the slope of the moment diagram as drawn
- Frame shear diagrams plot positive *V* on each member's local +*y* side (to the left looking from its *from* node to its *to* node), so above beams drawn left to right
- Loads: downward positive on beams; couples, rotations and moment reactions anticlockwise positive; reactions upward (and rightward) positive
- Each diagram's header or legend shows its convention as a small picture, so you never have to remember which way is up
- Units: kN, m, kN·m — *EI* in kN·m², *EA* in kN; deflections reported in mm

## Scope and limitations

Stated plainly, because knowing what a tool cannot do matters:

- First-order **elastic** analysis only — no P-delta or second-order effects
- Beams: constant EI along the span; no axial force or beam-column interaction
- No buckling capacity check and no plastic hinges or collapse mechanisms
- Euler–Bernoulli bending; shear deformation is neglected
- Prismatic members only — no haunches or varying section
- Supports may be rigid, sprung or settled, but **not inclined**
- 2D only

For the Structural Behaviour Exam this is the right envelope. Plastic collapse analysis is the most natural next addition.

## Licence

MIT — see [LICENSE](LICENSE).
