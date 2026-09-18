/**
 * TAG AUDIT. A second model classifies every follow-up card BLIND (deepen / sideways / repeat /
 * offtopic) with no sight of the authored tag; mismatches are flagged for a human.
 * Protects the core mechanic: a mis-tagged card teaches the wrong lesson. (Spec v0.5 §6.)
 *
 * Usage: npx tsx pipeline/tag_audit.ts <topic-slug> --stage 2
 *
 * Model: OpenAI gpt-4o — a different provider from 03's Claude, which authored the tags.
 * Requires OPENAI_API_KEY.
 *
 * Flags only — never rewrites a tag. Writes src/modules/m1/topics/<topic>/tag-audit-report.json
 * and always exits 0 on a successful run (the report is for Gate 2, not a build gate); only a
 * hard error (missing file, missing key, bad model output) exits non-zero.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { callOpenAiJson } from './lib/openai.js';

const VALID_TAGS = ['deepen', 'sideways', 'repeat', 'offtopic'] as const;
type DigTag = (typeof VALID_TAGS)[number];

export interface AuditCard {
  where: string;
  cardId: string;
  text: string;
  authoredTag: DigTag;
  /** What the layer's dig screen is currently saying — the only context the blind model gets. */
  context: string;
}

export interface AuditResult extends AuditCard {
  blindTag: string;
  mismatch: boolean;
  /** "high": disagreement on whether this card is THE deepen card — breaks the core mechanic.
   *  "low": the three distractor tags disagree among themselves — a flavour-text nuance. */
  severity: 'high' | 'low' | null;
}

/** Pure: walks a rendered mission and pulls out every dig hand card with its layer context. */
export function collectHandCards(mission: unknown): AuditCard[] {
  const m = mission as { phases?: Record<string, unknown>[] };
  const out: AuditCard[] = [];

  for (const phase of m.phases ?? []) {
    if (phase.template !== 'dig') continue;
    for (const [i, layer] of ((phase.layers as Record<string, unknown>[]) ?? []).entries()) {
      const context = layer.robotSays as string;
      for (const card of (layer.hand as { id: string; text: string; tag: string }[]) ?? []) {
        if (!VALID_TAGS.includes(card.tag as DigTag)) continue; // 04_lint already flags this
        out.push({ where: `dig layer ${i}`, cardId: card.id, text: card.text, authoredTag: card.tag as DigTag, context });
      }
    }
  }
  return out;
}

const SYSTEM_PROMPT = `You are the tag-audit step of a children's education content pipeline. \
You are shown what a character (ロボ) just said, and a follow-up question a child might ask \
next. Classify what would happen if that follow-up were played, choosing exactly one:

- "deepen": asks about the cause or mechanism BEHIND what was just said — playing it should \
reveal a deeper, more specific answer.
- "sideways": a plausible, related-sounding follow-up that does NOT deepen this specific \
answer — a tempting but wrong turn.
- "repeat": essentially asks for the same thing again, with no new angle.
- "offtopic": unrelated to what was just said.

You are NOT told which tag the content author intended — classify blind, from the text alone.

Respond with ONLY a JSON object: {"tags": [{"id": "<card id>", "tag": "deepen"|"sideways"|"repeat"|"offtopic"}, ...]}
one entry per card, in the order given.`;

async function classifyLayer(cards: AuditCard[]): Promise<Map<string, string>> {
  const context = cards[0]!.context;
  const cardList = cards.map((c) => `- id ${c.cardId}: "${c.text}"`).join('\n');
  const parsed = (await callOpenAiJson(
    SYSTEM_PROMPT,
    `ロボ just said: ${context}\n\nCandidate follow-ups:\n${cardList}`,
    { requiredBy: 'tag_audit' },
  )) as { tags?: { id?: string; tag?: string }[] };

  if (!Array.isArray(parsed.tags)) throw new Error(`Model output missing "tags" array: ${JSON.stringify(parsed)}`);
  const map = new Map<string, string>();
  for (const t of parsed.tags) {
    if (!t.id || !t.tag) throw new Error(`Model returned a malformed tag entry: ${JSON.stringify(t)}`);
    map.set(t.id, t.tag);
  }
  for (const c of cards) {
    if (!map.has(c.cardId)) throw new Error(`Model did not classify card ${c.cardId} (layer: ${c.where}).`);
  }
  return map;
}

export function severityOf(authored: DigTag, blind: string): AuditResult['severity'] {
  if (authored === blind) return null;
  const authoredIsDeepen = authored === 'deepen';
  const blindIsDeepen = blind === 'deepen';
  return authoredIsDeepen !== blindIsDeepen ? 'high' : 'low';
}

export async function auditTopic(topic: string, stage: number): Promise<AuditResult[]> {
  const missionPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/s${stage}.json`);
  if (!existsSync(missionPath)) throw new Error(`${missionPath} does not exist. Run pipeline/03_render.ts first.`);
  const mission = JSON.parse(readFileSync(missionPath, 'utf8'));

  const cards = collectHandCards(mission);
  const byLayer = new Map<string, AuditCard[]>();
  for (const c of cards) {
    const list = byLayer.get(c.where) ?? [];
    list.push(c);
    byLayer.set(c.where, list);
  }

  const results: AuditResult[] = [];
  for (const layerCards of byLayer.values()) {
    const blindTags = await classifyLayer(layerCards);
    for (const c of layerCards) {
      const blindTag = blindTags.get(c.cardId)!;
      results.push({ ...c, blindTag, mismatch: blindTag !== c.authoredTag, severity: severityOf(c.authoredTag, blindTag) });
    }
  }
  return results;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const topic = args[0];
  if (!topic || topic.startsWith('--')) {
    console.error('Usage: npx tsx pipeline/tag_audit.ts <topic-slug> --stage 2');
    process.exit(1);
  }
  const stageFlag = args.indexOf('--stage');
  const stage = stageFlag === -1 ? 2 : Number(args[stageFlag + 1]);

  const results = await auditTopic(topic, stage);

  const reportPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/tag-audit-report.json`);
  writeFileSync(reportPath, `${JSON.stringify({ topic, stage, checkedAt: new Date().toISOString(), results }, null, 2)}\n`);

  const mismatches = results.filter((r) => r.mismatch);
  console.log(`Tag audit for "${topic}": ${results.length} card(s), ${mismatches.length} mismatch(es). Report: ${reportPath}`);
  for (const r of mismatches) {
    console.log(`  [${r.severity}] ${r.where} card ${r.cardId}: authored "${r.authoredTag}", blind model said "${r.blindTag}" — "${r.text}"`);
  }
  if (mismatches.some((r) => r.severity === 'high')) {
    console.log('\nHigh-severity mismatch(es) disagree on which card actually deepens — flag for Gate 2, this is not auto-blocking.');
  }
}

if (process.argv[1]?.endsWith('tag_audit.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
