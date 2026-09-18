/**
 * 03 — RENDER. Approved claims -> stage mission JSON.
 *
 * HARD RULES (spec v0.5 §6):
 *   - refuses to run if ANY claim used is not status: "approved"
 *   - introduces NO factual statement absent from facts.yaml
 *   - every robotSays carries the claim ids it uses, or ["nonfactual"] for flavour
 *   - obeys the stage limits in pipeline/lib/kanji.ts (04 will fail it otherwise)
 *   - exactly one `deepen` card per hand
 *
 * Usage: npx tsx pipeline/03_render.ts <topic-slug> --stage 2 [--mission-id m1-s2-1-2]
 *
 * Model: Claude (claude-opus-5). Requires ANTHROPIC_API_KEY.
 *
 * Design: the SHAPE of the mission (which claim backs which screen, hand size, exactly one
 * deepen, phase structure) is assembled deterministically in this script — never left to the
 * model to get right. The model is only asked to fill in the Japanese text for a fixed set of
 * named slots, each one scoped to a single claim's statement + excerpt (or told explicitly
 * "flavour, not a fact"). That is what makes "introduces no fact absent from facts.yaml"
 * mechanically checkable rather than a hope: every piece of generated text is traceable to
 * exactly the claim(s) it was allowed to see.
 *
 * Claim budget (spec v0.5 §6: "Stage 2 uses claims 1-3 of ~5"; §3's Stage 1/3 rows): each stage
 * renders the FIRST N approved claims (shallow -> deep) into a slot-assembly "what" round
 * (grounded in claim 1) + a dig phase of N-1 layers + a root (claim N) — matching the shape of
 * the one hand-authored example (bread/s2.json) exactly, just at a different N. A topic's claims
 * past a given stage's N are reserved for a deeper stage's render of the SAME topic (the
 * topic-spine reuse model — 01/02 never re-run for a stage bump, see docs/work-order-w2).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parse } from 'yaml';
import type { FactsFile, Claim } from './01_research.js';
import { lintMission } from './04_lint.js';
import { loadGradeMap, STAGE_LIMITS } from './lib/kanji.js';
import type { DigTag, Mission, DigLayer, DigCard } from '../src/engine/types.js';

export function assertAllApproved(facts: FactsFile): void {
  const bad = facts.claims.filter((c) => c.status !== 'approved');
  if (bad.length) {
    throw new Error(
      `Gate 1 not passed for ${facts.topic}: ${bad.map((c) => c.id).join(', ')} still ${bad[0]?.status}. ` +
      'A human must approve each claim before rendering.',
    );
  }
}

export function loadFacts(path: string): FactsFile {
  return parse(readFileSync(path, 'utf8')) as FactsFile;
}

const MODEL = 'claude-opus-5';
/**
 * How many of a topic's approved claims (shallow -> deep) each stage renders. Stage 1's value
 * is a Sprint 1-A plumbing placeholder, not a Stage 1 design decision — see
 * docs/work-order-w2-stage-expansion.md §4/§6, the real number is the spike's to set.
 */
const STAGE_CLAIM_COUNT: Record<number, number> = { 1: 2, 2: 3, 3: 5 };
/** Elementary grade band each stage writes for — prompt wording only, not a lint rule. */
const STAGE_GRADE_LABEL: Record<number, string> = { 1: 'Grade 1-2', 2: 'Grade 3-4', 3: 'Grade 5-6' };
const ROOT_LABEL = 'ねっこ';
const DISTRACTOR_TAGS: Exclude<DigTag, 'deepen'>[] = ['sideways', 'repeat', 'offtopic'];

/** What the model is asked to fill in — pure Japanese text, no structure, no claim ids. */
interface DraftLayerContent {
  /** Opens the layer (the answer the player is currently looking at). Layer 0 is overridden
   *  by clearRobotSays below, so the model's layer-0 value here is never used. */
  robotSays: string;
  deepenCardText: string;
  distractors: { tag: Exclude<DigTag, 'deepen'>; cardText: string; reply: string }[];
  earlyOkAsks: string;
}

interface DraftContent {
  title: string;
  slotCards: { clear: string; vague: string; offtopic: string };
  clearRobotSays: string;
  vagueRobotSays: string;
  vagueTip: string;
  offtopicRobotSays: string;
  layers: DraftLayerContent[];
  rootRobotSays: string;
  tip: string;
  teachBack: string;
  ouchiTalk: string;
}

/** Prose rendering of pipeline/lib/kanji.ts's STAGE_LIMITS[stage] for the model prompt — the
 *  actual limits stay defined in exactly one place, never re-typed as literals here. */
function buildKanjiRule(stage: number): string {
  const limits = STAGE_LIMITS[stage];
  if (!limits) throw new Error(`No STAGE_LIMITS entry for stage ${stage} (pipeline/lib/kanji.ts).`);
  const bareLine =
    limits.bareUpTo === 0
      ? 'No kanji may appear bare.'
      : `Kanji at Grade ${limits.bareUpTo} or below may appear bare.`;
  return (
    `${bareLine} Kanji above Grade ${limits.bareUpTo} up to Grade ${limits.allowedUpTo} MUST be ` +
    `written as ruby markup {漢字|かんじ} (base kanji, then its reading). NEVER use kanji above ` +
    `Grade ${limits.allowedUpTo}.`
  );
}

export function buildSystemPrompt(claims: Claim[], stage: number): string {
  const claimList = claims
    .map((c, i) => `  claim ${i + 1} (id ${c.id}): "${c.statement}"\n    excerpt: "${c.excerpt}"`)
    .join('\n');
  const layerCount = claims.length - 1;
  const limits = STAGE_LIMITS[stage];
  if (!limits) throw new Error(`No STAGE_LIMITS entry for stage ${stage} (pipeline/lib/kanji.ts).`);
  const gradeLabel = STAGE_GRADE_LABEL[stage] ?? `Stage ${stage}`;

  return `You are the render step of a children's education content pipeline, writing for \
Japanese elementary school ${gradeLabel} (Stage ${stage}). You write ONLY the child-facing Japanese \
text for a fixed set of named slots below — the JSON structure itself is assembled by code, not \
you. Never add a slot, never rename one, never add commentary outside the JSON object.

North star (never break this): a shallow first answer, then the player digs deeper layer by \
layer to a root cause. No 正解/不正解, no scores, no right/wrong language anywhere. A flat/weak \
reply is ロボ being unhelpful, not the player being wrong.

Style rules (spec v0.5 §3, enforced by a deterministic lint after you respond — get them right):
- Every sentence <= ${limits.maxSentence} characters.
- ${buildKanjiRule(stage)}
- Never use these words anywhere: 正解, 不正解, まちがい, バカ, テスト, 点数, 追問, 第一性原理,
  文部科学省推奨, 文科省推奨, 認定, 公認, 準拠, 監修.
- Never ask for a name, address, school name, email, or phone number.
- ロボ is the character answering; ポン太 is the character who challenges an early "これでOK".

Claim budget — these are the ONLY facts you may draw on, and each slot below tells you exactly
which claim(s) it may use. Never introduce a fact, mechanism, or number that is not in one of
these claims or its excerpt:
${claimList}

Slots to fill (respond as ONE JSON object with exactly these keys, no prose, no markdown fences):

{
  "title": "a short child-facing restatement of the topic's question",
  "slotCards": {
    "clear": "a clearly-phrased request that asks specifically for claim 1's fact",
    "vague": "a vague version of the same request that does not say what it wants to know",
    "offtopic": "a plausible but unrelated request a child might type instead"
  },
  "clearRobotSays": "ロボ's shallow first answer, using ONLY claim 1",
  "vagueRobotSays": "ロボ's flavour reply to the vague card — funny/unhelpful, not a fact, no claim used",
  "vagueTip": "a short in-character nudge about being specific (not a lecture)",
  "offtopicRobotSays": "ロボ's flavour reply to the off-topic card — not a fact, no claim used",
  "layers": [
    // exactly ${layerCount} objects, one per claim from 1 to ${layerCount} (shallow to deep)
    {
      "robotSays": "ignored for layer 1 (claim 1's answer is reused from clearRobotSays) — still fill it in",
      "deepenCardText": "the ONE follow-up question that reveals the NEXT layer's claim",
      "distractors": [
        // 2-3 objects. tag must be one of "sideways" | "repeat" | "offtopic" (never "deepen" here)
        { "tag": "sideways", "cardText": "a plausible-sounding but wrong follow-up", "reply": "ロボ's flat reply to it" }
      ],
      "earlyOkAsks": "ポン太's push-back question if the player taps これでOK on this layer early"
    }
  ],
  "rootRobotSays": "ロボ's deepest answer, using ONLY the last claim — this is the ねっこ payoff, make it satisfying",
  "tip": "one short in-character coaching line for the post-mission きょうのコツ screen (general, not claim-specific)",
  "teachBack": "a prompt asking the child to explain the answer to a family member, referencing the topic",
  "ouchiTalk": "a short family conversation prompt about asking もう一問 (one more question) in daily life"
}`;
}

/** Pulls the first top-level JSON object out of free-form model text. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in model output:\n${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function validateDraftContent(raw: unknown, layerCount: number): DraftContent {
  const d = raw as Partial<DraftContent>;
  const errors: string[] = [];
  const req = (cond: boolean, msg: string) => { if (!cond) errors.push(msg); };

  req(typeof d.title === 'string' && !!d.title.trim(), 'title missing');
  req(typeof d.slotCards?.clear === 'string' && !!d.slotCards.clear.trim(), 'slotCards.clear missing');
  req(typeof d.slotCards?.vague === 'string' && !!d.slotCards.vague.trim(), 'slotCards.vague missing');
  req(typeof d.slotCards?.offtopic === 'string' && !!d.slotCards.offtopic.trim(), 'slotCards.offtopic missing');
  req(typeof d.clearRobotSays === 'string' && !!d.clearRobotSays.trim(), 'clearRobotSays missing');
  req(typeof d.vagueRobotSays === 'string' && !!d.vagueRobotSays.trim(), 'vagueRobotSays missing');
  req(typeof d.vagueTip === 'string' && !!d.vagueTip.trim(), 'vagueTip missing');
  req(typeof d.offtopicRobotSays === 'string' && !!d.offtopicRobotSays.trim(), 'offtopicRobotSays missing');
  req(typeof d.rootRobotSays === 'string' && !!d.rootRobotSays.trim(), 'rootRobotSays missing');
  req(typeof d.tip === 'string' && !!d.tip.trim(), 'tip missing');
  req(typeof d.teachBack === 'string' && !!d.teachBack.trim(), 'teachBack missing');
  req(typeof d.ouchiTalk === 'string' && !!d.ouchiTalk.trim(), 'ouchiTalk missing');

  if (!Array.isArray(d.layers) || d.layers.length !== layerCount) {
    errors.push(`layers must be an array of exactly ${layerCount}, got ${Array.isArray(d.layers) ? d.layers.length : typeof d.layers}`);
  } else {
    d.layers.forEach((layer, i) => {
      const l = layer as Partial<DraftLayerContent>;
      req(typeof l.robotSays === 'string' && !!l.robotSays.trim(), `layers[${i}].robotSays missing`);
      req(typeof l.deepenCardText === 'string' && !!l.deepenCardText.trim(), `layers[${i}].deepenCardText missing`);
      req(typeof l.earlyOkAsks === 'string' && !!l.earlyOkAsks.trim(), `layers[${i}].earlyOkAsks missing`);
      if (!Array.isArray(l.distractors) || l.distractors.length < 2 || l.distractors.length > 3) {
        errors.push(`layers[${i}].distractors must have 2-3 entries, got ${Array.isArray(l.distractors) ? l.distractors.length : typeof l.distractors}`);
      } else {
        l.distractors.forEach((dr, j) => {
          if (!DISTRACTOR_TAGS.includes(dr.tag)) errors.push(`layers[${i}].distractors[${j}].tag "${dr.tag}" is invalid`);
          if (!dr.cardText?.trim()) errors.push(`layers[${i}].distractors[${j}].cardText missing`);
          if (!dr.reply?.trim()) errors.push(`layers[${i}].distractors[${j}].reply missing`);
        });
      }
    });
  }

  if (errors.length) throw new Error(`Render output failed validation:\n  ${errors.join('\n  ')}`);
  return raw as DraftContent;
}

async function draftContent(claims: Claim[], stage: number): Promise<DraftContent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('03_render requires ANTHROPIC_API_KEY. Set it in this environment and re-run.');
  }
  const client = new Anthropic();
  const layerCount = claims.length - 1;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: buildSystemPrompt(claims, stage),
    messages: [{ role: 'user', content: 'Fill in the slots now.' }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined the render request (stop_reason: refusal).');
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return validateDraftContent(extractJsonObject(text), layerCount);
}

/** Assembles the Mission object deterministically from the draft text + the claim chain. */
export function assembleMission(
  missionId: string,
  stage: number,
  topic: string,
  claims: Claim[],
  draft: DraftContent,
): Mission {
  const layers: DigLayer[] = claims.slice(0, -1).map((claim, i) => {
    const d = draft.layers[i]!;
    const deepenCard: DigCard = { id: `${topic}-l${i}-deepen`, text: d.deepenCardText, tag: 'deepen' };
    const distractorCards: DigCard[] = d.distractors.map((dr, j) => ({
      id: `${topic}-l${i}-d${j}`,
      text: dr.cardText,
      tag: dr.tag,
    }));
    const replies: Partial<Record<Exclude<DigTag, 'deepen'>, string>> = {};
    for (const dr of d.distractors) replies[dr.tag] = dr.reply;

    return {
      robotSays: i === 0 ? draft.clearRobotSays : d.robotSays,
      claims: [claim.id],
      hand: [deepenCard, ...distractorCards],
      replies,
      earlyOk: { challenger: 'ポン太', asks: d.earlyOkAsks },
    };
  });

  const rootClaim = claims[claims.length - 1]!;

  return {
    id: missionId,
    stage: stage as Mission['stage'],
    title: draft.title,
    sources: claims.map((c) => c.id),
    phases: [
      {
        template: 'slot-assembly',
        slots: ['what'],
        cards: [
          { id: `${topic}-w-clear`, slot: 'what', text: draft.slotCards.clear, tag: 'clear' },
          { id: `${topic}-w-vague`, slot: 'what', text: draft.slotCards.vague, tag: 'vague' },
          { id: `${topic}-w-offtopic`, slot: 'what', text: draft.slotCards.offtopic, tag: 'offtopic' },
        ],
        rules: [
          { when: { what: 'clear' }, archetype: 'CLEAR' },
          { when: { what: 'offtopic' }, archetype: 'OFFTOPIC' },
          { when: { what: '*' }, archetype: 'VAGUE' },
        ],
        archetypes: {
          CLEAR: { robotSays: draft.clearRobotSays, claims: [claims[0]!.id] },
          VAGUE: { robotSays: draft.vagueRobotSays, tip: draft.vagueTip, claims: ['nonfactual'] },
          OFFTOPIC: { robotSays: draft.offtopicRobotSays, claims: ['nonfactual'] },
        },
      },
      {
        template: 'dig',
        layers,
        root: { robotSays: draft.rootRobotSays, claims: [rootClaim.id], label: ROOT_LABEL },
      },
    ],
    tip: draft.tip,
    teachBack: draft.teachBack,
    ouchiTalk: draft.ouchiTalk,
  };
}

export async function render(topic: string, stage: number, missionId: string): Promise<Mission> {
  const claimCount = STAGE_CLAIM_COUNT[stage];
  if (!claimCount) {
    const supported = Object.keys(STAGE_CLAIM_COUNT).sort().join(', ');
    throw new Error(
      `Stage ${stage} is not yet supported by 03_render — only stage(s) ${supported} have a ` +
      'STAGE_CLAIM_COUNT entry. Escalate before adding another stage.',
    );
  }

  const factsPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/facts.yaml`);
  const facts = loadFacts(factsPath);
  assertAllApproved(facts);

  if (facts.claims.length < claimCount) {
    throw new Error(
      `${topic} has only ${facts.claims.length} approved claim(s); stage ${stage} needs at ` +
      `least ${claimCount} (spec v0.5 §6: "Stage 2 uses claims 1-3 of ~5").`,
    );
  }
  const claims = facts.claims.slice(0, claimCount);

  const draft = await draftContent(claims, stage);
  const mission = assembleMission(missionId, stage, topic, claims, draft);

  const gradeOf = loadGradeMap();
  const claimIds = new Set(facts.claims.map((c) => c.id));
  const issues = lintMission(mission, stage, gradeOf, claimIds);
  if (issues.length) {
    const lines = issues.map((i) => `  [${i.rule}] ${i.message}${i.text ? ` — in: ${i.text}` : ''}`);
    throw new Error(`Rendered mission failed content lint (nothing was written):\n${lines.join('\n')}`);
  }

  return mission;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const topic = args[0];
  if (!topic || topic.startsWith('--')) {
    console.error('Usage: npx tsx pipeline/03_render.ts <topic-slug> --stage 2 [--mission-id m1-s2-1-2]');
    process.exit(1);
  }
  const stageFlag = args.indexOf('--stage');
  const stage = stageFlag === -1 ? 2 : Number(args[stageFlag + 1]);
  const missionIdFlag = args.indexOf('--mission-id');
  const missionId = missionIdFlag === -1 ? `m1-s${stage}-${topic}` : args[missionIdFlag + 1]!;

  const outPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/s${stage}.json`);
  if (existsSync(outPath)) {
    console.error(`${outPath} already exists. Move or remove it first — 03_render never overwrites rendered content.`);
    process.exit(1);
  }

  const mission = await render(topic, stage, missionId);
  writeFileSync(outPath, `${JSON.stringify(mission, null, 2)}\n`);
  console.log(`Wrote ${outPath} (mission id "${missionId}", ${mission.phases.length} phase(s)).`);
  console.log('Reminder: this is Gate-1-approved content only — it still needs the native-speaker');
  console.log('review stamp (Gate 2, spec v0.5 §6) before RELEASE=1 gate:claims will accept it.');
}

if (process.argv[1]?.endsWith('03_render.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
