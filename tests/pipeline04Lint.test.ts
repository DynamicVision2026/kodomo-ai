import { describe, it, expect } from 'vitest';
import { lintMission } from '../pipeline/04_lint';
import { lintText } from '../pipeline/lib/lintText';
import { loadGradeMap } from '../pipeline/lib/kanji';
import mission from '../src/modules/m1/topics/bread/s2.json';

const gradeOf = loadGradeMap();
const claimIds = new Set(['c1', 'c2', 'c3']);

describe('lintMission', () => {
  it('passes the real, fully-migrated bread mission (v0.6 gap/move/domain contract)', () => {
    // Follow-up to WO-01: the Coordinator supplied the two gap values and resolved the
    // layer-1 move-taxonomy gap by adding follow-sorekara ("それから？") to m1's followMoves —
    // "そのガスは どこへ いくの？" traces a causal consequence forward, which none of the
    // original four moves (naze/tatoeba/tsumari/hokaniwa) represent.
    expect(lintMission(mission, 2, gradeOf, claimIds)).toEqual([]);
  });

  it('flags a missing schema field', () => {
    const issues = lintMission({ stage: 2, phases: [] }, 2, gradeOf, claimIds);
    expect(issues).toEqual([{ rule: 'schema', message: 'missing id, stage or phases' }]);
  });

  it('flags a dig layer without exactly one deepen card', () => {
    const bad = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [{
          robotSays: 'そう', claims: ['nonfactual'],
          hand: [{ id: 'a', text: 'そう', tag: 'deepen' }, { id: 'b', text: 'そう', tag: 'deepen' }],
          replies: {},
        }],
        root: { robotSays: 'そう', claims: ['nonfactual'] },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };
    const issues = lintMission(bad, 2, gradeOf, claimIds);
    expect(issues).toContainEqual({ rule: 'hand', message: 'layer 0 has 2 deepen cards, need exactly 1' });
  });

  it('flags a claim id not present in facts.yaml', () => {
    const bad = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [],
        root: { robotSays: 'そう', claims: ['c99'] },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };
    const issues = lintMission(bad, 2, gradeOf, claimIds);
    expect(issues).toContainEqual({ rule: 'claims', message: 'root cites unknown claim c99' });
  });

  it('flags a banned word and a missing-ruby kanji', () => {
    const bad = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [],
        root: { robotSays: '正解、そして問題', claims: ['nonfactual'] },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };
    const issues = lintMission(bad, 2, gradeOf, claimIds);
    expect(issues.some((i) => i.rule === 'banned-word')).toBe(true);
    expect(issues.some((i) => i.rule === 'ruby-required')).toBe(true);
  });

  // WO-01: v0.6 content contract — gap per Dig layer, move+domain per deepen card, scoped to
  // Stage 2 (real shipping Stage-2 content). See docs/work-order-w1.md.
  describe('v0.6 content contract (gap / move / domain / props)', () => {
    const validMission = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [{
          robotSays: 'そう', claims: ['nonfactual'], gap: 'テストの ギャップ',
          hand: [{ id: 'a', text: 'なぜ そうなるの', tag: 'deepen', move: 'follow-naze', domain: '日常' }],
          replies: {},
        }],
        root: { robotSays: 'そう', claims: ['nonfactual'] },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };

    it('accepts valid Stage-2 content carrying the full new contract', () => {
      expect(lintMission(validMission, 2, gradeOf, claimIds)).toEqual([]);
    });

    it('rejects a shipping Stage-2 Dig layer missing gap', () => {
      const { gap, ...layerWithoutGap } = validMission.phases[0]!.layers[0]!;
      const bad = { ...validMission, phases: [{ ...validMission.phases[0]!, layers: [layerWithoutGap] }] };
      const issues = lintMission(bad, 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'gap', message: 'layer 0 is missing gap (v0.6 content contract)' });
    });

    it('rejects a deepen card missing move', () => {
      const card = { id: 'a', text: 'なぜ そうなるの', tag: 'deepen', domain: '日常' };
      const bad = { ...validMission, phases: [{ ...validMission.phases[0]!, layers: [{ ...validMission.phases[0]!.layers[0]!, hand: [card] }] }] };
      const issues = lintMission(bad, 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'move', message: 'layer 0 deepen card is missing move (v0.6 content contract)' });
    });

    it('rejects a deepen card missing domain', () => {
      const card = { id: 'a', text: 'なぜ そうなるの', tag: 'deepen', move: 'follow-naze' };
      const bad = { ...validMission, phases: [{ ...validMission.phases[0]!, layers: [{ ...validMission.phases[0]!.layers[0]!, hand: [card] }] }] };
      const issues = lintMission(bad, 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'domain', message: 'layer 0 deepen card is missing domain (v0.6 content contract)' });
    });

    it('rejects a domain outside the approved four values', () => {
      const card = { id: 'a', text: 'なぜ そうなるの', tag: 'deepen', move: 'follow-naze', domain: 'うちゅう' };
      const bad = { ...validMission, phases: [{ ...validMission.phases[0]!, layers: [{ ...validMission.phases[0]!.layers[0]!, hand: [card] }] }] };
      const issues = lintMission(bad, 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'domain', message: 'layer 0 card has unapproved domain "うちゅう"' });
    });

    it('leaves omission of the optional Mission-level props valid', () => {
      expect((validMission as { props?: string[] }).props).toBeUndefined();
      expect(lintMission(validMission, 2, gradeOf, claimIds)).toEqual([]);
    });

    it('does not require gap/move/domain outside Stage 2', () => {
      const stage3 = { ...validMission, stage: 3, phases: [{ ...validMission.phases[0]!, layers: [{ robotSays: 'そう', claims: ['nonfactual'], hand: [{ id: 'a', text: 'なぜ そうなるの', tag: 'deepen' }], replies: {} }] }] };
      expect(lintMission(stage3, 3, gradeOf, claimIds)).toEqual([]);
    });
  });

  it('flags an invalid dig tag and an unknown phase template', () => {
    const bad = {
      id: 'x', stage: 2,
      phases: [
        {
          template: 'dig',
          layers: [{
            robotSays: 'そう', claims: ['nonfactual'],
            hand: [{ id: 'a', text: 'そう', tag: 'deepen' }, { id: 'b', text: 'そう', tag: 'wrong' }],
            replies: {},
          }],
          root: { robotSays: 'そう', claims: ['nonfactual'] },
        },
        { template: 'mystery' },
      ],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };
    const issues = lintMission(bad, 2, gradeOf, claimIds);
    expect(issues).toContainEqual({ rule: 'tag', message: 'invalid dig tag wrong' });
    expect(issues).toContainEqual({ rule: 'schema', message: 'unknown template mystery' });
  });
});

// Sprint 1-A §2.3: lintMission/lintDeck already key off STAGE_LIMITS[stage] with no Stage-2-only
// branch — these prove the existing rules behave as intended at Stage 1 and Stage 3's extremes,
// not just Stage 2's middle ground (docs/work-order-w2-stage-expansion.md §2.3).
describe('lintText at Stage 1 (bareUpTo: 0, allowedUpTo: 2, maxSentence: 20)', () => {
  it('requires ruby on even a Grade 1 kanji, since bareUpTo is 0', () => {
    const issues = lintText('一ばん すきな いろ', 1, gradeOf); // 一 = Grade 1, bare
    expect(issues.some((i) => i.rule === 'ruby-required')).toBe(true);
  });

  it('accepts that same Grade 1 kanji once it carries ruby', () => {
    const issues = lintText('{一|いち}ばん すきな いろ', 1, gradeOf);
    expect(issues.some((i) => i.rule === 'ruby-required')).toBe(false);
  });

  it('forbids a Grade 3 kanji outright, even with ruby (above allowedUpTo: 2)', () => {
    const issues = lintText('{悪|わる}いこと', 1, gradeOf); // 悪 = Grade 3
    expect(issues.some((i) => i.rule === 'kanji-grade')).toBe(true);
  });

  it('flags a sentence over the 20-character ceiling', () => {
    const issues = lintText('これは にじゅうもじを こえる ながい ぶんしょうです よ', 1, gradeOf);
    expect(issues.some((i) => i.rule === 'length')).toBe(true);
  });
});

describe('lintText at Stage 3 (bareUpTo: 4, allowedUpTo: 6, maxSentence: 50)', () => {
  it('allows a Grade 4 kanji bare', () => {
    const issues = lintText('{愛|あい}を おしえて くれた 愛犬', 3, gradeOf); // 愛 = Grade 4
    expect(issues.some((i) => i.rule === 'ruby-required' || i.rule === 'kanji-grade')).toBe(false);
  });

  it('requires ruby on a Grade 5 kanji (above bareUpTo, within allowedUpTo)', () => {
    const issues = lintText('圧をかける', 3, gradeOf); // 圧 = Grade 5, bare
    expect(issues.some((i) => i.rule === 'ruby-required')).toBe(true);
    const withRuby = lintText('{圧|あつ}をかける', 3, gradeOf);
    expect(withRuby.some((i) => i.rule === 'ruby-required' || i.rule === 'kanji-grade')).toBe(false);
  });

  it('forbids a 表外 (ungraded) kanji even with ruby, above allowedUpTo: 6', () => {
    const issues = lintText('{鬱|うつ}な きもち', 3, gradeOf);
    expect(issues.some((i) => i.rule === 'kanji-grade')).toBe(true);
  });

  it('permits a longer sentence up to the 50-character ceiling', () => {
    const ok = 'これは さんじゅうもじほどの ながさの ぶんしょうで、ステージ３なら もんだいない はずです';
    expect(ok.length).toBeLessThanOrEqual(50);
    expect(lintText(ok, 3, gradeOf).some((i) => i.rule === 'length')).toBe(false);
  });

  it('flags a sentence over the 50-character ceiling', () => {
    const long = 'これは とても とても とても とても とても とても とても とても とても ながい ぶんしょうです';
    expect(long.length).toBeGreaterThan(50);
    expect(lintText(long, 3, gradeOf).some((i) => i.rule === 'length')).toBe(true);
  });
});
