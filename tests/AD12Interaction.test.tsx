import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MoveCard } from '../src/ad12/MoveCard';
import { JudgeBar } from '../src/ad12/JudgeBar';

afterEach(() => cleanup());

/**
 * Pass 2 — F4's commit semantics ("pressing down only compresses; releasing inside commits, and
 * the event fires exactly once; sliding off cancels and nothing is recorded") now have to hold
 * for a genuinely interactive component, not just a caller-supplied static `variant`. jsdom has
 * no Web Animations API, so `animate()` inside these components silently no-ops (see
 * AD12Motion.test.ts) — these tests only need the React state/class-swap side, which runs either
 * way; the animation itself is covered separately at the motion.ts level.
 */
describe('MoveCard — real pointer-driven grammar (F4)', () => {
  it('starts at rest and compresses on pointerdown', () => {
    render(<MoveCard text="x" />);
    const btn = screen.getByText('x').closest('button')!;
    expect(btn.className).toContain('ad12-move-card--rest');
    fireEvent.pointerDown(btn);
    expect(btn.className).toContain('ad12-move-card--pressed');
  });

  it('sliding off after pointerdown returns to rest and records nothing', () => {
    const onCommit = vi.fn();
    render(<MoveCard text="x" onCommit={onCommit} />);
    const btn = screen.getByText('x').closest('button')!;
    fireEvent.pointerDown(btn);
    fireEvent.pointerLeave(btn);
    expect(btn.className).toContain('ad12-move-card--rest');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a pointercancel (e.g. a scroll interrupting a touch) also cancels, same as sliding off', () => {
    const onCommit = vi.fn();
    render(<MoveCard text="x" onCommit={onCommit} />);
    const btn = screen.getByText('x').closest('button')!;
    fireEvent.pointerDown(btn);
    fireEvent.pointerCancel(btn);
    expect(btn.className).toContain('ad12-move-card--rest');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a click (release inside) commits exactly once, even if clicked again afterwards', () => {
    const onCommit = vi.fn();
    render(<MoveCard text="x" onCommit={onCommit} />);
    const btn = screen.getByText('x').closest('button')!;
    fireEvent.pointerDown(btn);
    fireEvent.click(btn);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(btn.className).toContain('ad12-move-card--committed');
    fireEvent.click(btn);
    expect(onCommit).toHaveBeenCalledTimes(1); // F4: fires exactly once, not once per click
  });

  it('an explicit `variant` without `live` is a fully static snapshot — pointer events never move it', () => {
    const onCommit = vi.fn();
    render(<MoveCard text="x" variant="rest" onCommit={onCommit} />);
    const btn = screen.getByText('x').closest('button')!;
    fireEvent.pointerDown(btn);
    expect(btn.className).toContain('ad12-move-card--rest');
    // A click still forwards straight to onCommit in this mode (same as the pre-Pass-2 API) —
    // static-mode callers driving their own fixture state, e.g. the gallery, are unaffected.
    fireEvent.click(btn);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  /**
   * Builder work order §2 (AD-12 completion — live wiring): a `live` card real-pointer-drives its
   * commit grammar even though `variant` is ALSO supplied (MissionStage's own post-commit "drive
   * to soil then settle" choreography) — the two concerns must stay independent.
   */
  describe('MoveCard — `live` (variant supplied, real pointer grammar still drives the commit)', () => {
    it('pointerdown presses the card even though its caller-supplied variant is "rest" — one commit per tap', () => {
      const onCommit = vi.fn();
      render(<MoveCard text="x" variant="rest" live onCommit={onCommit} />);
      const btn = screen.getByText('x').closest('button')!;
      expect(btn.className).toContain('ad12-move-card--rest');
      fireEvent.pointerDown(btn);
      expect(btn.className).toContain('ad12-move-card--pressed'); // real press-scale, not the static variant
      fireEvent.click(btn); // pointerup inside — commits
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('sliding off after pointerdown (before release) records nothing', () => {
      const onCommit = vi.fn();
      render(<MoveCard text="x" variant="rest" live onCommit={onCommit} />);
      const btn = screen.getByText('x').closest('button')!;
      fireEvent.pointerDown(btn);
      expect(btn.className).toContain('ad12-move-card--pressed');
      fireEvent.pointerLeave(btn); // slide off — no click ever follows
      expect(btn.className).toContain('ad12-move-card--rest'); // springs back to the caller's own variant
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('a pointercancel (e.g. a scroll interrupting a touch) also cancels, records nothing', () => {
      const onCommit = vi.fn();
      render(<MoveCard text="x" variant="rest" live onCommit={onCommit} />);
      const btn = screen.getByText('x').closest('button')!;
      fireEvent.pointerDown(btn);
      fireEvent.pointerCancel(btn);
      expect(btn.className).toContain('ad12-move-card--rest');
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('a double tap (two clicks) records the move exactly once', () => {
      const onCommit = vi.fn();
      render(<MoveCard text="x" variant="rest" live onCommit={onCommit} />);
      const btn = screen.getByText('x').closest('button')!;
      fireEvent.pointerDown(btn);
      fireEvent.click(btn);
      fireEvent.click(btn); // a second, immediate tap on the same still-rendered card
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('the caller-supplied variant still governs the visual once real pointer press has released, and post-commit', () => {
      const onCommit = vi.fn();
      const { rerender } = render(<MoveCard text="x" variant="magnified" live onCommit={onCommit} />);
      const btn = screen.getByText('x').closest('button')!;
      // No press in progress: the caller's own post-commit choreography variant shows through.
      expect(btn.className).toContain('ad12-move-card--magnified');
      fireEvent.click(btn); // commits once, via real grammar
      expect(onCommit).toHaveBeenCalledTimes(1);
      rerender(<MoveCard text="x" variant="committed" live onCommit={onCommit} />);
      expect(btn.className).toContain('ad12-move-card--committed');
    });

    it('keyboard activation (native button click, e.g. Enter/Space) commits exactly once', () => {
      const onCommit = vi.fn();
      render(<MoveCard text="x" variant="rest" live onCommit={onCommit} />);
      const btn = screen.getByText('x').closest('button')!;
      // A native <button> dispatches `click` on Enter/Space without a preceding pointerdown —
      // exercised directly here (jsdom's own keyboard-activation simulation is unreliable), the
      // same guarded path real pointer taps use.
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });
});

describe('JudgeBar — self-driven, one-shot commit', () => {
  it('clicking one half presses it and makes the other yield, and fires its own callback once', () => {
    const onGotIt = vi.fn();
    const onNotEnough = vi.fn();
    render(<JudgeBar gotItLabel="G" notEnoughLabel="N" onGotIt={onGotIt} onNotEnough={onNotEnough} />);
    const gotIt = screen.getByText('G');
    const notEnough = screen.getByText('N');
    fireEvent.click(gotIt);
    expect(gotIt.className).toContain('is-pressed');
    expect(notEnough.className).toContain('is-yielding');
    expect(onGotIt).toHaveBeenCalledTimes(1);
    expect(onNotEnough).not.toHaveBeenCalled();
  });

  it('is a one-shot gate — clicking the other half afterwards does not flip the choice', () => {
    render(<JudgeBar gotItLabel="G" notEnoughLabel="N" />);
    const gotIt = screen.getByText('G');
    const notEnough = screen.getByText('N');
    fireEvent.click(gotIt);
    fireEvent.click(notEnough);
    expect(gotIt.className).toContain('is-pressed');
    expect(notEnough.className).toContain('is-yielding');
  });

  it('a controlled `pressed` prop freezes the visual state — clicks still fire callbacks but never move the bar', () => {
    const onGotIt = vi.fn();
    render(<JudgeBar gotItLabel="G" notEnoughLabel="N" pressed="notEnough" onGotIt={onGotIt} />);
    fireEvent.click(screen.getByText('G'));
    expect(screen.getByText('G').className).not.toContain('is-pressed');
    expect(screen.getByText('N').className).toContain('is-pressed');
    expect(onGotIt).toHaveBeenCalledTimes(1);
  });
});
