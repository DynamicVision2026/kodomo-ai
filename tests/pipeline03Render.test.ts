import { describe, it, expect } from 'vitest';
import { extractJsonObject, assembleMission, assertAllApproved, loadFacts, validateDraftContent, buildSystemPrompt } from '../pipeline/03_render';
import { lintMission } from '../pipeline/04_lint';
import { loadGradeMap, STAGE_LIMITS } from '../pipeline/lib/kanji';
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

  it('produces content that passes the deterministic content lint aside from v0.6 gap/move/domain metadata', () => {
    // WO-01: assembleMission() doesn't populate gap/move/domain — that's pipeline/content-
    // generation work, out of scope for the schema+validation-only ticket that added these
    // checks. The honest result is that generated Stage-2 content flags all three per layer.
    const gradeOf = loadGradeMap();
    const issues = lintMission(mission, 2, gradeOf, new Set(['c1', 'c2', 'c3']));
    expect(issues).toEqual([
      { rule: 'gap', message: 'layer 0 is missing gap (v0.6 content contract)' },
      { rule: 'move', message: 'layer 0 deepen card is missing move (v0.6 content contract)' },
      { rule: 'domain', message: 'layer 0 deepen card is missing domain (v0.6 content contract)' },
      { rule: 'gap', message: 'layer 1 is missing gap (v0.6 content contract)' },
      { rule: 'move', message: 'layer 1 deepen card is missing move (v0.6 content contract)' },
      { rule: 'domain', message: 'layer 1 deepen card is missing domain (v0.6 content contract)' },
    ]);
  });
});

// Sprint 1-A: 03_render is no longer Stage-2-only. Same fixture shape, one more claim, proving
// assembleMission's layer/root math (claims.length - 1 layers, last claim is the root) holds at
// a different N — this is a test-only addition, not a logic change (docs/work-order-w2 §2.1).
describe('03_render: assembleMission at a non-Stage-2 claim count (Stage 3, 5 claims)', () => {
  const claims5: Claim[] = [
    claim('c1', 'いちばん あさい じじつ'),
    claim('c2', 'つぎに ふかい じじつ'),
    claim('c3', 'さらに ふかい じじつ'),
    claim('c4', 'もっと ふかい じじつ'),
    claim('c5', 'いちばん ふかい じじつ'),
  ];
  const draft5 = {
    ...draft,
    layers: [
      draft.layers[0]!,
      draft.layers[1]!,
      { ...draft.layers[1]!, robotSays: 'それはね、さらに ふかい じじつだよ' },
      { ...draft.layers[1]!, robotSays: 'それはね、もっと ふかい じじつだよ' },
    ],
    rootRobotSays: 'それはね、いちばん ふかい じじつだよ',
  };
  const mission5 = assembleMission('m1-s3-test', 3, 'test', claims5, draft5);

  it('builds one dig layer per claim except the last (4 layers for 5 claims)', () => {
    const dig = mission5.phases[1] as import('../src/engine/types').DigPhase;
    expect(dig.layers).toHaveLength(4);
    expect(dig.root.claims).toEqual(['c5']);
  });

  it('passes the deterministic content lint at stage 3', () => {
    const gradeOf = loadGradeMap();
    const issues = lintMission(mission5, 3, gradeOf, new Set(['c1', 'c2', 'c3', 'c4', 'c5']));
    expect(issues).toEqual([]);
  });
});

describe('03_render: buildSystemPrompt is parametrized by stage, not hardcoded to Stage 2', () => {
  it('interpolates each stage\'s own STAGE_LIMITS instead of a fixed Stage-2 literal', () => {
    for (const stage of [1, 2, 3] as const) {
      const prompt = buildSystemPrompt(claims, stage);
      const limits = STAGE_LIMITS[stage]!;
      expect(prompt).toContain(`Every sentence <= ${limits.maxSentence} characters.`);
      expect(prompt).toContain(`NEVER use kanji above Grade ${limits.allowedUpTo}.`);
    }
  });

  it('produces a different prompt string for each stage', () => {
    const p1 = buildSystemPrompt(claims, 1);
    const p2 = buildSystemPrompt(claims, 2);
    const p3 = buildSystemPrompt(claims, 3);
    expect(p1).not.toBe(p2);
    expect(p2).not.toBe(p3);
  });

  it('says "no kanji may appear bare" at stage 1, where bareUpTo is 0', () => {
    expect(buildSystemPrompt(claims, 1)).toContain('No kanji may appear bare.');
  });
});
