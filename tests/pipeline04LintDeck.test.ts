import { describe, it, expect } from 'vitest';
import { lintDeck } from '../pipeline/04_lint';
import { loadGradeMap } from '../pipeline/lib/kanji';
import deck from '../src/modules/m1/deck.s2.json';

const gradeOf = loadGradeMap();

describe('lintDeck', () => {
  it('passes the real, 9-card sampler deck', () => {
    expect(lintDeck(deck, 2, gradeOf)).toEqual([]);
  });

  it('flags a missing "cards" array', () => {
    expect(lintDeck({}, 2, gradeOf)).toEqual([{ rule: 'schema', message: 'deck file has no "cards" array' }]);
    expect(lintDeck({ cards: [] }, 2, gradeOf)).toEqual([{ rule: 'schema', message: 'deck file has no "cards" array' }]);
  });

  it('flags a card missing id, kind, or text', () => {
    expect(lintDeck({ cards: [{ kind: 'odai', text: 'x' }] }, 2, gradeOf)[0]?.rule).toBe('schema');
    expect(lintDeck({ cards: [{ id: 'c1', text: 'x' }] }, 2, gradeOf)[0]?.rule).toBe('schema');
    expect(lintDeck({ cards: [{ id: 'c1', kind: 'odai' }] }, 2, gradeOf)[0]?.message).toContain('c1 has no text');
  });

  it('runs the same text rules as lintMission: banned word, missing ruby, over-length', () => {
    const bad = { cards: [{ id: 'c1', kind: 'odai', text: '正解、そして問題' }] };
    const issues = lintDeck(bad, 2, gradeOf);
    expect(issues.some((i) => i.rule === 'banned-word')).toBe(true);
    expect(issues.some((i) => i.rule === 'ruby-required')).toBe(true);
  });
});
