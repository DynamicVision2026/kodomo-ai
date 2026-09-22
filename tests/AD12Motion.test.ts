import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefersReducedMotion, animate, tokenMs, captureRect, playFlip } from '../src/ad12/motion';

/**
 * AD-12 §3/F8 — motion.ts is the one place every src/ad12/ component reads "should this animate,
 * and for how long" from. jsdom has no real Web Animations API (`Element.prototype.animate` is
 * undefined), which `animate()` itself already treats as a safe no-op — so these tests stub
 * `Element.prototype.animate` where they need to observe what WOULD have been requested (the
 * effective duration/delay/keyframes), the same technique a consumer never has to know about.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
});

describe('prefersReducedMotion', () => {
  it('is false with no matchMedia at all (jsdom default) — never throws', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reflects a real matchMedia that reports prefers-reduced-motion: reduce', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when matchMedia reports no match', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it('never throws even if matchMedia itself throws', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('boom');
    });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('animate — F8: shortens, never skips, and drops stagger delay under reduced motion', () => {
  it('returns undefined (a no-op) when the element has no real animate() — e.g. jsdom itself', () => {
    const el = document.createElement('div');
    expect(animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 })).toBeUndefined();
  });

  it('full motion: uses the given duration and delay verbatim', () => {
    const calls: unknown[] = [];
    Element.prototype.animate = function (kf: unknown, opts: unknown) {
      calls.push(opts);
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    const el = document.createElement('div');
    animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 140 });
    expect(calls).toEqual([{ duration: 700, delay: 140, easing: 'ease-out', fill: 'forwards' }]);
  });

  it('reduced motion: duration drops to reducedDuration (default 180ms) and delay collapses to 0', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const calls: unknown[] = [];
    Element.prototype.animate = function (kf: unknown, opts: unknown) {
      calls.push(opts);
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    const el = document.createElement('div');
    animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 140 });
    expect(calls).toEqual([{ duration: 180, delay: 0, easing: 'ease-out', fill: 'forwards' }]);
  });

  it('reduced motion never drops to a literal zero-duration crossfade — it shortens, not removes', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const calls: Array<{ duration: number }> = [];
    Element.prototype.animate = function (kf: unknown, opts: { duration: number }) {
      calls.push(opts);
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    const el = document.createElement('div');
    animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    expect(calls[0]!.duration).toBeGreaterThan(0);
  });
});

describe('tokenMs', () => {
  it('reads a real ms-valued CSS custom property off the element', () => {
    const el = document.createElement('div');
    el.style.setProperty('--x', '450ms');
    document.body.appendChild(el);
    expect(tokenMs('--x', 999, el)).toBe(450);
    el.remove();
  });

  it('reads a plain-seconds value and converts to ms', () => {
    const el = document.createElement('div');
    el.style.setProperty('--x', '0.7s');
    document.body.appendChild(el);
    expect(tokenMs('--x', 999, el)).toBe(700);
    el.remove();
  });

  it('falls back when the variable is not set at all', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(tokenMs('--nope', 123, el)).toBe(123);
    el.remove();
  });
});

describe('playFlip — First/Last/Invert/Play', () => {
  function rect(overrides: Partial<DOMRect>): DOMRect {
    return { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON() {}, ...overrides };
  }

  it('is a no-op (returns undefined, never calls animate) when nothing moved', () => {
    const el = document.createElement('div');
    let called = false;
    Element.prototype.animate = function () {
      called = true;
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    el.getBoundingClientRect = () => rect({});
    const first = rect({});
    expect(playFlip(el, first, { duration: 700 })).toBeUndefined();
    expect(called).toBe(false);
  });

  it('inverts the delta between the first and last rect into the opening keyframe', () => {
    const el = document.createElement('div');
    const seenKeyframes: unknown[] = [];
    Element.prototype.animate = function (kf: unknown) {
      seenKeyframes.push(kf);
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    // First: a small plane at (0,0), 20x20. Last (el's current rect): moved/grown to (50,10), 40x20.
    el.getBoundingClientRect = () => rect({ left: 50, top: 10, width: 40, height: 20 });
    const first = rect({ left: 0, top: 0, width: 20, height: 20 });
    playFlip(el, first, { duration: 700 });
    expect(seenKeyframes[0]).toEqual([
      { transform: 'translate(-50px, -10px) scale(0.5, 1)', opacity: 1 },
      { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
    ]);
  });
});
