import { describe, it, expect } from 'vitest';
import { initDig, playCard, tapEarlyOk, depth, currentAnswer } from '../src/engine/digMachine';
import type { DigPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';

const phase = mission.phases[1] as unknown as DigPhase;
const card = (layer: number, id: string) => phase.layers[layer]!.hand.find((c) => c.id === id)!;

describe('dig machine', () => {
  it('starts at layer 1 of N+1', () => {
    expect(depth(phase, initDig(phase))).toEqual({ current: 1, total: 3 });
  });

  it('only a deepen card advances a layer', () => {
    let s = initDig(phase);
    s = playCard(phase, s, card(0, 'f2')); // offtopic
    expect(s.layer).toBe(0);
    expect(s.flatReply).toBeTruthy();
    s = playCard(phase, s, card(0, 'f3')); // repeat
    expect(s.layer).toBe(0);
    expect(s.misses[0]).toBe(2);
    s = playCard(phase, s, card(0, 'f1')); // deepen
    expect(s.layer).toBe(1);
    expect(s.flatReply).toBeNull();
  });

  it('SPEC v0.5 §13: 1-1 cannot be completed with a single question', () => {
    let s = initDig(phase);
    s = playCard(phase, s, card(0, 'f1'));
    expect(s.atRoot).toBe(false); // one deepen is not enough
    s = playCard(phase, s, card(1, 'f4'));
    expect(s.atRoot).toBe(true);
    expect(currentAnswer(phase, s)).toBe(phase.root.robotSays);
  });

  it('early OK is always available and returns a challenge instead of blocking', () => {
    const s = tapEarlyOk(phase, initDig(phase));
    expect(s.challenge?.challenger).toBe('ポン太');
    expect(s.finished).toBe(false);
  });

  it('early OK at the root finishes the mission', () => {
    let s = initDig(phase);
    s = playCard(phase, s, card(0, 'f1'));
    s = playCard(phase, s, card(1, 'f4'));
    expect(tapEarlyOk(phase, s).finished).toBe(true);
  });
});
