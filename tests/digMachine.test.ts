import { describe, it, expect } from 'vitest';
import {
  initDig, playCard, tapEarlyOk, judgeNotEnough, chooseGap, commitBlind, giveSelfReport,
  buildGapChoices, depth, currentAnswer, type DigState,
} from '../src/engine/digMachine';
import type { DigPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';

const phase = mission.phases[1] as unknown as DigPhase;
const card = (layer: number, id: string) => phase.layers[layer]!.hand.find((c) => c.id === id)!;

/** WO-02/WO-03: every layer's hand sits behind 「これでOK？」 -> Gap Naming -> hand. */
function passGate(s: DigState): DigState {
  return chooseGap(judgeNotEnough(phase, s));
}

describe('dig machine', () => {
  it('starts at layer 1 of N+1', () => {
    expect(depth(phase, initDig(phase))).toEqual({ current: 1, total: 3 });
  });

  it('starts each layer with the judgment gate closed, blocking direct follow-up play', () => {
    const s = initDig(phase);
    expect(s.gate).toBe('gate');
    // Bypass attempt: playing a card before judging is a no-op, not a state change.
    expect(playCard(phase, s, card(0, 'f1'))).toEqual(s);
  });

  describe('buildGapChoices (AD-01 §5)', () => {
    it('returns the target plus both authored distractors, shuffled', () => {
      const layer = phase.layers[0]!;
      const rng = () => 0; // no-op shuffle (Fisher-Yates with rng()===0 never swaps)
      const choices = buildGapChoices(layer, rng);
      expect(choices).toHaveLength(3);
      expect(choices.map((c) => c.kind).sort()).toEqual(['answered', 'other-layer', 'target']);
      expect(choices.find((c) => c.kind === 'target')!.text).toBe(layer.gap);
      expect(choices.find((c) => c.kind === 'answered')!.text).toBe(layer.gapDistractors![0].text);
      expect(choices.find((c) => c.kind === 'other-layer')!.text).toBe(layer.gapDistractors![1].text);
    });

    it('throws rather than silently inventing content when a layer lacks the AD-01 fields', () => {
      const bare = { robotSays: 'x', claims: [], hand: [], replies: {} };
      expect(() => buildGapChoices(bare)).toThrow();
    });
  });

  it('"not enough" reaches Gap Naming with the target and both distractor kinds, blocking direct play', () => {
    const s = judgeNotEnough(phase, initDig(phase));
    expect(s.gate).toBe('gapNaming');
    expect(s.gapChoices).toHaveLength(3);
    expect(s.gapChoices!.map((c) => c.kind).sort()).toEqual(['answered', 'other-layer', 'target']);
    expect(s.gapChoices!.find((c) => c.kind === 'target')!.text).toBe(phase.layers[0]!.gap);
    // Still blocked: Gap Naming doesn't yet expose the hand.
    expect(playCard(phase, s, card(0, 'f1'))).toEqual(s);
  });

  it('the choice set is fixed for the presentation once built (same reference, no reshuffle)', () => {
    const s = judgeNotEnough(phase, initDig(phase));
    expect(s.gapChoices).toBe(s.gapChoices);
  });

  it('naming any gap — target or distractor — produces the identical resulting state (no verdict)', () => {
    const named = judgeNotEnough(phase, initDig(phase));
    // chooseGap takes no "which choice" argument at all: the outcome cannot depend on it.
    expect(chooseGap(named)).toEqual(chooseGap(named));
    expect(chooseGap(named).gate).toBe('open');
    expect(chooseGap(named).gapChoices).toBeNull();
  });

  it('a second gap choice in the same pass is a no-op', () => {
    const opened = passGate(initDig(phase));
    expect(chooseGap(opened)).toEqual(opened);
  });

  it('passing Gap Naming opens the gate and allows play', () => {
    const s = passGate(initDig(phase));
    expect(s.gate).toBe('open');
    expect(playCard(phase, s, card(0, 'f1')).layer).toBe(1);
  });

  it('only a deepen card advances a layer', () => {
    let s = passGate(initDig(phase));
    s = playCard(phase, s, card(0, 'f2')); // offtopic
    expect(s.layer).toBe(0);
    expect(s.flatReply).toBeTruthy();
    s = playCard(phase, s, card(0, 'f3')); // repeat
    expect(s.layer).toBe(0);
    expect(s.misses[0]).toBe(2);
    s = playCard(phase, s, card(0, 'f1')); // deepen
    expect(s.layer).toBe(1);
    expect(s.flatReply).toBeNull();
    // Advancing to layer 1 re-closes the gate — it's a new robot answer.
    expect(s.gate).toBe('gate');
  });

  it('SPEC v0.5 §13: 1-1 cannot be completed with a single question', () => {
    let s = passGate(initDig(phase));
    s = playCard(phase, s, card(0, 'f1'));
    expect(s.atRoot).toBe(false); // one deepen is not enough
    s = passGate(s);
    s = playCard(phase, s, card(1, 'f4'));
    expect(s.atRoot).toBe(true);
    expect(currentAnswer(phase, s)).toBe(phase.root.robotSays);
  });

  it('early OK is always available and returns a challenge instead of blocking, regardless of the judgment gate', () => {
    const s = tapEarlyOk(phase, initDig(phase));
    expect(s.challenge?.challenger).toBe('ポン太');
    expect(s.finished).toBe(false);
  });

  it('early OK at the root finishes the mission', () => {
    let s = passGate(initDig(phase));
    s = playCard(phase, s, card(0, 'f1'));
    s = passGate(s);
    s = playCard(phase, s, card(1, 'f4'));
    expect(tapEarlyOk(phase, s).finished).toBe(true);
  });
});

describe('WO-07: Blind-first', () => {
  it('chooseGap(state) defaults to non-eligible — unchanged pre-WO-07 behaviour', () => {
    const s = chooseGap(judgeNotEnough(phase, initDig(phase)));
    expect(s.gate).toBe('open');
  });

  it('an eligible chooseGap withholds the hand — blindCommit, not open', () => {
    const s = chooseGap(judgeNotEnough(phase, initDig(phase)), true);
    expect(s.gate).toBe('blindCommit');
    expect(s.gapChoices).toBeNull();
  });

  it('no follow-up card can be selected while awaiting blind_commit', () => {
    const s = chooseGap(judgeNotEnough(phase, initDig(phase)), true);
    expect(playCard(phase, s, card(0, 'f1'))).toEqual(s);
  });

  it('merely reaching blindCommit does not itself touch awaitingSelfReport or open the hand', () => {
    const s = chooseGap(judgeNotEnough(phase, initDig(phase)), true);
    expect(s.awaitingSelfReport).toBe(false);
    expect(s.gate).not.toBe('open');
  });

  it('commitBlind reveals the hand (open) and marks a self-report as pending', () => {
    const eligible = chooseGap(judgeNotEnough(phase, initDig(phase)), true);
    const committed = commitBlind(eligible);
    expect(committed.gate).toBe('open');
    expect(committed.awaitingSelfReport).toBe(true);
    expect(playCard(phase, committed, card(0, 'f1')).layer).toBe(1); // hand is now playable
  });

  it('commitBlind is a no-op unless a Blind-first commit is actually being awaited', () => {
    const notEligible = chooseGap(judgeNotEnough(phase, initDig(phase)), false); // already open
    expect(commitBlind(notEligible)).toEqual(notEligible);
    expect(commitBlind(initDig(phase))).toEqual(initDig(phase)); // at the plain judgment gate
  });

  it('giveSelfReport clears the pending flag without touching gate or hand contents', () => {
    const committed = commitBlind(chooseGap(judgeNotEnough(phase, initDig(phase)), true));
    const reported = giveSelfReport(committed);
    expect(reported.awaitingSelfReport).toBe(false);
    expect(reported.gate).toBe('open');
    expect({ ...reported, awaitingSelfReport: true }).toEqual(committed);
  });

  it('giveSelfReport is a no-op when no self-report is pending', () => {
    const opened = passGate(initDig(phase)); // ordinary (non-Blind-first) reveal
    expect(opened.awaitingSelfReport).toBe(false);
    expect(giveSelfReport(opened)).toEqual(opened);
  });

  it('advancing to the next layer clears awaitingSelfReport along with the rest of the gate', () => {
    let s = commitBlind(chooseGap(judgeNotEnough(phase, initDig(phase)), true));
    expect(s.awaitingSelfReport).toBe(true);
    s = playCard(phase, s, card(0, 'f1')); // deepen -> layer 1
    expect(s.layer).toBe(1);
    expect(s.gate).toBe('gate');
    expect(s.awaitingSelfReport).toBe(false);
  });

  it('Blind-first eligibility has no dependency on which gap was named — chooseGap takes no such argument', () => {
    // chooseGap's signature is (state, eligible?) — there is no channel through which the target
    // vs. distractor choice could reach it at all, only a plain eligibility boolean the caller
    // computes independently from moveProgress.
    expect(chooseGap(judgeNotEnough(phase, initDig(phase)), true).gate).toBe('blindCommit');
    expect(chooseGap(judgeNotEnough(phase, initDig(phase)), false).gate).toBe('open');
  });
});
