import { describe, it, expect } from 'vitest';
import { collectHandCards, severityOf } from '../pipeline/tag_audit';
import mission from '../src/modules/m1/topics/bread/s2.json';

describe('tag_audit: severityOf', () => {
  it('is null on agreement', () => {
    expect(severityOf('deepen', 'deepen')).toBeNull();
    expect(severityOf('sideways', 'sideways')).toBeNull();
  });

  it('is "high" when the two disagree on whether the card deepens at all — breaks the mechanic', () => {
    expect(severityOf('deepen', 'sideways')).toBe('high');
    expect(severityOf('sideways', 'deepen')).toBe('high');
    expect(severityOf('deepen', 'offtopic')).toBe('high');
  });

  it('is "low" when both agree the card is a non-deepen distractor, just disagree which kind', () => {
    expect(severityOf('sideways', 'repeat')).toBe('low');
    expect(severityOf('offtopic', 'sideways')).toBe('low');
  });
});

describe('tag_audit: collectHandCards', () => {
  it('collects every dig hand card from the real bread mission with its layer context', () => {
    const cards = collectHandCards(mission);
    // layer 0 has 3 cards (f1,f2,f3), layer 1 has 3 (f4,f5,f6) = 6 total.
    expect(cards).toHaveLength(6);
    expect(cards.filter((c) => c.where === 'dig layer 0')).toHaveLength(3);
    expect(cards.filter((c) => c.where === 'dig layer 1')).toHaveLength(3);
  });

  it('carries the authored tag through unchanged', () => {
    const cards = collectHandCards(mission);
    const deepenCards = cards.filter((c) => c.authoredTag === 'deepen');
    expect(deepenCards).toHaveLength(2); // exactly one per layer
    expect(cards.find((c) => c.cardId === 'f2')?.authoredTag).toBe('offtopic');
  });

  it('uses the layer\'s own robotSays as context, not some other layer\'s', () => {
    const cards = collectHandCards(mission);
    const layer0 = cards.filter((c) => c.where === 'dig layer 0');
    const layer1 = cards.filter((c) => c.where === 'dig layer 1');
    expect(new Set(layer0.map((c) => c.context)).size).toBe(1);
    expect(layer0[0]!.context).not.toBe(layer1[0]!.context);
  });

  it('ignores non-dig phases entirely', () => {
    const synthetic = { phases: [{ template: 'slot-assembly', cards: [{ id: 'x', text: 'x', tag: 'clear' }] }] };
    expect(collectHandCards(synthetic)).toEqual([]);
  });
});
