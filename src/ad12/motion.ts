/**
 * AD-12 §3/F8 — the one place every src/ad12/ component reads "should this animate, and for how
 * long" from. Nothing here decides WHAT animates (that's each component's own concern); this is
 * only the reduced-motion switch and a thin Web Animations API wrapper so every component uses
 * the same fallback behaviour rather than each re-implementing its own media-query check.
 */

/** True in a real browser with `prefers-reduced-motion: reduce`; false in any environment
 *  without `matchMedia` (SSR, some test runners) — never throws either way. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface AnimateOptions {
  /** Full-motion duration (ms) — one of tokens.css's own --ad12-t-* values, in ms. */
  duration: number;
  /** F8: under reduced motion, a short (150-200ms) opacity/position crossfade instead — never
   *  zero-duration (motion doesn't vanish, it shortens). Defaults to --ad12-t-reduced (180ms). */
  reducedDuration?: number;
  easing?: string;
  /** Start delay (ms), e.g. a slip cascade's per-item stagger (--ad12-t-stagger). Dropped to 0
   *  under reduced motion — a staggered entrance still respects "shorten, don't remove" for its
   *  own duration, but stacking N delays on top of that on a Chromebook the child is anxiously
   *  waiting on is exactly the drawn-out motion reduced-motion exists to skip. */
  delay?: number;
}

/**
 * Plays `keyframes` on `el` via the real Web Animations API, respecting prefers-reduced-motion
 * by shortening (never skipping) the duration — F8's own "springs... become 150-200ms opacity
 * and position crossfades" contract, applied once, generically, instead of per component. Returns
 * `undefined` (a no-op) in an environment with no `Element.prototype.animate` (some older
 * embedded webviews, and every current jsdom-based unit test) — callers must not depend on the
 * returned Animation for correctness, only for optional cleanup/await.
 */
export function animate(
  el: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  { duration, reducedDuration = 180, easing = 'ease-out', delay = 0 }: AnimateOptions,
): Animation | undefined {
  if (typeof el.animate !== 'function') return undefined;
  const reduced = prefersReducedMotion();
  return el.animate(keyframes, {
    duration: reduced ? reducedDuration : duration,
    delay: reduced ? 0 : delay,
    easing,
    fill: 'forwards',
  });
}

/** FLIP (First/Last/Invert/Play): capture an element's rect BEFORE a layout-changing update
 *  (call this in the event handler, before the state change that will move/resize it), then
 *  call `playFlip` after the update commits (from a `useLayoutEffect` keyed on the same trigger)
 *  with the same rect — it reads the element's NEW rect itself, computes the delta, and plays
 *  the inverted transform back to identity, so the element appears to travel smoothly from
 *  where it WAS to where it now IS rather than jump-cutting. */
export function captureRect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

/** Reads a numeric ms duration off a CSS custom property (e.g. `--ad12-t-settle: 450ms;`) rather
 *  than letting each component re-type the same number — `tokens.css`'s own timing tokens stay
 *  the single source of truth for JS-driven animations too. Reads from `el` (falls back to the
 *  document root) so a component nested under an override still picks up the right value; returns
 *  `fallback` for any value it can't parse (SSR, jsdom without the stylesheet loaded, a typo'd
 *  var name) rather than throwing. */
export function tokenMs(varName: string, fallback: number, el?: Element): number {
  const target = el ?? (typeof document === 'undefined' ? undefined : document.documentElement);
  if (!target || typeof getComputedStyle !== 'function') return fallback;
  try {
    const raw = getComputedStyle(target).getPropertyValue(varName).trim();
    const ms = raw.endsWith('ms') ? parseFloat(raw) : raw.endsWith('s') ? parseFloat(raw) * 1000 : parseFloat(raw);
    return Number.isFinite(ms) ? ms : fallback;
  } catch {
    return fallback;
  }
}

export function playFlip(el: Element, first: DOMRect, opts: AnimateOptions): Animation | undefined {
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / (last.width || 1);
  const sy = first.height / (last.height || 1);
  if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return undefined; // nothing moved — no-op
  return animate(
    el,
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 1 },
      { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
    ],
    opts,
  );
}
