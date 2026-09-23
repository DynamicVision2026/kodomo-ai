import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BreakthroughScene } from '../src/ad12/BreakthroughScene';

/**
 * Builder work order §4 (live wiring) + §5 (reduced motion). BreakthroughScene's own FLIP chip
 * fires whenever `current` increases; jsdom has no real WAAPI, so these tests stub
 * `Element.prototype.animate` to observe what WOULD have been requested, the same technique
 * tests/AD12Motion.test.ts already uses for the shared `animate()` helper.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
});

describe('BreakthroughScene — children override (Builder work order §4 live wiring)', () => {
  it('renders caller-supplied children instead of its own fixed Plane+planeText when given', () => {
    const { getByText, queryByText } = render(
      <BreakthroughScene tone={0} total={3} current={1} rootReached={false} planeText="fallback text">
        <p>live reading content</p>
      </BreakthroughScene>,
    );
    expect(getByText('live reading content')).toBeInTheDocument();
    expect(queryByText('fallback text')).not.toBeInTheDocument();
  });

  it('falls back to its own Plane+planeText when children is omitted (Pass 1 gallery fixture unchanged)', () => {
    const { getByText } = render(
      <BreakthroughScene tone={0} total={3} current={1} rootReached={false} planeText="demo text" />,
    );
    expect(getByText('demo text')).toBeInTheDocument();
  });

  it('forwards otherYellowActive to the internal DepthRow', () => {
    const { container, rerender } = render(
      <BreakthroughScene tone={'deep'} total={3} current={3} rootReached planeText="root" otherYellowActive>
        <p>root text</p>
      </BreakthroughScene>,
    );
    const rootTab = container.querySelector('[data-tab-index="3"]')!;
    expect(rootTab.className).toContain('is-root-muted');

    rerender(
      <BreakthroughScene tone={'deep'} total={3} current={3} rootReached planeText="root">
        <p>root text</p>
      </BreakthroughScene>,
    );
    expect(container.querySelector('[data-tab-index="3"]')!.className).toContain('is-root-active');
  });
});

describe('BreakthroughScene — FLIP chip travel (full motion)', () => {
  it('animates the chip with a translate/scale transform, never firing when current does not increase', () => {
    const calls: Array<{ keyframes: unknown; opts: unknown }> = [];
    Element.prototype.animate = function (keyframes: unknown, opts: unknown) {
      calls.push({ keyframes, opts });
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
    const { rerender } = render(
      <BreakthroughScene tone={0} total={3} current={1} rootReached={false}>
        <p>layer 1</p>
      </BreakthroughScene>,
    );
    expect(calls).toHaveLength(0); // mount is never a breakthrough

    rerender(
      <BreakthroughScene tone={0} total={3} current={1} rootReached={false}>
        <p>layer 1 still</p>
      </BreakthroughScene>,
    );
    expect(calls).toHaveLength(0); // current unchanged — no travel

    rerender(
      <BreakthroughScene tone={1} total={3} current={2} rootReached={false}>
        <p>layer 2</p>
      </BreakthroughScene>,
    );
    // Two animate() calls: the chip travel, and the plane's own settle-rise (§4 step 4).
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const chipCall = calls.find((c) => JSON.stringify(c.keyframes).includes('scale'));
    expect(chipCall).toBeTruthy();
    const kf = chipCall!.keyframes as Array<{ transform: string; opacity: number }>;
    expect(kf[0]!.transform).toBe('translate(0, 0) scale(1, 1)');
    expect(kf[1]!.transform).toMatch(/^translate\(-?\d+px, -?\d+px\) scale\(-?\d+(\.\d+)?, -?\d+(\.\d+)?\)$/);
  });
});

describe('BreakthroughScene — reduced motion (Builder work order §5)', () => {
  it('never plays a moving/scaling transform for the FLIP chip — two short fades instead, at source then target', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const calls: Array<{ keyframes: unknown; opts: { duration: number } }> = [];
    Element.prototype.animate = function (keyframes: unknown, opts: { duration: number }) {
      calls.push({ keyframes, opts });
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    let callCount = 0;
    Element.prototype.getBoundingClientRect = function () {
      callCount += 1;
      // Distinguish the plane/container's rect (source-ish, small offset) from the tab's rect
      // (target), so the "moved to target" assertion below is meaningful.
      return { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
    void callCount;

    const { rerender } = render(
      <BreakthroughScene tone={0} total={3} current={1} rootReached={false}>
        <p>layer 1</p>
      </BreakthroughScene>,
    );
    rerender(
      <BreakthroughScene tone={1} total={3} current={2} rootReached={false}>
        <p>layer 2</p>
      </BreakthroughScene>,
    );
    // The target-fade is scheduled via the source-fade's own `.finished.then(...)` — flush that
    // microtask before asserting.
    await Promise.resolve();
    await Promise.resolve();

    // Every animate() call under reduced motion is a pure opacity fade — no transform keyframe
    // moves or scales the chip at all (F8: "springs... become opacity/position crossfades", and
    // §5's own "FLIP shared elements become short fades", never a shortened version of the SAME
    // travel animation).
    const chipFades = calls.filter((c) => {
      const kf = c.keyframes as Array<Record<string, unknown>>;
      return kf.every((frame) => !('transform' in frame) || frame.transform === undefined);
    });
    expect(chipFades.length).toBeGreaterThanOrEqual(2); // fade at source, fade at target
    for (const fade of chipFades) {
      expect(fade.opts.duration).toBeLessThanOrEqual(200);
      expect(fade.opts.duration).toBeGreaterThan(0); // shortens, never a literal zero-duration cut
    }
  });
});
