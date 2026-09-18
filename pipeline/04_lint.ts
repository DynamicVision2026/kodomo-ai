/**
 * 04 — LINT. Deterministic, no LLM, build-breaking. (Spec v0.5 §6, §7.)
 * Checks every mission JSON under src/modules:
 *   schema · kanji grade + ruby per stage · sentence length · exactly one `deepen` per hand
 *   · valid tags · banned words · PII words · claim-id traceability
 *
 * Usage: npm run lint:content
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { loadGradeMap } from './lib/kanji.js';
import { lintText, type LintIssue } from './lib/lintText.js';

const MODULES = resolve(process.cwd(), 'src/modules');
const VALID_DIG_TAGS = new Set(['deepen', 'sideways', 'repeat', 'offtopic']);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.json') && !name.endsWith('module.json')) out.push(p);
  }
  return out;
}

let failures = 0;
const report = (file: string, issues: LintIssue[]) => {
  for (const i of issues) {
    failures++;
    console.error(`FAIL ${file}\n  [${i.rule}] ${i.message}\n  in: ${i.text}`);
  }
};

const gradeOf = loadGradeMap();
const files = walk(MODULES);
if (files.length === 0) console.warn('lint: no mission files found yet.');

for (const file of files) {
  const m = JSON.parse(readFileSync(file, 'utf8'));
  if (!m.id || !m.stage || !Array.isArray(m.phases)) {
    console.error(`FAIL ${file}\n  [schema] missing id, stage or phases`); failures++; continue;
  }
  const stage: number = m.stage;

  // claim traceability against the topic's facts.yaml
  const factsPath = join(file, '..', 'facts.yaml');
  let claimIds = new Set<string>();
  if (existsSync(factsPath)) {
    const facts = parse(readFileSync(factsPath, 'utf8')) as { claims?: { id: string; status: string }[] };
    claimIds = new Set((facts.claims ?? []).map((c) => c.id));
  }
  const checkClaims = (claims: unknown, where: string) => {
    if (!Array.isArray(claims) || claims.length === 0) {
      console.error(`FAIL ${file}\n  [claims] ${where} has no claim ids (use ["nonfactual"] for flavour)`); failures++; return;
    }
    for (const c of claims as string[]) {
      if (c === 'nonfactual') continue;
      if (claimIds.size && !claimIds.has(c)) {
        console.error(`FAIL ${file}\n  [claims] ${where} cites unknown claim ${c}`); failures++;
      }
    }
  };

  const texts: string[] = [m.tip, m.teachBack, m.ouchiTalk].filter(Boolean);

  for (const phase of m.phases) {
    if (phase.template === 'slot-assembly') {
      for (const c of phase.cards ?? []) texts.push(c.text);
      for (const [key, a] of Object.entries(phase.archetypes ?? {})) {
        const arch = a as { robotSays: string; tip?: string; claims?: string[] };
        texts.push(arch.robotSays); if (arch.tip) texts.push(arch.tip);
        checkClaims(arch.claims, `archetype ${key}`);
      }
    } else if (phase.template === 'dig') {
      for (const [n, layer] of (phase.layers ?? []).entries()) {
        texts.push(layer.robotSays);
        checkClaims(layer.claims, `layer ${n}`);
        const deepen = (layer.hand ?? []).filter((c: { tag: string }) => c.tag === 'deepen');
        if (deepen.length !== 1) {
          console.error(`FAIL ${file}\n  [hand] layer ${n} has ${deepen.length} deepen cards, need exactly 1`); failures++;
        }
        for (const c of layer.hand ?? []) {
          texts.push(c.text);
          if (!VALID_DIG_TAGS.has(c.tag)) { console.error(`FAIL ${file}\n  [tag] invalid dig tag ${c.tag}`); failures++; }
        }
        for (const r of Object.values(layer.replies ?? {})) texts.push(r as string);
        if (layer.earlyOk?.asks) texts.push(layer.earlyOk.asks);
      }
      if (phase.root) { texts.push(phase.root.robotSays); checkClaims(phase.root.claims, 'root'); }
    } else {
      console.error(`FAIL ${file}\n  [schema] unknown template ${phase.template}`); failures++;
    }
  }

  for (const t of texts) report(file, lintText(t, stage, gradeOf));
}

if (failures > 0) { console.error(`\ncontent lint: ${failures} failure(s)`); process.exit(1); }
console.log(`content lint: OK (${files.length} mission file(s))`);
