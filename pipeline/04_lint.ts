/**
 * 04 — LINT. Deterministic, no LLM, build-breaking. (Spec v0.5 §6, §7.)
 * Checks every mission JSON under src/modules:
 *   schema · kanji grade + ruby per stage · sentence length · exactly one `deepen` per hand
 *   · valid tags · banned words · PII words · claim-id traceability
 *
 * Usage: npm run lint:content
 *
 * lintMission() is exported so 03_render.ts can run the exact same checks on freshly
 * rendered content before writing it to disk — one set of rules, not two that can drift.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { loadGradeMap, type GradeMap } from './lib/kanji.js';
import { lintText, type LintIssue } from './lib/lintText.js';

const MODULES = resolve(process.cwd(), 'src/modules');
const VALID_DIG_TAGS = new Set(['deepen', 'sideways', 'repeat', 'offtopic']);

export interface MissionLintIssue {
  rule: string;
  message: string;
  text?: string;
}

/**
 * Lints one parsed mission object. Pure — no filesystem access beyond the claimIds already
 * resolved by the caller (03_render has these in memory; the CLI below reads them from disk).
 */
export function lintMission(mission: unknown, stage: number, gradeOf: GradeMap, claimIds: Set<string>): MissionLintIssue[] {
  const issues: MissionLintIssue[] = [];
  const m = mission as {
    id?: string; stage?: number; phases?: unknown[];
    tip?: string; teachBack?: string; ouchiTalk?: string;
  };

  if (!m.id || !m.stage || !Array.isArray(m.phases)) {
    return [{ rule: 'schema', message: 'missing id, stage or phases' }];
  }

  const checkClaims = (claims: unknown, where: string) => {
    if (!Array.isArray(claims) || claims.length === 0) {
      issues.push({ rule: 'claims', message: `${where} has no claim ids (use ["nonfactual"] for flavour)` });
      return;
    }
    for (const c of claims as string[]) {
      if (c === 'nonfactual') continue;
      if (claimIds.size && !claimIds.has(c)) {
        issues.push({ rule: 'claims', message: `${where} cites unknown claim ${c}` });
      }
    }
  };

  const texts: string[] = [m.tip, m.teachBack, m.ouchiTalk].filter((t): t is string => Boolean(t));

  for (const phase of m.phases as Record<string, unknown>[]) {
    if (phase.template === 'slot-assembly') {
      for (const c of (phase.cards as { text: string }[]) ?? []) texts.push(c.text);
      for (const [key, a] of Object.entries((phase.archetypes as Record<string, unknown>) ?? {})) {
        const arch = a as { robotSays: string; tip?: string; claims?: string[] };
        texts.push(arch.robotSays);
        if (arch.tip) texts.push(arch.tip);
        checkClaims(arch.claims, `archetype ${key}`);
      }
    } else if (phase.template === 'dig') {
      for (const [n, layer] of ((phase.layers as Record<string, unknown>[]) ?? []).entries()) {
        texts.push(layer.robotSays as string);
        checkClaims(layer.claims, `layer ${n}`);
        const hand = (layer.hand as { tag: string; text: string }[]) ?? [];
        const deepen = hand.filter((c) => c.tag === 'deepen');
        if (deepen.length !== 1) {
          issues.push({ rule: 'hand', message: `layer ${n} has ${deepen.length} deepen cards, need exactly 1` });
        }
        for (const c of hand) {
          texts.push(c.text);
          if (!VALID_DIG_TAGS.has(c.tag)) issues.push({ rule: 'tag', message: `invalid dig tag ${c.tag}` });
        }
        for (const r of Object.values((layer.replies as Record<string, string>) ?? {})) texts.push(r);
        const earlyOk = layer.earlyOk as { asks?: string } | undefined;
        if (earlyOk?.asks) texts.push(earlyOk.asks);
      }
      const root = phase.root as { robotSays: string; claims?: string[] } | undefined;
      if (root) { texts.push(root.robotSays); checkClaims(root.claims, 'root'); }
    } else {
      issues.push({ rule: 'schema', message: `unknown template ${phase.template}` });
    }
  }

  for (const t of texts) {
    for (const i of lintText(t, stage, gradeOf)) issues.push({ ...i });
  }

  return issues;
}

/** Lints a deck file (src/modules/<mod>/deck.s<stage>.json) — an array of print cards, not a
 *  mission. Same child-facing text rules apply (kanji grade, ruby, length, banned/PII words). */
export function lintDeck(deck: unknown, stage: number, gradeOf: GradeMap): MissionLintIssue[] {
  const d = deck as { cards?: unknown[] };
  if (!Array.isArray(d.cards) || d.cards.length === 0) {
    return [{ rule: 'schema', message: 'deck file has no "cards" array' }];
  }
  const issues: MissionLintIssue[] = [];
  for (const raw of d.cards) {
    const c = raw as { id?: string; kind?: string; text?: string };
    if (!c.id || !c.kind) { issues.push({ rule: 'schema', message: `card missing id or kind: ${JSON.stringify(c)}` }); continue; }
    if (typeof c.text !== 'string' || !c.text.trim()) { issues.push({ rule: 'schema', message: `card ${c.id} has no text` }); continue; }
    for (const i of lintText(c.text, stage, gradeOf)) issues.push({ ...i });
  }
  return issues;
}

const DECK_FILENAME = /deck\.s(\d+)\.json$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.json') && !name.endsWith('module.json')) out.push(p);
  }
  return out;
}

function main(): void {
  let failures = 0;
  const gradeOf = loadGradeMap();
  const files = walk(MODULES);
  if (files.length === 0) console.warn('lint: no mission files found yet.');

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const deckMatch = file.match(DECK_FILENAME);

    let issues: MissionLintIssue[];
    if (deckMatch) {
      issues = lintDeck(parsed, Number(deckMatch[1]), gradeOf);
    } else {
      const factsPath = join(file, '..', 'facts.yaml');
      let claimIds = new Set<string>();
      if (existsSync(factsPath)) {
        const facts = parse(readFileSync(factsPath, 'utf8')) as { claims?: { id: string }[] };
        claimIds = new Set((facts.claims ?? []).map((c) => c.id));
      }
      const stage = (parsed as { stage?: number }).stage ?? 0;
      issues = lintMission(parsed, stage, gradeOf, claimIds);
    }

    for (const issue of issues) {
      failures++;
      console.error(`FAIL ${file}\n  [${issue.rule}] ${issue.message}${issue.text ? `\n  in: ${issue.text}` : ''}`);
    }
  }

  if (failures > 0) { console.error(`\ncontent lint: ${failures} failure(s)`); process.exit(1); }
  console.log(`content lint: OK (${files.length} mission file(s))`);
}

if (process.argv[1]?.endsWith('04_lint.ts')) main();
