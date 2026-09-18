import { describe, it, expect } from 'vitest';
import { extractJsonObject, assembleMission, assertAllApproved, loadFacts, validateDraftContent } from '../pipeline/03_render';
import { lintMission } from '../pipeline/04_lint';
import { loadGradeMap } from '../pipeline/lib/kanji';
import type { Claim } from '../pipeline/01_research';
import type { FactsFile } from '../pipeline/01_research';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('03_render: extractJsonObject', () => {
  it('extracts a bare JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts a JSON object surrounded by prose or fences', () => {
    const text = 'Sure!\n```json\n{"a":1,"b":2}\n```\n';
    expect(extractJsonObject(text)).toEqual({ a: 1, b: 2 });
  });

  it('throws when no object is present', () => {
    expect(() => extractJsonObject('nothing here')).toThrow(/No JSON object/);
  });
});

describe('03_render: assertAllApproved / loadFacts', () => {
  it('throws naming every non-approved claim', () => {
    const facts: FactsFile = {
      topic: 't', question: 'q?',
      claims: [
        { id: 'c1', statement: 's', sourceUrl: 'u', excerpt: 'e', adultLevelSource: true, status: 'approved' },
        { id: 'c2', statement: 's', sourceUrl: 'u', excerpt: 'e', adultLevelSource: true, status: 'pending' },
      ],
    };
    expect(() => assertAllApproved(facts)).toThrow(/c2 still pending/);
  });

  it('does not throw once every claim is approved', () => {
    const facts: FactsFile = {
      topic: 't', question: 'q?',
      claims: [{ id: 'c1', statement: 's', sourceUrl: 'u', excerpt: 'e', adultLevelSource: true, status: 'approved' }],
    };
    expect(() => assertAllApproved(facts)).not.toThrow();
  });

  it('round-trips through the filesystem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'facts-'));
    const path = join(dir, 'facts.yaml');
    writeFileSync(path, 'topic: t\nquestion: q?\nclaims:\n  - id: c1\n    statement: s\n    sourceUrl: u\n    excerpt: e\n    adultLevelSource: true\n    status: approved\n');
    const facts = loadFacts(path);
    expect(facts.topic).toBe('t');
    expect(facts.claims).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

function claim(id: string, statement: string): Claim {
  return { id, statement, sourceUrl: 'https://www.britannica.com/x', excerpt: 'x', adultLevelSource: true, status: 'approved' };
}

const claims: Claim[] = [claim('c1', 'いちばん あさい じじつ'), claim('c2', 'つぎに ふかい じじつ'), claim('c3', 'いちばん ふかい じじつ')];

const draft = {
  title: 'なぜ そうなるの',
  slotCards: { clear: 'わけを おしえて', vague: 'いろいろ おしえて', offtopic: 'たべたいな' },
  clearRobotSays: 'それはね、いちばん あさい じじつだよ',
  vagueRobotSays: 'うーん、なにが しりたいのかな',
  vagueTip: 'なにが しりたいか、はっきり させよう',
  offtopicRobotSays: 'それは わからないなあ',
  layers: [
    {
      robotSays: 'ここは つかわれない',
      deepenCardText: 'なんで そうなるの？',
      distractors: [
        { tag: 'offtopic' as const, cardText: 'すきな いろは？', reply: 'いろの はなしは しないよ' },
        { tag: 'repeat' as const, cardText: 'もう いちど いって', reply: 'さっきと おなじだよ' },
      ],
      earlyOkAsks: 'それだけで いいの？',
    },
    {
      robotSays: 'それはね、つぎに ふかい じじつだよ',
      deepenCardText: 'それって どういうこと？',
      distractors: [
        { tag: 'sideways' as const, cardText: 'べつの はなしだけど', reply: 'その はなしは またこんど' },
        { tag: 'repeat' as const, cardText: 'もう いちど いって', reply: 'さっきと おなじだよ' },
      ],
      earlyOkAsks: 'ほんとうに それで いいの？',
    },
  ],
  rootRobotSays: 'それはね、いちばん ふかい じじつだよ',
  tip: 'さいしょの こたえで とまらない',
  teachBack: 'おうちの人に おしえてあげよう',
  ouchiTalk: 'もう ひとつ きいてみようか',
};

describe('03_render: validateDraftContent', () => {
  it('accepts the well-formed fixture', () => {
    expect(() => validateDraftContent(draft, 2)).not.toThrow();
  });

  it('rejects the wrong number of layers', () => {
    expect(() => validateDraftContent({ ...draft, layers: [draft.layers[0]] }, 2)).toThrow(/layers must be an array of exactly 2/);
  });

  it('rejects a missing top-level field', () => {
    const { title, ...rest } = draft;
    expect(() => validateDraftContent(rest, 2)).toThrow(/title missing/);
  });

  it('rejects too few or too many distractors', () => {
    const zero = { ...draft, layers: [{ ...draft.layers[0]!, distractors: [] }, draft.layers[1]] };
    expect(() => validateDraftContent(zero, 2)).toThrow(/distractors must have 2-3 entries/);
    const four = { ...draft, layers: [{ ...draft.layers[0]!, distractors: [...draft.layers[0]!.distractors, ...draft.layers[0]!.distractors] }, draft.layers[1]] };
    expect(() => validateDraftContent(four, 2)).toThrow(/distractors must have 2-3 entries/);
  });

  it('rejects an invalid distractor tag (e.g. "deepen" is not allowed on a distractor)', () => {
    const bad = { ...draft, layers: [{ ...draft.layers[0]!, distractors: [{ tag: 'deepen', cardText: 'x', reply: 'y' }, draft.layers[0]!.distractors[1]] }, draft.layers[1]] };
    expect(() => validateDraftContent(bad, 2)).toThrow(/tag "deepen" is invalid/);
  });
});

describe('03_render: assembleMission', () => {
  const mission = assembleMission('m1-s2-test', 2, 'test', claims, draft);

  it('lists every claim id in sources', () => {
    expect(mission.sources).toEqual(['c1', 'c2', 'c3']);
  });

  it('builds one dig layer per claim except the last, each with exactly one deepen card', () => {
    const dig = mission.phases[1] as import('../src/engine/types').DigPhase;
    expect(dig.layers).toHaveLength(2);
    for (const layer of dig.layers) {
      expect(layer.hand.filter((c) => c.tag === 'deepen')).toHaveLength(1);
    }
  });

  it('reuses the CLEAR archetype text as layer 0\'s opening line (the seamless hand-off)', () => {
    const slotAssembly = mission.phases[0] as import('../src/engine/types').SlotAssemblyPhase;
    const dig = mission.phases[1] as import('../src/engine/types').DigPhase;
    expect(dig.layers[0]!.robotSays).toBe(slotAssembly.archetypes.CLEAR!.robotSays);
    expect(dig.layers[0]!.robotSays).toBe(draft.clearRobotSays);
  });

  it('grounds each layer and the root in exactly its own claim id, never a neighbor\'s', () => {
    const dig = mission.phases[1] as import('../src/engine/types').DigPhase;
    expect(dig.layers[0]!.claims).toEqual(['c1']);
    expect(dig.layers[1]!.claims).toEqual(['c2']);
    expect(dig.root.claims).toEqual(['c3']);
    expect(dig.root.label).toBe('ねっこ');
  });

  it('tags VAGUE and OFFTOPIC archetypes nonfactual, never citing a real claim', () => {
    const slotAssembly = mission.phases[0] as import('../src/engine/types').SlotAssemblyPhase;
    expect(slotAssembly.archetypes.VAGUE!.claims).toEqual(['nonfactual']);
    expect(slotAssembly.archetypes.OFFTOPIC!.claims).toEqual(['nonfactual']);
  });

  it('produces content that passes the deterministic content lint', () => {
    const gradeOf = loadGradeMap();
    const issues = lintMission(mission, 2, gradeOf, new Set(['c1', 'c2', 'c3']));
    expect(issues).toEqual([]);
  });
});
