import { describe, it, expect } from 'vitest';
import { lintMission } from '../pipeline/04_lint';
import { loadGradeMap } from '../pipeline/lib/kanji';
import mission from '../src/modules/m1/topics/bread/s2.json';

const gradeOf = loadGradeMap();
const claimIds = new Set(['c1', 'c2', 'c3']);

describe('lintMission', () => {
  it('passes the real, already-fixed bread mission', () => {
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
