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

  it('an explicit `variant` is a fully static snapshot — pointer events never move it', () => {
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
