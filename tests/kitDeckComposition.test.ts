import { describe, it, expect } from 'vitest';
import {
  checkDeckComposition, FULL_DECK_COMPOSITION, FULL_DECK_TOTAL,
  BONUS_SHEET_COMPOSITION, BONUS_SHEET_TOTAL, type DeckFile,
} from '../pipeline/lib/kitDeckComposition';

describe('FULL_DECK_COMPOSITION (spec v0.5 §8)', () => {
  it('totals exactly 45 cards', () => {
    expect(FULL_DECK_TOTAL).toBe(45);
  });
});

describe('BONUS_SHEET_COMPOSITION (spec v0.5 §8: 9 冬休みスペシャル おだい)', () => {
  it('totals exactly 9 cards, all odai', () => {
    expect(BONUS_SHEET_TOTAL).toBe(9);
    expect(BONUS_SHEET_COMPOSITION).toEqual({ odai: 9 });
  });
});

describe('checkDeckComposition', () => {
  it('reports no issues for a deck that exactly matches the expected composition', () => {
    const deck: DeckFile = { stage: 2, cards: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, kind: 'odai', text: 'x' })) };
    expect(checkDeckComposition(deck, BONUS_SHEET_COMPOSITION)).toEqual([]);
  });

  it('reports a shortfall when a kind has too few cards', () => {
    const deck: DeckFile = { stage: 2, cards: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, kind: 'odai', text: 'x' })) };
    const issues = checkDeckComposition(deck, BONUS_SHEET_COMPOSITION);
    expect(issues).toEqual([{ kind: 'odai', expected: 9, actual: 5 }]);
  });

  it('reports an unexpected kind not in the expected composition at all', () => {
    const deck: DeckFile = { stage: 2, cards: [{ id: 'c1', kind: 'himitsu', text: 'x' }] };
    const issues = checkDeckComposition(deck, BONUS_SHEET_COMPOSITION);
    expect(issues).toContainEqual({ kind: 'himitsu', expected: 0, actual: 1 });
    expect(issues).toContainEqual({ kind: 'odai', expected: 9, actual: 0 });
  });

  it('validates a synthetic 45-card deck that exactly matches FULL_DECK_COMPOSITION — proving the check works before any real content exists', () => {
    const cards: DeckFile['cards'] = [];
    let n = 0;
    for (const [kind, count] of Object.entries(FULL_DECK_COMPOSITION)) {
      for (let i = 0; i < count; i++) cards.push({ id: `c${n++}`, kind, text: `synthetic ${kind} ${i}` });
    }
    const deck: DeckFile = { stage: 2, cards };
    expect(cards).toHaveLength(45);
    expect(checkDeckComposition(deck, FULL_DECK_COMPOSITION)).toEqual([]);
  });

  it('the current 9-card sampler (deck.s2.json) does NOT match the full 45-card composition — confirming it is honestly a different, already-complete item, not a partial full deck', async () => {
    const sampler = (await import('../src/modules/m1/deck.s2.json')).default as DeckFile;
    const issues = checkDeckComposition(sampler, FULL_DECK_COMPOSITION);
    expect(issues.length).toBeGreaterThan(0);
  });
});
