/**
 * Structural Lab — analysis engines.
 *
 * All solvers are pure functions with no DOM or React dependency, so they can be
 * unit-tested in Node and reused in any front end.
 *
 * Conventions
 *   Geometry : global X right +, Y up +, rotation anticlockwise +
 *   Internal : axial tension +, bending sagging +
 *   Units    : kN, m, kN·m (EI in kN·m², EA in kN)
 *
 * Note: the 2D solvers return deflections in metres; the 1D beam solver
 * returns them in metres too (the UI converts to mm for display).
 */
export { analyzeFrame, gauss } from './frame.mjs';
export { analyzeTruss } from './truss.mjs';
export { makeArch } from './arch.mjs';
export { uid } from './util.mjs';
export {
  analyzeBeam, mkProbe, detectStandard, workedStatics,
  BEAM_PRESETS, activeLoads, deriveReactions, buildShearWalk,
} from './beam.mjs';
