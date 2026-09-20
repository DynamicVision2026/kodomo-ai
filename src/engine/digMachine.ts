import type { DigCard, DigPhase, DigLayer, GapDistractorKind } from './types';
import { advances } from './resolver';

/**
 * WO-02/WO-03: the mandatory 「これでOK？」 judgment gate for a layer's hand.
 * 'gate'      — a new robot answer just arrived; the child must judge it before the hand appears.
 * 'gapNaming' — the child judged "not enough": AD-01's Gap Naming choice is up. No follow-up
 *               card is selectable here.
 * 'open'      — the hand is visible and playable, same as pre-WO-02 behaviour.
 * Irrelevant at the root, which never has a hand to gate.
 */
export type JudgmentGate = 'gate' | 'gapNaming' | 'open';

/** AD-01: one option in a Gap Naming presentation — the target gap, or one of its distractors. */
export interface GapChoice {
  text: string;
  kind: 'target' | GapDistractorKind;
}

/**
 * AD-01 §5: choice set = [gap, ...gapDistractors], shuffled per presentation. `rng` is injectable
 * so tests can assert against a known order; production code takes the Math.random default.
 */
export function buildGapChoices(layer: DigLayer, rng: () => number = Math.random): GapChoice[] {
  const distractors = layer.gapDistractors;
  if (!layer.gap || !distractors) {
    throw new Error('buildGapChoices requires both gap and gapDistractors on this layer.');
  }
  const choices: GapChoice[] = [
    { text: layer.gap, kind: 'target' },
    { text: distractors[0].text, kind: distractors[0].kind },
    { text: distractors[1].text, kind: distractors[1].kind },
  ];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [choices[i], choices[j]] = [choices[j]!, choices[i]!];
  }
  return choices;
}

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
  /** WO-02/WO-03 judgment gate for the current layer. See `JudgmentGate`. */
  gate: JudgmentGate;
  /** The current layer's Gap Naming choice set, fixed for this presentation. Set on entering
   *  'gapNaming', cleared once resolved or once the layer changes. */
  gapChoices: GapChoice[] | null;
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
    gapChoices: null,
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
  return { ...cleared, layer: next, flatReply: null, gate: 'gate', gapChoices: null };
}

/**
 * The child judges the current answer "not enough" — the mandatory step before a follow-up card
 * can be played. Builds this presentation's shuffled Gap Naming choice set (AD-01 §5) and moves
 * into it; no-op unless the gate is currently closed for judgment (already resolved, mid-
 * challenge, finished, or at the root, which has no hand to gate).
 */
export function judgeNotEnough(phase: DigPhase, state: DigState, rng?: () => number): DigState {
  if (state.finished || state.atRoot || state.gate !== 'gate') return state;
  const layer = phase.layers[state.layer];
  if (!layer?.gap || !layer.gapDistractors) return state;
  return { ...state, gate: 'gapNaming', gapChoices: buildGapChoices(layer, rng) };
}

/**
 * AD-01 §5: the child names a gap — target or distractor, no distinction in outcome. Reveals the
 * hand unchanged and unfiltered; the caller is responsible for recording `gap_named` with the
 * choice's `kind` (digMachine stays framework-free and makes no analytics calls itself).
 */
export function chooseGap(state: DigState): DigState {
  if (state.finished || state.atRoot || state.gate !== 'gapNaming') return state;
  return { ...state, gate: 'open', gapChoices: null };
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
