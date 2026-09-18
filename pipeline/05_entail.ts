/**
 * 05 — ENTAILMENT. Catches simplification drift: does each robotSays line say ONLY what its
 * claim ids support? Flags for a human; never edits. (Spec v0.5 §6.)
 *
 * The literature is clear that simplification inserts and distorts facts, and that no single
 * automated check is reliable — so this is a filter in front of Gate 1/Gate 2, not a guarantee.
 *
 * Usage: npx tsx pipeline/05_entail.ts <topic-slug> --stage 2
 *
 * Model: OpenAI gpt-4o — a different provider from 03's Claude, same reasoning as 02
 * (spec v0.5 §6: "a model checking itself is not a check"). Requires OPENAI_API_KEY.
 *
 * Writes src/modules/m1/topics/<topic>/entail-report.json (every check + verdict, for Gate 2).
 * Exits non-zero ONLY when a verdict is "contradicts" — "drift" and "ok" are informational.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import type { FactsFile, Claim } from './01_research.js';
import { callOpenAiJson } from './lib/openai.js';

type Verdict = 'ok' | 'drift' | 'contradicts';

export interface ClaimedText {
  /** Human-readable location, e.g. "slot-assembly archetype CLEAR" or "dig layer 1". */
  where: string;
  text: string;
  claimIds: string[];
}

export interface EntailResult extends ClaimedText {
  verdict: Verdict;
  note: string;
}

/** Pure: walks a rendered mission and pulls out every claim-grounded robotSays line. Skips
 *  ["nonfactual"] text — there is nothing to entail-check against no claim. */
export function collectClaimedTexts(mission: unknown): ClaimedText[] {
  const m = mission as { phases?: Record<string, unknown>[] };
  const out: ClaimedText[] = [];

  const add = (where: string, robotSays: unknown, claims: unknown) => {
    if (!Array.isArray(claims) || claims.length === 0) return;
    if (claims.length === 1 && claims[0] === 'nonfactual') return;
    if (typeof robotSays !== 'string' || !robotSays.trim()) return;
    out.push({ where, text: robotSays, claimIds: claims as string[] });
  };

  for (const phase of m.phases ?? []) {
    if (phase.template === 'slot-assembly') {
      for (const [key, a] of Object.entries((phase.archetypes as Record<string, unknown>) ?? {})) {
        const arch = a as { robotSays?: string; claims?: string[] };
        add(`slot-assembly archetype ${key}`, arch.robotSays, arch.claims);
      }
    } else if (phase.template === 'dig') {
      for (const [i, layer] of ((phase.layers as Record<string, unknown>[]) ?? []).entries()) {
        add(`dig layer ${i}`, layer.robotSays, layer.claims);
      }
      const root = phase.root as { robotSays?: string; claims?: string[] } | undefined;
      if (root) add('dig root', root.robotSays, root.claims);
    }
  }
  return out;
}

const SYSTEM_PROMPT = `You are the entailment-check step of a children's education content \
pipeline. A different model already turned approved factual claims into a child-facing \
Japanese sentence. Your only job: does that sentence say ONLY what the given claim(s) support — \
no extra facts, mechanisms, or numbers the claims don't mention, and nothing that contradicts \
them? You are not judging whether the sentence is good writing or age-appropriate — only \
factual containment.

Respond with ONLY a JSON object, no prose:
{"verdict": "ok" | "drift" | "contradicts", "note": "one short sentence explaining why"}

- "ok": the sentence is fully supported by the claim(s), nothing more.
- "drift": the sentence adds an unsupported embellishment or detail not in the claim(s), but \
does not contradict them (simplification drift).
- "contradicts": the sentence states something that conflicts with a claim.`;

async function judge(text: string, claims: Claim[]): Promise<{ verdict: Verdict; note: string }> {
  const claimList = claims.map((c) => `- ${c.id}: "${c.statement}" (excerpt: "${c.excerpt}")`).join('\n');
  const parsed = (await callOpenAiJson(
    SYSTEM_PROMPT,
    `Claim(s):\n${claimList}\n\nSentence to check: ${text}`,
    { requiredBy: '05_entail' },
  )) as { verdict?: string; note?: string };

  const verdict = parsed.verdict;
  if (verdict !== 'ok' && verdict !== 'drift' && verdict !== 'contradicts') {
    throw new Error(`Model returned an invalid verdict: ${JSON.stringify(parsed)}`);
  }
  return { verdict, note: (parsed.note ?? '').trim() || '(no note given)' };
}

export async function entailTopic(topic: string, stage: number): Promise<EntailResult[]> {
  const factsPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/facts.yaml`);
  const missionPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/s${stage}.json`);
  if (!existsSync(factsPath)) throw new Error(`${factsPath} does not exist.`);
  if (!existsSync(missionPath)) throw new Error(`${missionPath} does not exist. Run pipeline/03_render.ts first.`);

  const facts = parse(readFileSync(factsPath, 'utf8')) as FactsFile;
  const claimsById = new Map(facts.claims.map((c) => [c.id, c]));
  const mission = JSON.parse(readFileSync(missionPath, 'utf8'));

  const claimed = collectClaimedTexts(mission);
  const results: EntailResult[] = [];
  for (const item of claimed) {
    const claims = item.claimIds.map((id) => {
      const c = claimsById.get(id);
      if (!c) throw new Error(`${item.where} cites unknown claim ${id} — not in facts.yaml.`);
      return c;
    });
    const { verdict, note } = await judge(item.text, claims);
    results.push({ ...item, verdict, note });
  }
  return results;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const topic = args[0];
  if (!topic || topic.startsWith('--')) {
    console.error('Usage: npx tsx pipeline/05_entail.ts <topic-slug> --stage 2');
    process.exit(1);
  }
  const stageFlag = args.indexOf('--stage');
  const stage = stageFlag === -1 ? 2 : Number(args[stageFlag + 1]);

  const results = await entailTopic(topic, stage);

  const reportPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/entail-report.json`);
  writeFileSync(reportPath, `${JSON.stringify({ topic, stage, checkedAt: new Date().toISOString(), results }, null, 2)}\n`);

  console.log(`Entailment report for "${topic}" (${results.length} check(s)) written to ${reportPath}`);
  for (const r of results) console.log(`  [${r.verdict}] ${r.where}: ${r.note}`);

  const contradicts = results.filter((r) => r.verdict === 'contradicts');
  if (contradicts.length) {
    console.error(`\n${contradicts.length} line(s) contradict their claims — a human must review before Gate 2.`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('05_entail.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
