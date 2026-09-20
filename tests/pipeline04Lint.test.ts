import { describe, it, expect } from 'vitest';
import { lintMission } from '../pipeline/04_lint';
import { lintText } from '../pipeline/lib/lintText';
import { loadGradeMap } from '../pipeline/lib/kanji';
import mission from '../src/modules/m1/topics/bread/s2.json';
import chantoMission from '../src/modules/m1/topics/chanto/s2.json';
import genkanMission from '../src/modules/m1/topics/genkan/s2.json';

const gradeOf = loadGradeMap();
const claimIds = new Set(['c1', 'c2', 'c3']);

describe('lintMission', () => {
  it('passes the real, fully-migrated bread mission (v0.6 gap/move/domain contract)', () => {
    // WO-01 final closeout: per docs/spec-v0.5.md ("1-1 FREE | なにを | なぜ？ · 2 layers"),
    // mission 1-1's dig phase is なぜ？-only across both layers — no fifth move needed. Layer 1's
    // deepen card (f4) was reworded to "なぜ ガスが 出ると ふくらむの？" for clean alignment with
    // its follow-naze move, keeping the same claim chain into the root (c3: gluten traps gas).
    expect(lintMission(mission, 2, gradeOf, claimIds)).toEqual([]);
  });

  it('flags a missing schema field', () => {
    const issues = lintMission({ stage: 2, phases: [] }, 2, gradeOf, claimIds);
    expect(issues).toEqual([{ rule: 'schema', message: 'missing id, stage or phases' }]);
  });

  it('flags a dig layer with zero deepen cards', () => {
    const bad = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [{
          robotSays: 'そう', claims: ['nonfactual'],
          hand: [{ id: 'a', text: 'そう', tag: 'sideways' }],
          replies: {},
        }],
        root: { robotSays: 'そう', claims: ['nonfactual'] },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };
    const issues = lintMission(bad, 2, gradeOf, claimIds);
    expect(issues).toContainEqual({ rule: 'hand', message: 'layer 0 has 0 deepen cards, need at least 1' });
  });

  it('WO-20: no longer flags a dig layer with MORE than one deepen card — the child may genuinely choose which move to follow (Missions 1-7/1-8)', () => {
    const ok = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [{
          robotSays: 'ねっこじゃないよ', claims: ['nonfactual'],
          gap: 'わからない',
          gapDistractors: [{ text: 'こたえた', kind: 'answered' }, { text: 'べつのそう', kind: 'other-layer' }],
          hand: [
            { id: 'a', text: 'なんで？', tag: 'deepen', move: 'follow-naze', domain: '日常' },
            { id: 'b', text: 'たとえば？', tag: 'deepen', move: 'follow-tatoeba', domain: '日常' },
          ],
          replies: {},
        }],
        root: { robotSays: 'ねっこだよ', claims: ['nonfactual'], label: 'ねっこ' },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };
    const issues = lintMission(ok, 2, gradeOf, claimIds);
    expect(issues.filter((i) => i.rule === 'hand')).toEqual([]);
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
  // WO-03 (AD-01): gapDistractors — exactly two, one `answered` + one `other-layer`, alongside
  // the target `gap`, all three texts distinct.
  describe('v0.6 content contract (gap / move / domain / props / gapDistractors)', () => {
    const validMission = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [{
          robotSays: 'そう', claims: ['nonfactual'], gap: 'そうなる りゆうが わからない',
          gapDistractors: [
            { text: 'すでに こたえが 出ている こと', kind: 'answered' },
            { text: 'べつの ところで わかる こと', kind: 'other-layer' },
          ],
          hand: [{ id: 'a', text: 'なぜ そうなるの', tag: 'deepen', move: 'follow-naze', domain: '日常' }],
          replies: {},
        }],
        // Deliberately distinct from the layer's own 'そう' — AD-05 §7's epistemic-leak rule
        // (WO-14) flags a layer/root sharing the same robotSays, so this fixture's root must not
        // collide with placeholder layer text it isn't testing.
        root: { robotSays: 'ねっこだよ', claims: ['nonfactual'] },
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

    function withLayer(layer: unknown) {
      return { ...validMission, phases: [{ ...validMission.phases[0]!, layers: [layer] }] };
    }
    const baseLayer = validMission.phases[0]!.layers[0]!;

    it('rejects a shipping Stage-2 layer missing gapDistractors entirely', () => {
      const { gapDistractors, ...layerWithoutDistractors } = baseLayer;
      const issues = lintMission(withLayer(layerWithoutDistractors), 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'gapDistractors', message: 'layer 0 needs exactly 2 gapDistractors (AD-01), got 0' });
    });

    it('rejects the wrong number of gapDistractors', () => {
      const oneOnly = { ...baseLayer, gapDistractors: [baseLayer.gapDistractors[0]] };
      const issues = lintMission(withLayer(oneOnly), 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'gapDistractors', message: 'layer 0 needs exactly 2 gapDistractors (AD-01), got 1' });
    });

    it('rejects two gapDistractors of the same kind (duplicate/missing kind)', () => {
      const bothAnswered = {
        ...baseLayer,
        gapDistractors: [
          { text: 'すでに こたえが 出ている こと', kind: 'answered' },
          { text: 'べつの りゆうで こたえが 出ている こと', kind: 'answered' },
        ],
      };
      const issues = lintMission(withLayer(bothAnswered), 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'gapDistractorKind', message: 'layer 0 gapDistractors must have exactly one "answered" and one "other-layer" (got answered, answered)' });
    });

    it('rejects a duplicate text among gap and its distractors within the layer', () => {
      const duplicated = {
        ...baseLayer,
        gapDistractors: [
          { text: baseLayer.gap, kind: 'answered' }, // same text as the target gap
          { text: 'べつの ところで わかる こと', kind: 'other-layer' },
        ],
      };
      const issues = lintMission(withLayer(duplicated), 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'gapDistractorDuplicate', message: `layer 0 has a duplicate gap/gapDistractor text: "${baseLayer.gap}"` });
    });

    it('rejects an empty gapDistractor text', () => {
      const empty = {
        ...baseLayer,
        gapDistractors: [
          { text: '   ', kind: 'answered' },
          { text: 'べつの ところで わかる こと', kind: 'other-layer' },
        ],
      };
      const issues = lintMission(withLayer(empty), 2, gradeOf, claimIds);
      expect(issues).toContainEqual({ rule: 'gapDistractorText', message: 'layer 0 has an empty gap or gapDistractor text' });
    });

    it('cross-layer reuse of a gapDistractor string is permitted (AD-01 §2)', () => {
      const secondLayer = {
        robotSays: 'そう', claims: ['nonfactual'],
        gap: 'べつの ぎもんが わからない',
        gapDistractors: [
          { text: baseLayer.gap, kind: 'other-layer' }, // reuses layer 0's target verbatim — allowed
          { text: 'まだ でていない こたえの こと', kind: 'answered' },
        ],
        hand: [{ id: 'b', text: 'なぜ べつなの', tag: 'deepen', move: 'follow-naze', domain: '日常' }],
        replies: {},
      };
      const twoLayerMission = { ...validMission, phases: [{ ...validMission.phases[0]!, layers: [baseLayer, secondLayer] }] };
      expect(lintMission(twoLayerMission, 2, gradeOf, claimIds)).toEqual([]);
    });

    it('applies the same child-facing text rules to gap and gapDistractor text', () => {
      const banned = {
        ...baseLayer,
        gapDistractors: [
          { text: '正解が わかっている こと', kind: 'answered' }, // banned word
          { text: 'べつの ところで わかる こと', kind: 'other-layer' },
        ],
      };
      const issues = lintMission(withLayer(banned), 2, gradeOf, claimIds);
      expect(issues.some((i) => i.rule === 'banned-word')).toBe(true);
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

  // AD-05 §4 (WO-14): the kanji floor is enforced only for missions that are themselves
  // contentClass: "release" — a go-forward register policy, not retroactively applied to
  // archived/synthetic content or content with no contentClass at all.
  describe('kanji-floor gating (AD-05 §4 — release-only, not retroactive)', () => {
    const kanaViolation = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig', layers: [],
        root: { robotSays: 'いま なにが きこえる？', claims: ['nonfactual'] },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };

    it('flags a kanji-floor violation on a contentClass: "release" mission', () => {
      const issues = lintMission({ ...kanaViolation, contentClass: 'release' }, 2, gradeOf, claimIds);
      expect(issues.some((i) => i.rule === 'kanji-floor')).toBe(true);
    });

    it('does NOT flag the identical text on a contentClass: "archived" mission', () => {
      const issues = lintMission({ ...kanaViolation, contentClass: 'archived' }, 2, gradeOf, claimIds);
      expect(issues.some((i) => i.rule === 'kanji-floor')).toBe(false);
    });

    it('does NOT flag the identical text on a contentClass: "synthetic" mission', () => {
      const issues = lintMission({ ...kanaViolation, contentClass: 'synthetic' }, 2, gradeOf, claimIds);
      expect(issues.some((i) => i.rule === 'kanji-floor')).toBe(false);
    });

    it('does NOT flag the identical text on a mission with no contentClass at all', () => {
      const issues = lintMission(kanaViolation, 2, gradeOf, claimIds);
      expect(issues.some((i) => i.rule === 'kanji-floor')).toBe(false);
    });
  });

  // AD-05 §7 (WO-14): only the root/tip may state the mission's conclusion — a dig layer's
  // robotSays must never already contain it, or "digging" for it is theatre.
  describe('epistemic-root guardrail (AD-05 §7)', () => {
    const chainWithLeak = {
      id: 'x', stage: 2,
      phases: [{
        template: 'dig',
        layers: [{
          robotSays: 'その理由は、外と中がべつだからだよ。', claims: ['nonfactual'],
          gap: 'なぜか わからない',
          gapDistractors: [
            { text: 'すでに わかっている こと', kind: 'answered' },
            { text: 'べつの ところで わかる こと', kind: 'other-layer' },
          ],
          hand: [{ id: 'a', text: 'なぜ そうなるの', tag: 'deepen', move: 'follow-naze', domain: '日常' }],
          replies: {},
        }],
        root: { robotSays: 'その理由は、外と中がべつだからだよ。', claims: ['nonfactual'] },
      }],
      tip: 'そう', teachBack: 'そう', ouchiTalk: 'そう',
    };

    it('flags a layer whose robotSays is identical to the root\'s conclusion', () => {
      const issues = lintMission(chainWithLeak, 2, gradeOf, claimIds);
      expect(issues.some((i) => i.rule === 'epistemic-leak')).toBe(true);
    });

    it('flags a layer whose robotSays merely CONTAINS the root\'s conclusion as a substring', () => {
      const bad = {
        ...chainWithLeak,
        phases: [{
          ...chainWithLeak.phases[0]!,
          layers: [{
            ...chainWithLeak.phases[0]!.layers[0]!,
            robotSays: 'まず、その理由は、外と中がべつだからだよ。 と ロボは いった。',
          }],
        }],
      };
      const issues = lintMission(bad, 2, gradeOf, claimIds);
      expect(issues.some((i) => i.rule === 'epistemic-leak')).toBe(true);
    });

    it('passes a chain where every layer\'s robotSays is genuinely distinct from the root', () => {
      // The real accepted pattern (chanto/genkan): each layer's answer is a distinct, shallower
      // step; only the root states the mission's actual conclusion.
      const validChain = {
        ...chainWithLeak,
        phases: [{
          ...chainWithLeak.phases[0]!,
          layers: [{ ...chainWithLeak.phases[0]!.layers[0]!, robotSays: 'まず、そとの ものだからだよ。' }],
        }],
      };
      expect(lintMission(validChain, 2, gradeOf, claimIds).some((i) => i.rule === 'epistemic-leak')).toBe(false);
    });

    it('the real, migrated chanto and genkan missions both pass — proof against real content, not just a fixture', () => {
      const gradeOfReal = loadGradeMap();
      const chantoIssues = lintMission(chantoMission, 2, gradeOfReal, new Set(['c1', 'c2', 'c3']));
      const genkanIssues = lintMission(genkanMission, 2, gradeOfReal, new Set(['c1', 'c2', 'c3']));
      expect(chantoIssues.filter((i) => i.rule === 'epistemic-leak')).toEqual([]);
      expect(genkanIssues.filter((i) => i.rule === 'epistemic-leak')).toEqual([]);
    });
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
