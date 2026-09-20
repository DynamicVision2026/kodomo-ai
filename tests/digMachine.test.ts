import { describe, it, expect } from 'vitest';
import {
  initDig, playCard, tapEarlyOk, judgeNotEnough, continueFromHolding, depth, currentAnswer,
  type DigState,
} from '../src/engine/digMachine';
import type { DigPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';

const phase = mission.phases[1] as unknown as DigPhase;
const card = (layer: number, id: string) => phase.layers[layer]!.hand.find((c) => c.id === id)!;

/** WO-02: every layer's hand sits behind the mandatory 「これでOK？」 judgment gate. */
function openGate(s: DigState): DigState {
  return continueFromHolding(judgeNotEnough(s));
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

  it('"not enough" reaches a pre-gap holding state where no follow-up can be selected', () => {
    const s = judgeNotEnough(initDig(phase));
    expect(s.gate).toBe('holding');
    // Still blocked: the holding state doesn't yet expose the hand.
    expect(playCard(phase, s, card(0, 'f1'))).toEqual(s);
  });

  it('continuing from the holding state opens the gate and allows play', () => {
    const s = openGate(initDig(phase));
    expect(s.gate).toBe('open');
    expect(playCard(phase, s, card(0, 'f1')).layer).toBe(1);
  });

  it('only a deepen card advances a layer', () => {
    let s = openGate(initDig(phase));
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
    let s = openGate(initDig(phase));
    s = playCard(phase, s, card(0, 'f1'));
    expect(s.atRoot).toBe(false); // one deepen is not enough
    s = openGate(s);
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
    let s = openGate(initDig(phase));
    s = playCard(phase, s, card(0, 'f1'));
    s = openGate(s);
    s = playCard(phase, s, card(1, 'f4'));
    expect(tapEarlyOk(phase, s).finished).toBe(true);
  });
});
