/**
 * 02 — CROSS-CHECK. A DIFFERENT model re-verifies each claim against its own source text
 * and writes a verdict. It only flags; it never changes status. (Spec v0.5 §6.)
 *
 * Usage: npx tsx pipeline/02_crosscheck.ts <topic-slug>
 *
 * Model: OpenAI gpt-4o — deliberately not Claude (01 already used Claude; a model checking
 * itself is not a check). Requires OPENAI_API_KEY.
 *
 * Two checks run per claim, and the mechanical one wins ties:
 *   1. Mechanical (no model): best-effort fetch of the claim's sourceUrl, checking that the
 *      recorded excerpt actually appears on the page verbatim. Catches a fabricated or
 *      misquoted source outright, which an LLM re-reading only the excerpt cannot.
 *   2. Model (gpt-4o): does the excerpt actually entail the statement?
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import type { FactsFile } from './01_research.js';

const MODEL = 'gpt-4o';
const FETCH_TIMEOUT_MS = 10_000;

type Verdict = 'supported' | 'weak' | 'unsupported';

export function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

type MechanicalResult =
  | { status: 'found' }
  | { status: 'not_found' }
  | { status: 'fetch_failed'; reason: string };

/** Best-effort: never throws. A blocked/slow network degrades to "fetch_failed", not a crash. */
async function mechanicalCheck(sourceUrl: string, excerpt: string): Promise<MechanicalResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, { signal: controller.signal });
    if (!res.ok) return { status: 'fetch_failed', reason: `HTTP ${res.status}` };
    const html = await res.text();
    const pageText = normalize(htmlToText(html));
    return pageText.includes(normalize(excerpt))
      ? { status: 'found' }
      : { status: 'not_found' };
  } catch (err) {
    return { status: 'fetch_failed', reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `You are the cross-check step of a children's education content pipeline. You \
re-verify a claim written by a DIFFERENT model against the excerpt it cited. You never approve or \
reject content — you only flag for a human reviewer.

Given a claim's statement and the excerpt cited as its support, judge ONLY whether the excerpt \
actually entails the statement (not whether the statement is true in general — you cannot browse \
the web). Respond with ONLY a JSON object, no prose, shaped exactly like:
{"verdict": "supported" | "weak" | "unsupported", "note": "one short sentence explaining why"}

- "supported": the excerpt directly and clearly supports the statement.
- "weak": the excerpt is related but does not fully establish the statement, or requires an \
inferential leap.
- "unsupported": the excerpt does not support the statement, or contradicts it.`;

async function modelVerdict(statement: string, excerpt: string): Promise<{ verdict: Verdict; note: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      '02_crosscheck requires OPENAI_API_KEY (it must use a different provider from 01\'s ' +
      'Claude — a model checking itself is not a check). Set it in this environment and re-run.',
    );
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Statement: ${statement}\n\nExcerpt: ${excerpt}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = body.choices[0]?.message.content;
  if (!content) throw new Error('OpenAI response had no content.');

  const parsed = JSON.parse(content) as { verdict?: string; note?: string };
  const verdict = parsed.verdict;
  if (verdict !== 'supported' && verdict !== 'weak' && verdict !== 'unsupported') {
    throw new Error(`Model returned an invalid verdict: ${JSON.stringify(parsed)}`);
  }
  return { verdict, note: (parsed.note ?? '').trim() || '(no note given)' };
}

export async function crosscheckTopic(topic: string): Promise<FactsFile> {
  const factsPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/facts.yaml`);
  if (!existsSync(factsPath)) {
    throw new Error(`${factsPath} does not exist. Run pipeline/01_research.ts for "${topic}" first.`);
  }
  const facts = parse(readFileSync(factsPath, 'utf8')) as FactsFile;

  for (const claim of facts.claims) {
    const [mechanical, model] = await Promise.all([
      mechanicalCheck(claim.sourceUrl, claim.excerpt),
      modelVerdict(claim.statement, claim.excerpt),
    ]);

    if (mechanical.status === 'not_found') {
      // The mechanical check overrides a favorable model verdict: an excerpt that isn't
      // actually on the page is a fabricated or misquoted source regardless of how well it
      // reads against the statement.
      claim.crosscheck = {
        verdict: 'unsupported',
        note: `[mechanical] excerpt not found verbatim at sourceUrl. Model said ${model.verdict}: ${model.note}`,
      };
    } else if (mechanical.status === 'fetch_failed') {
      claim.crosscheck = {
        verdict: model.verdict,
        note: `${model.note} (live fetch unavailable: ${mechanical.reason} — verdict based on excerpt text only)`,
      };
    } else {
      claim.crosscheck = { verdict: model.verdict, note: model.note };
    }
    // status is never touched here — Gate 1 owns it.
  }

  return facts;
}

export function writeFacts(facts: FactsFile, outPath: string): void {
  const header =
    '# Generated by pipeline/01_research.ts. Every claim starts "pending" — AI never approves.\n' +
    '# Gate 1 (spec v0.5 §6): a human reviews each claim against its excerpt and sets\n' +
    '# status/approvedBy/approvedAt before pipeline/03_render.ts may use it.\n';
  writeFileSync(outPath, header + stringify(facts, { lineWidth: 0 }));
}

async function main(): Promise<void> {
  const [topic] = process.argv.slice(2);
  if (!topic) {
    console.error('Usage: npx tsx pipeline/02_crosscheck.ts <topic-slug>');
    process.exit(1);
  }

  const facts = await crosscheckTopic(topic);
  const outPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/facts.yaml`);
  writeFacts(facts, outPath);

  console.log(`Cross-checked ${facts.claims.length} claim(s) for "${topic}":`);
  for (const c of facts.claims) console.log(`  ${c.id}: ${c.crosscheck?.verdict} — ${c.crosscheck?.note}`);
}

if (process.argv[1]?.endsWith('02_crosscheck.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
