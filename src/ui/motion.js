import { useEffect, useRef, useState } from "react";

/* Motion helpers shared by the labs. Everything respects the reader's
   "reduce motion" setting: animations collapse to their final frame. */

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// easeOutBack: overshoots a touch, then settles — diagrams "spring" out of their axis
const springy = k => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

/** 0 → 1 (with a little overshoot) every time `trigger` changes. */
export function useGrow(trigger, ms = 720) {
  const [p, setP] = useState(prefersReducedMotion() ? 1 : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setP(1); return undefined; }
    let raf, t0 = null;
    const step = t => {
      if (t0 === null) t0 = t;
      const k = Math.min(1, (t - t0) / ms);
      setP(springy(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setP(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [trigger, ms]);
  return p;
}

/** While `on`, cycles 0 → 1 → 0 (load applied and removed); otherwise 1. */
export function useCycle(on, period = 2600) {
  const [p, setP] = useState(1);
  const live = useRef(on);
  live.current = on;
  useEffect(() => {
    if (!on || prefersReducedMotion()) { setP(1); return undefined; }
    let raf;
    const t0 = performance.now();
    const step = t => {
      if (!live.current) return;
      const ph = ((t - t0) % period) / period;
      setP((1 - Math.cos(2 * Math.PI * ph)) / 2);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, period]);
  return p;
}

/** Keyframes the lab stylesheets share (prefix sl- to stay out of the way). */
export const KEYFRAMES = `
@keyframes sl-pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
@keyframes sl-drop{0%{transform:translateY(-14px);opacity:0}70%{transform:translateY(2px);opacity:1}100%{transform:translateY(0)}}
@keyframes sl-stamp{0%{transform:scale(1.9) rotate(-14deg);opacity:0}55%{transform:scale(.92) rotate(-1deg);opacity:1}100%{transform:scale(1) rotate(-2.5deg)}}
@keyframes sl-rise{0%{transform:translateY(8px);opacity:0}100%{transform:translateY(0);opacity:1}}
@keyframes sl-shimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes sl-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.sl-pop{animation:sl-pop .5s cubic-bezier(.3,1.4,.5,1) both;transform-box:fill-box;transform-origin:center}
.sl-drop{animation:sl-drop .45s ease-out both}
.sl-rise{animation:sl-rise .35s ease-out both}
@media (prefers-reduced-motion: reduce){.sl-pop,.sl-drop,.sl-rise{animation:none}}
`;
