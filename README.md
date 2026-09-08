# Structural Lab

Interactive **beam, plane frame, truss and arch** analysis in the browser — built to develop intuition for how structures actually behave, rather than just to produce numbers.

Change a support, add a hinge, stiffen a member, settle a foundation, and watch the bending moment, shear, axial force and deflected shape update instantly.

Built as revision support for the **IStructE Structural Behaviour Exam**, but it works as a general-purpose teaching and checking tool.

---

## Why this exists

Most free analysis tools give you an answer. The point here is the **why**: every model carries a live `Verify` panel that works through determinacy, global equilibrium, reactions, member end actions and the governing results in plain language — the way you would defend the result in a viva.

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

**Structure types** — four tabs across the top:

- **Beam** — its own dedicated 1D solver with a fully narrated hand-solve: reactions worked by taking moments, a left-to-right walk building the shear diagram, the bending diagram explained through V = dM/dx, deflection from curvature = M/EI, three independent checks, and a closed-form textbook cross-check that shows *hand vs engine* side by side. Supports internal hinges (Gerber beams), continuous spans, overhangs and applied couples.
- **Frame** — plane frames with per-member stiffness, internal hinges, settlement and springs.
- **Truss** — pin-jointed, with tension/compression colouring and zero-force detection.
- **Arch** — live generator (span, rise, profile, springings, optional crown hinge).

**Loading**
- Nodal *Fx*, *Fy*, *M*
- Member UDL — gravity or perpendicular (wind)
- **Partial UDL** over any extent of a member
- **Trapezoidal and triangular** distributed loads
- Point load anywhere along a member
- **Point moment** on a member
- **Support settlement** as a load case

**Supports** — fixed, pin, roller (vertical or horizontal), guided, **elastic springs** (*k*ᵧ, *k*ᵣ), and **imposed settlement**.

**Members** — per-member **EI** and **EA** (relative stiffness studies), and **moment releases at either end** for internal hinges, three-pinned frames and Gerber beams.

**Output** — axial *N*, shear *V*, moment *M* plotted on the tension face, exaggerated deflected shape over the original, reactions, determinacy, member end-action table and a stiffness / distribution-factor table.

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
npm test         # run the verification suite (no browser needed)
npm run build    # production build into dist/
npm run preview  # serve the production build locally
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

The solver is not trusted on the basis that it looks right. `npm test` runs **142 checks** against independent closed-form solutions, hand methods and equilibrium invariants, and exits non-zero on any failure (so CI fails loudly).

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
| Support settlement (fixed–fixed) | *M* = 6*EI*Δ/*L*², *V* = 12*EI*Δ/*L*³ |
| Support settlement (propped) | *R* = 3*EI*Δ/*L*³, *M* = 3*EI*Δ/*L*² |
| Rigid-beam portal sway | *M*base = *Hh*/4, Δ = *Hh*³/24*EI* |
| Spring support | δ = *P*/(3*EI*/*L*³ + *k*) |
| Truss (triangle, Warren) | method of joints, to 3 decimals |
| Parabolic 2-pin arch under UDL | *H* = *wL*²/8*h*, bending < 3% of *wL*²/8 |
| Determinacy bookkeeping | portal 3 → 1 → 0; releases at a pin not double-counted |

### Beam solver (68 of those checks)

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

Plus all 26 frame/truss/arch presets and all 12 beam presets solved for stability, equilibrium and shear closure, and a robustness set (missing nodes, zero-length members, coincident supports, unrestrained models, inverted load extents, uplift loads, 0.5 m and 60 m spans, 10⁶ stiffness ratios) that must never throw.

---

## Repository layout

```
engine/                 pure solvers — no React, no DOM
  beam.mjs              1D beam: direct stiffness + exact statics
                        post-processing, internal hinges,
                        plus the closed-form cross-check helpers
  frame.mjs             2D plane frame, direct stiffness
                        per-member EI/EA, end releases,
                        settlement, springs, varying loads
  truss.mjs             pin-jointed truss (axial only)
  arch.mjs              arch geometry generator
  index.mjs             public API
  test/
    closed-form.mjs     closed-form checks of the frame solver
    beam.mjs            closed-form checks of the beam solver
    verify.mjs          full suite — run by `npm test`
src/
  App.jsx               four-tab shell
  BeamLab.jsx           beam UI + narrated hand-solve
  StructuralLab.jsx     frame / truss / arch UI
  presets.js            study cases, grouped by structure type
  main.jsx              React entry point
standalone/
  BeamLab.standalone.jsx
  StructuralLab.standalone.jsx   single-file builds (see below)
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

### Standalone single files

`standalone/StructuralLab.standalone.jsx` and `standalone/BeamLab.standalone.jsx` each inline their engine into one self-contained component with no local imports — handy for pasting into a Claude artifact, CodeSandbox or any single-file playground. The modular versions under `src/` are the ones to develop against.

---

## Conventions

- Geometry: global **X** right positive, **Y** up positive, rotation **anticlockwise** positive
- Internal forces: **axial tension positive**, **bending sagging positive**
- Moments are plotted on the **tension face**
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
