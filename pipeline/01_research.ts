/**
 * 01 — RESEARCH. Drafts a topic's causal chain as atomic claims with sources.
 * Writes facts.yaml with every claim status: "pending". AI NEVER approves (spec v0.5 §6).
 *
 * Usage: npx tsx pipeline/01_research.ts <topic-slug> "<question in Japanese>"
 *
 * Model: Claude (claude-opus-5), with the web_search server tool restricted to
 * SOURCE_WHITELIST. Requires ANTHROPIC_API_KEY.
 *
 * Rules the prompt enforces:
 *   - 4-6 atomic claims, ordered shallow -> deep, each independently checkable
 *   - EVERY claim needs a source URL from SOURCE_WHITELIST plus the supporting excerpt
 *   - at least one ADULT-level source per claim (child sites are already simplified)
 *   - facts only: never copy explanatory wording
 *   - claims are written language-neutral (English) for Gate 1; Japanese child wording
 *     comes at 03
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { stringify } from 'yaml';

export const SOURCE_WHITELIST = [
  'nhk.or.jp', 'kids.gakken.co.jp', 'jma.go.jp', 'jaxa.jp', 'kahaku.go.jp',
  'go.jp', 'ac.jp', 'britannica.com',
];

const MODEL = 'claude-opus-5';
const MIN_CLAIMS = 4;
const MAX_CLAIMS = 6;

/** AD-02 §6 (WO-11): a claim's verification path. "fact" needs an external source/evidence
 *  (sourceUrl/excerpt/adultLevelSource, exactly as today). "practice" — a stated everyday
 *  rule/practice rather than a factual assertion about the world — has no inherent external-
 *  source requirement; Founder Gate 1 + native-speaker Gate 2 are what validate it instead.
 *  Optional and unenforced by any gate yet: existing claims predate this distinction and are
 *  not required to carry it. The gate/pipeline behavior this implies (e.g. relaxing sourceUrl
 *  for "practice") is intentionally not implemented here — recording the contract only, for the
 *  next content ticket to build against. */
export type ClaimType = 'fact' | 'practice';

export interface Claim {
  id: string;            // c1, c2, ...
  statement: string;     // language-neutral, atomic
  /** AD-02 §6 — defaults to 'fact' in spirit (every claim to date has been evidence-backed);
   *  absent on any claim written before this field existed. */
  type?: ClaimType;
  sourceUrl: string;
  excerpt: string;
  adultLevelSource: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  crosscheck?: { verdict: 'supported' | 'weak' | 'unsupported'; note: string };
}

export interface FactsFile {
  topic: string;
  question: string;
  claims: Claim[];
}

/** What the model is asked to return — no status/approval fields; we set those ourselves. */
export interface DraftClaim {
  statement: string;
  sourceUrl: string;
  excerpt: string;
  adultLevelSource: boolean;
}

const SYSTEM_PROMPT = `You are the research step of a children's education content pipeline. You draft \
FACT CANDIDATES for a founder to review — you never decide what is true or what ships. A later, \
separate human review (Gate 1) is the only thing that approves a claim.

Topic domain: everyday science / how things work / simple social studies, explained to a Japanese \
elementary-school child (grades 3-4) later in the pipeline — but YOU write for an adult reviewer, \
in English, not for a child.

For the given topic and question, use web search to build a causal chain of ${MIN_CLAIMS}-${MAX_CLAIMS} \
ATOMIC claims, ordered from shallow (the first, most obvious answer) to deep (the root cause / \
mechanism). Each claim must be independently checkable on its own.

Hard rules:
1. ${MIN_CLAIMS}-${MAX_CLAIMS} claims total, ordered shallow -> deep.
2. Every claim needs exactly one sourceUrl. It MUST be on one of these domains (or a subdomain of \
one of them): ${SOURCE_WHITELIST.join(', ')}. Never invent or guess a URL — only cite a URL you \
actually retrieved via web search.
3. Every claim needs an excerpt: a short VERBATIM quotation copied from that source page that \
directly supports the claim. Never paraphrase the excerpt, never write an excerpt that does not \
literally appear on the page.
4. adultLevelSource must be true for every claim — the source must be adult/general-audience \
material (encyclopedia, research institute, government agency, news), not a children's site. You \
may use a children's site only as style reference, never as the recorded source.
5. statement must be a plain FACT, atomic (one causal step), written in English, language-neutral \
(no child-friendly phrasing, no explanation prose, no "because" chains — just the fact itself). \
Never copy explanatory wording from the source; state the fact in your own words while keeping the \
excerpt verbatim.
6. Do not include status, approvedBy, approvedAt, or crosscheck fields — you never approve content.

Respond with ONLY a JSON array (no prose, no markdown fences) of ${MIN_CLAIMS}-${MAX_CLAIMS} objects, \
each shaped exactly like:
{"statement": "...", "sourceUrl": "...", "excerpt": "...", "adultLevelSource": true}`;

export function hostnameAllowed(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SOURCE_WHITELIST.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Pulls the first top-level JSON array out of free-form model text. */
export function extractJsonArray(text: string): unknown {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON array found in model output:\n${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function validateDraftClaims(raw: unknown): DraftClaim[] {
  if (!Array.isArray(raw)) throw new Error('Model output is not a JSON array.');
  if (raw.length < MIN_CLAIMS || raw.length > MAX_CLAIMS) {
    throw new Error(`Model returned ${raw.length} claims; expected ${MIN_CLAIMS}-${MAX_CLAIMS}.`);
  }

  const errors: string[] = [];
  const claims: DraftClaim[] = raw.map((entry, i) => {
    const c = entry as Partial<DraftClaim>;
    const tag = `claim[${i}]`;
    if (typeof c.statement !== 'string' || !c.statement.trim()) errors.push(`${tag}: missing statement`);
    if (typeof c.sourceUrl !== 'string' || !c.sourceUrl.trim()) errors.push(`${tag}: missing sourceUrl`);
    else if (!hostnameAllowed(c.sourceUrl)) errors.push(`${tag}: sourceUrl "${c.sourceUrl}" is not on the source whitelist`);
    if (typeof c.excerpt !== 'string' || c.excerpt.trim().length < 10) errors.push(`${tag}: excerpt missing or too short`);
    if (c.adultLevelSource !== true) errors.push(`${tag}: adultLevelSource must be true (child-level sources may not be the recorded source)`);
    return {
      statement: (c.statement ?? '').trim(),
      sourceUrl: (c.sourceUrl ?? '').trim(),
      excerpt: (c.excerpt ?? '').trim(),
      adultLevelSource: c.adultLevelSource === true,
    };
  });

  if (errors.length) {
    throw new Error(`Research output failed validation:\n  ${errors.join('\n  ')}`);
  }
  return claims;
}

export async function research(topic: string, question: string): Promise<FactsFile> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      '01_research requires ANTHROPIC_API_KEY (Claude does the research + web search). ' +
      'Set it in this environment and re-run.',
    );
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Topic slug: ${topic}\nQuestion (Japanese): ${question}` },
  ];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10, allowed_domains: SOURCE_WHITELIST }],
    messages,
  });

  // Server tools run on Anthropic's infrastructure; a long search turn can still come back
  // paused rather than finished, in which case we resume it rather than treating it as done.
  while (response.stop_reason === 'pause_turn') {
    messages.push({ role: 'assistant', content: response.content });
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10, allowed_domains: SOURCE_WHITELIST }],
      messages,
    });
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined the research request (stop_reason: refusal).');
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const draftClaims = validateDraftClaims(extractJsonArray(text));

  const claims: Claim[] = draftClaims.map((c, i) => ({
    id: `c${i + 1}`,
    statement: c.statement,
    sourceUrl: c.sourceUrl,
    excerpt: c.excerpt,
    adultLevelSource: c.adultLevelSource,
    status: 'pending',
  }));

  return { topic, question, claims };
}

export function writeFacts(facts: FactsFile, outPath: string): void {
  const header =
    '# Generated by pipeline/01_research.ts. Every claim starts "pending" — AI never approves.\n' +
    '# Gate 1 (spec v0.5 §6): a human reviews each claim against its excerpt and sets\n' +
    '# status/approvedBy/approvedAt before pipeline/03_render.ts may use it.\n';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, header + stringify(facts, { lineWidth: 0 }));
}

async function main(): Promise<void> {
  const [topic, question] = process.argv.slice(2);
  if (!topic || !question) {
    console.error('Usage: npx tsx pipeline/01_research.ts <topic-slug> "<question in Japanese>"');
    process.exit(1);
  }

  const outPath = resolve(process.cwd(), `src/modules/m1/topics/${topic}/facts.yaml`);
  if (existsSync(outPath)) {
    console.error(
      `${outPath} already exists. Move or remove it first — 01_research never overwrites ` +
      'existing research (it may already carry crosscheck results or approvals).',
    );
    process.exit(1);
  }

  const facts = await research(topic, question);
  writeFacts(facts, outPath);

  console.log(`Wrote ${facts.claims.length} pending claim(s) to ${outPath}`);
  for (const c of facts.claims) console.log(`  ${c.id}: ${c.statement}`);
}

if (process.argv[1]?.endsWith('01_research.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
