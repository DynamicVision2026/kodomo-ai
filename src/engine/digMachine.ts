import type { DigCard, DigPhase } from './types';
import { advances } from './resolver';

/**
 * WO-02: the mandatory 「これでOK？」 judgment gate for a layer's hand.
 * 'gate'    — a new robot answer just arrived; the child must judge it before the hand appears.
 * 'holding' — the child judged "not enough": a pre-gap holding state, ready for WO-03 to insert
 *             Gap Naming. No follow-up card is selectable here.
 * 'open'    — the hand is visible and playable, same as pre-WO-02 behaviour.
 * Irrelevant at the root, which never has a hand to gate.
 */
export type JudgmentGate = 'gate' | 'holding' | 'open';

/**
 * Dig phase state machine. Pure and framework-free so it can be unit-tested without React.
 * Spec v0.5 §4.1: ask -> shallow answer -> probe layer by layer -> ねっこ.
 */
export interface DigState {
  layer: number;                 // index into phase.layers
  atRoot: boolean;
  /** Non-advancing attempts, per layer. Drives 「おしい！」 nudges, never a score. */
  misses: number[];
  /** Flat reply currently on screen, if the last card did not advance. */
  flatReply: string | null;
  /** Challenge shown after tapping 「これでOK」 early. */
  challenge: { challenger: string; asks: string } | null;
  finished: boolean;
  /** WO-02 judgment gate for the current layer. See `JudgmentGate`. */
  gate: JudgmentGate;
}

export function initDig(phase: DigPhase): DigState {
  if (phase.layers.length === 0) throw new Error('A dig phase needs at least one layer.');
  return {
    layer: 0,
    atRoot: false,
    misses: phase.layers.map(() => 0),
    flatReply: null,
    challenge: null,
    finished: false,
    gate: 'gate',
  };
}

/** Blocked entirely until the current layer's judgment gate is 'open' (WO-02, R05). */
export function playCard(phase: DigPhase, state: DigState, card: DigCard): DigState {
  if (state.finished || state.gate !== 'open') return state;
  const cleared = { ...state, challenge: null };

  if (!advances(card.tag)) {
    const misses = [...cleared.misses];
    misses[cleared.layer] = (misses[cleared.layer] ?? 0) + 1;
    return {
      ...cleared,
      misses,
      flatReply: phase.layers[cleared.layer]?.replies[card.tag] ?? null,
    };
  }

  const next = cleared.layer + 1;
  if (next >= phase.layers.length) {
    return { ...cleared, atRoot: true, flatReply: null, finished: true };
  }
  return { ...cleared, layer: next, flatReply: null, gate: 'gate' };
}

/**
 * WO-02: the child judges the current answer "not enough" — the mandatory step before a
 * follow-up card can be played. Moves into the pre-gap holding state; no-op unless the gate is
 * currently open for judgment (already resolved, mid-challenge, finished, or at the root, which
 * has no hand to gate).
 */
export function judgeNotEnough(state: DigState): DigState {
  if (state.finished || state.atRoot || state.gate !== 'gate') return state;
  return { ...state, gate: 'holding' };
}

/**
 * WO-02: leaves the pre-gap holding state and reveals the current layer's hand. A temporary,
 * neutral placeholder for the step WO-03's Gap Naming will replace.
 */
export function continueFromHolding(state: DigState): DigState {
  if (state.finished || state.atRoot || state.gate !== 'holding') return state;
  return { ...state, gate: 'open' };
}

/** 「これでOK」 — always available, never blocked by the judgment gate. Returns the challenge,
 *  or finishes at the root. */
export function tapEarlyOk(phase: DigPhase, state: DigState): DigState {
  if (state.atRoot) return { ...state, finished: true };
  const early = phase.layers[state.layer]?.earlyOk;
  if (!early) return { ...state, finished: true };
  return { ...state, challenge: early, flatReply: null };
}

/** Depth meter: 1-indexed current depth and the total including the root. */
export function depth(phase: DigPhase, state: DigState): { current: number; total: number } {
  return {
    current: state.atRoot ? phase.layers.length + 1 : state.layer + 1,
    total: phase.layers.length + 1,
  };
}

/** What ロボ is currently saying. */
export function currentAnswer(phase: DigPhase, state: DigState): string {
  if (state.atRoot) return phase.root.robotSays;
  return phase.layers[state.layer]?.robotSays ?? '';
}
