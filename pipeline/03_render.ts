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
 * Usage: npx tsx pipeline/03_render.ts <topic-slug> --stage 2
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { FactsFile } from './01_research.js';

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

if (process.argv[1]?.endsWith('03_render.ts')) {
  console.error('03_render: not yet wired to a model. assertAllApproved/loadFacts are ready to use.');
  process.exit(1);
}
