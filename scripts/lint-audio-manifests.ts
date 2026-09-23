/**
 * Runs the EXISTING content-lint engine (pipeline/lib/lintText.ts — kanji grade, ruby coverage,
 * sentence length, banned/PII words) against every spoken line in src/audio/content/*.json.
 *
 * Why a separate script rather than folding this into pipeline/04_lint.ts: registry.ts's own doc
 * comment explains 04_lint.ts and scripts/gate-claims-approved.ts both walk src/modules treating
 * every *.json as mission content (id/stage/phases/facts.yaml/review stamp) — audio manifests
 * (missionId/role/lines[]) don't have that shape and live outside src/modules specifically so
 * neither gate sweeps them in. This script reuses the SAME rule engine (lintText, loadGradeMap)
 * against the shape audio manifests actually have, rather than inventing new rules.
 *
 * ARCHITECT DECISION (Builder work order thread): audio transcripts are exempt from the
 * `length` rule specifically — spoken dialogue was authored for TTS delivery, not the
 * interactive dig's own short reading-plane beats the 35-char Stage-2 cap was set for. `kanji-
 * grade`/`ruby-required`/`banned-word`/`pii-word` all still apply in full; only `length` is
 * filtered out of this script's own report below. Long lines render on the Listening Pocket's
 * own voice plane with phrase-boundary line breaks (src/ad12/VoicePlane.tsx), not by shortening
 * or chunking the underlying dialogue text.
 *
 * Usage: npx tsx scripts/lint-audio-manifests.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadGradeMap } from '../pipeline/lib/kanji.js';
import { lintText } from '../pipeline/lib/lintText.js';

const AUDIO_DIR = resolve(process.cwd(), 'src/audio/content');
const STAGE = 2; // every Module 1 unit is Stage 2 content, same as its own s2.json.

interface AudioLine { speaker: string; text: string; audioUrl: string; pauseAfterMs: number }
interface AudioScript { missionId: string; role: string; lines?: AudioLine[] }

function main() {
  const gradeOf = loadGradeMap();
  const files = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.json'));
  let totalLines = 0;
  let failingLines = 0;
  const report: { file: string; missionId: string; issues: { line: string; rule: string; message: string }[] }[] = [];

  for (const file of files) {
    const script = JSON.parse(readFileSync(join(AUDIO_DIR, file), 'utf8')) as AudioScript;
    if (!script.lines) continue;
    const issuesForFile: { line: string; rule: string; message: string }[] = [];
    for (const line of script.lines) {
      totalLines += 1;
      // Architect decision (see this file's own header comment): audio transcripts are exempt
      // from `length` specifically — every other rule still applies in full.
      const issues = lintText(line.text, STAGE, gradeOf, { kanjiFloor: false }).filter((i) => i.rule !== 'length');
      if (issues.length > 0) {
        failingLines += 1;
        for (const iss of issues) issuesForFile.push({ line: line.text, rule: iss.rule, message: iss.message });
      }
    }
    if (issuesForFile.length > 0) report.push({ file, missionId: script.missionId, issues: issuesForFile });
  }

  console.log(`Checked ${totalLines} spoken lines across ${files.length} manifests.`);
  if (report.length === 0) {
    console.log('All spoken lines pass content lint (kanji grade / ruby / banned / PII — length exempt per Architect decision).');
    process.exit(0);
  }

  console.log(`${failingLines} line(s) across ${report.length} manifest(s) failed:\n`);
  for (const r of report) {
    console.log(`--- ${r.file} (${r.missionId}) ---`);
    for (const iss of r.issues) {
      console.log(`  [${iss.rule}] ${iss.message}`);
      console.log(`    text: ${iss.line}`);
    }
  }
  process.exit(1);
}

main();
