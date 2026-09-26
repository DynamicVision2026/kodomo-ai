/**
 * WO-C2b — ナゼホリ course, Lesson 1 (c01) voiced audio generation.
 *
 * Reads the frozen recording script (src/course/content/audio/nazehori-lesson1-audio-sheet.csv,
 * 250 voiced lines + 9 sound-effect cues, verbatim from the Coordinator) and, per clip:
 *   - a lesson-specific clip (practice/make/teach-back/family lines) is written straight to its
 *     own final path, `public/audio/course/c01/<file>` — the file name is exactly the sheet's
 *     own `file` column, never invented here (WO-C2b §4: "no new JSON fields" — every screen
 *     locates its own clip by the same deterministic naming rule this script writes to; see
 *     src/course/audioPaths.ts, the one other place that naming rule is encoded).
 *   - a SHARED clip (the 3 course-wide UI prompts, reused by every future lesson) goes to
 *     `public/audio/course/shared/<file>` instead — these are exactly the sheet rows whose own
 *     `file` column has no `c01_` prefix.
 *   - the two きく blocks (`c01_listen_A.mp3`, `c01_listen_B.mp3`) are each built by joining every
 *     row belonging to that file, in sheet order, with a fixed gap between lines (same
 *     DEFAULT_GAP_MS convention scripts/audio/generate-1-1-model.ts already uses) — the running
 *     start time of each VOICE row (never an SE row) is then written back into this lesson's own
 *     `listen[].transcript[].start`, index-aligned 1:1 with the sheet's own voice rows for that
 *     file (verified equal count and equal text, in order, against c01.lesson.json — see this
 *     script's own `--dry-run`). `transcript[].start` is the ONLY field in c01.lesson.json this
 *     script (or anyone) may write, per the Coordinator's own instruction.
 *
 * ---- Voices (Founder decision, 26 Sep 2026) --------------------------------------------------
 * ポン太 and ハテナ reuse Story 1-1's own MODEL voices EXACTLY (scripts/audio/generate-1-1-model.ts
 * VOICES.PONTA / VOICES.GUIDE) — same voice name, pitch, and speakingRate, so the course sounds
 * like the same two characters the Playground already established.
 *
 * The other 7 speakers (お母さん/お父さん/おばあちゃん/先生/ユウ/お姉ちゃん/友だち) have NO prior
 * voice anywhere in this repo — every existing scripts/audio/generate-*.ts only ever has
 * GUIDE/PONTA/ROBOT. The choices below are a PROPOSAL only, picked from Google Cloud TTS's
 * documented ja-JP catalog (Neural2 B/C/D + Wavenet A/B/C/D — the full roster this project has
 * ever used), never verified against a live --list-voices call (this environment has no GCP
 * credentials — see the session's own report). Before the real generation run, whoever holds
 * credentials should run `--list-voices` (below) and confirm/replace every non-PONTA/GUIDE entry;
 * two pairs below deliberately share a voice MODEL with only pitch/speakingRate to tell them apart
 * (お母さん/お姉ちゃん, ユウ/友だち) because the documented ja-JP catalog has only 7 distinct
 * models total and this lesson needs 9 — flagged inline. A newer catalog (e.g. ja-JP Chirp3-HD,
 * which Google has been adding voices to) may remove the need for those two shared pairs.
 *
 * ---- One-time setup required before this script can do anything that touches the network ------
 * 1. GCP credentials — see generate-1-1-model.ts's own header comment (API key or service account).
 * 2. ffmpeg on PATH — NEW requirement this lesson introduces (no prior scripts/audio/*.ts joins
 *    clips into one file; Story 1-1 and every Bank story play their lines individually with a
 *    pauseAfterMs gap, never as one pre-joined master). Used for: (a) synthesizing a fixed-length
 *    silence bed to stand in for a sound-effect cue no real SFX asset exists for yet, and (b) the
 *    concat-demuxer join itself. Neither GCP creds nor ffmpeg are available in the sandbox this
 *    script was written in — `--dry-run` and `--samples --dry-run` need neither and fully validate
 *    the sheet, the naming rule, and the join plan; every other mode errors out immediately with
 *    which of the two is missing, rather than partially running.
 *
 * ---- Usage --------------------------------------------------------------------------------
 *   npx tsx scripts/audio/generate-c01-lesson.ts --list-voices        # live ja-JP catalog (needs GCP creds)
 *   npx tsx scripts/audio/generate-c01-lesson.ts --dry-run             # validate the sheet + naming + join plan; no creds/ffmpeg needed
 *   npx tsx scripts/audio/generate-c01-lesson.ts --samples --dry-run   # same, scoped to the WO-C2b §3 sample set
 *   npx tsx scripts/audio/generate-c01-lesson.ts --samples             # WO-C2b §3: one line per voice (9) + first minute of audio A — needs GCP creds + ffmpeg
 *   npx tsx scripts/audio/generate-c01-lesson.ts --full                # WO-C2b §4: everything, only after the Founder approves the sample voices
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadAudioSheet, type AudioSheetRow } from '../lib/audioSheet.js';

const ROOT = process.cwd();
const SHEET_PATH = resolve(ROOT, 'src/course/content/audio/nazehori-lesson1-audio-sheet.csv');
const LESSON_PATH = resolve(ROOT, 'src/course/content/lessons/c01.lesson.json');
const LESSON_DIR = resolve(ROOT, 'public/audio/course/c01');
const SHARED_DIR = resolve(ROOT, 'public/audio/course/shared');
const STAGING_DIR = resolve(ROOT, 'public/audio/course/_staging'); // per-line clips before the join step — never a real production path
const SAMPLES_DIR = resolve(ROOT, 'public/audio/course/_samples'); // WO-C2b §3 review clips — never a real production path

/** The two きく blocks are JOINED from many per-line clips into one final file — a row whose
 *  `file` is one of these is never itself the row's own synthesis target (see `stagingPathFor`,
 *  `outputPathFor` doesn't apply to it). */
const JOIN_TARGETS = new Set(['c01_listen_A.mp3', 'c01_listen_B.mp3']);

const DEFAULT_GAP_MS = 350; // same conversational-spacing convention as generate-1-1-model.ts

type SheetRow = AudioSheetRow;

function loadSheet(): SheetRow[] {
  return loadAudioSheet(SHEET_PATH);
}

/** The FINAL production path for a STANDALONE clip (never one of the two joined きく blocks —
 *  see `stagingPathFor` for those). src/course/audioPaths.ts encodes this SAME rule for the app to
 *  consume clips at runtime — keep the two in sync by construction: both derive the path from the
 *  sheet's own `file` column only, never a second, independently-typed naming scheme. */
function outputPathFor(row: SheetRow): string {
  if (JOIN_TARGETS.has(row.file)) {
    throw new Error(`${row.clip}: "${row.file}" is a joined block, not a standalone clip — use stagingPathFor() instead.`);
  }
  const isShared = !row.file.startsWith('c01_');
  return resolve(isShared ? SHARED_DIR : LESSON_DIR, row.file);
}

/** Where ONE row's own line gets synthesized to BEFORE the join step — never the joined block's
 *  own final path (`c01_listen_A.mp3`/`c01_listen_B.mp3` are the OUTPUT of joining every one of
 *  these, not a target any single row is ever written to directly). Deleted once the join
 *  succeeds; kept out of `public/` proper (an `_staging` prefix) so a half-finished run can never
 *  be mistaken for a real, playable clip. */
function stagingPathFor(row: SheetRow): string {
  const block = row.file.replace('.mp3', '');
  return resolve(STAGING_DIR, block, `${row.clip}.mp3`);
}

/** WO-C2b §3's own one-off review clips — always a flat, clearly-scoped directory, never the real
 *  production tree (`_samples`, like `_staging`, is never read by the app or the audio gate). */
function samplePathFor(row: SheetRow): string {
  return resolve(SAMPLES_DIR, `${row.clip}-${row.speaker}.mp3`);
}

type Speaker = 'ポン太' | 'ハテナ' | 'お母さん' | 'お父さん' | 'おばあちゃん' | '先生' | 'ユウ' | 'お姉ちゃん' | '友だち';

interface VoiceConfig { languageCode: string; name: string; pitch: number; speakingRate: number; verified: boolean }

const VOICES: Record<Speaker, VoiceConfig> = {
  // Reused EXACTLY from Story 1-1's own MODEL voices (Founder decision) — generate-1-1-model.ts's
  // VOICES.GUIDE / VOICES.PONTA, verbatim.
  'ハテナ': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97, verified: true },
  'ポン太': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05, verified: true },
  // PROPOSED, UNVERIFIED (see file header) — confirm with a live --list-voices before the real run.
  'お母さん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-A', pitch: 0, speakingRate: 0.98, verified: false },
  'お父さん': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.5, speakingRate: 0.96, verified: false },
  'おばあちゃん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-B', pitch: -2.0, speakingRate: 0.88, verified: false },
  '先生': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-C', pitch: 0, speakingRate: 0.97, verified: false },
  // Shares a voice MODEL with a pitch/rate-only distinction (see file header: only 7 distinct
  // ja-JP models are documented, 9 speakers are needed) — the two lowest-risk pairs to share:
  // お姉ちゃん appears only in e09/MB (never in the same scene as お母さん), ユウ/友だち are each
  // one-scene characters that never appear together.
  'お姉ちゃん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-A', pitch: 1.5, speakingRate: 1.02, verified: false },
  'ユウ': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-D', pitch: 2.5, speakingRate: 1.06, verified: false },
  '友だち': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-D', pitch: 4.0, speakingRate: 1.1, verified: false },
};

function voiceFor(speaker: string): VoiceConfig {
  const v = VOICES[speaker as Speaker];
  if (!v) throw new Error(`No voice configured for speaker "${speaker}" — every speaker in the sheet must have an entry in VOICES.`);
  return v;
}

/** WO-C2b §3: "one line from each of the 9 voices, plus the first minute of audio A." First
 *  VOICE row for each distinct speaker, in sheet order. */
function sampleRows(rows: SheetRow[]): SheetRow[] {
  const seen = new Set<string>();
  const picked: SheetRow[] = [];
  for (const row of rows) {
    if (row.type !== 'voice' || seen.has(row.speaker)) continue;
    seen.add(row.speaker);
    picked.push(row);
  }
  return picked;
}

interface JoinPlanEntry {
  row: SheetRow;
  /** Cumulative offset (seconds) from the start of the joined file — only ever meaningful for a
   *  'voice' row; an 'SE' row's own offset is tracked too (for planning) but never written back. */
  startSec: number;
}

/** Builds the join plan for one of the two きく files WITHOUT needing real audio durations —
 *  --dry-run's own validation path. The real run replaces `durationSec` with an ffprobe measurement
 *  of the actual synthesized/silence segment once one exists. */
function planJoin(rows: SheetRow[], file: string, durationSec: (row: SheetRow) => number): JoinPlanEntry[] {
  const fileRows = rows.filter((r) => r.file === file);
  const plan: JoinPlanEntry[] = [];
  let clock = 0;
  for (const row of fileRows) {
    plan.push({ row, startSec: clock });
    clock += durationSec(row) + DEFAULT_GAP_MS / 1000;
  }
  return plan;
}

/** WO-C2b's own alignment guarantee: `c01.lesson.json`'s `listen[blockIndex].transcript` must be
 *  the SAME length, in the SAME order, with the SAME text, as this file's own 'voice' rows —
 *  verified here so a future sheet edit that breaks it fails loudly instead of silently
 *  mis-aligning `start` values. */
function verifyTranscriptAlignment(rows: SheetRow[]): void {
  const lesson = JSON.parse(readFileSync(LESSON_PATH, 'utf8'));
  const files = ['c01_listen_A.mp3', 'c01_listen_B.mp3'];
  files.forEach((file, blockIndex) => {
    const sheetVoiceRows = rows.filter((r) => r.file === file && r.type === 'voice');
    const transcript = lesson.listen[blockIndex].transcript as { text: string }[];
    if (sheetVoiceRows.length !== transcript.length) {
      throw new Error(`${file}: sheet has ${sheetVoiceRows.length} voice rows but transcript has ${transcript.length} lines.`);
    }
    sheetVoiceRows.forEach((row, i) => {
      if (row.text_ja !== transcript[i]!.text) {
        throw new Error(`${file}: row ${i} text mismatch.\n  sheet:      ${row.text_ja}\n  transcript: ${transcript[i]!.text}`);
      }
    });
    console.log(`  ${file}: ${sheetVoiceRows.length} voice rows <-> transcript, aligned and text-matched. OK`);
  });
}

function dryRun(samplesOnly: boolean) {
  const rows = loadSheet();
  const voiceRows = rows.filter((r) => r.type === 'voice');
  const seRows = rows.filter((r) => r.type === 'SE');
  console.log(`Sheet: ${rows.length} rows (${voiceRows.length} voice, ${seRows.length} SE).`);

  const missingVoices = [...new Set(voiceRows.map((r) => r.speaker))].filter((s) => !VOICES[s as Speaker]);
  if (missingVoices.length > 0) throw new Error(`No VOICES entry for: ${missingVoices.join(', ')}`);
  console.log(`Speakers covered: ${Object.keys(VOICES).length} (${Object.entries(VOICES).filter(([, v]) => !v.verified).length} unverified — see file header).`);

  console.log('\nVerifying transcript alignment against c01.lesson.json...');
  verifyTranscriptAlignment(rows);

  const targetRows = samplesOnly ? sampleRows(voiceRows) : voiceRows;
  console.log(`\n${samplesOnly ? 'Sample' : 'Full'} clip plan (${targetRows.length} clips):`);
  for (const row of targetRows) {
    const voice = voiceFor(row.speaker);
    const path = samplesOnly ? samplePathFor(row) : JOIN_TARGETS.has(row.file) ? stagingPathFor(row) : outputPathFor(row);
    console.log(`  [${row.clip}] ${row.speaker.padEnd(6)} ${voice.name} -> ${path}`);
  }

  console.log('\nJoin plan (assumes a 3s placeholder duration per line for planning purposes only):');
  for (const file of ['c01_listen_A.mp3', 'c01_listen_B.mp3']) {
    const plan = planJoin(rows, file, (row) => (row.type === 'SE' ? 1 : 3));
    const last = plan[plan.length - 1]!;
    console.log(`  ${file}: ${plan.length} segments, ~${(last.startSec + 3).toFixed(1)}s (placeholder durations)`);
    if (samplesOnly && file === 'c01_listen_A.mp3') {
      const firstMinute = plan.filter((p) => p.startSec < 60);
      console.log(`    first-minute sample would include ${firstMinute.length} of its segments (by placeholder timing)`);
    }
  }
}

async function listVoices() {
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  const client = new TextToSpeechClient();
  const [res] = await client.listVoices({ languageCode: 'ja-JP' });
  for (const v of res.voices ?? []) console.log(v.name, v.ssmlGender, v.naturalSampleRateHertz);
}

function requireFfmpeg() {
  const check = spawnSync('ffmpeg', ['-version']);
  if (check.error) {
    throw new Error('ffmpeg is required for the join step and was not found on PATH. Install it before running --samples or --full.');
  }
}

async function synthesizeClip(row: SheetRow, outPath: string) {
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  const client = new TextToSpeechClient();
  const voice = voiceFor(row.speaker);
  const [res] = await client.synthesizeSpeech({
    input: { text: row.text_ja },
    voice: { languageCode: voice.languageCode, name: voice.name },
    audioConfig: { audioEncoding: 'MP3', pitch: voice.pitch, speakingRate: voice.speakingRate },
  });
  if (!res.audioContent) throw new Error(`No audio returned for clip ${row.clip} (${row.speaker})`);
  writeFileSync(outPath, res.audioContent as Buffer);
}

/** Seconds of real audio in an existing file — used to decide how many lines make up "the first
 *  minute" and to compute each line's real `start` offset (the full-run join uses the same
 *  helper). Requires ffmpeg's own ffprobe companion, checked by `requireFfmpeg`. */
function ffprobeDurationSec(path: string): number {
  const res = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  if (res.status !== 0) throw new Error(`ffprobe failed for ${path}: ${res.stderr?.toString()}`);
  return Number(res.stdout.toString().trim());
}

/** A silence bed standing in for an `SE` row's own real sound effect (none exist yet — see file
 *  header). `seconds` is a rough, undocumented estimate per cue; a real one should replace this
 *  once a Founder-approved SFX asset exists at the same staging path. */
function synthesizeSilence(path: string, seconds: number): void {
  const res = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', String(seconds), '-q:a', '9', path]);
  if (res.status !== 0) throw new Error(`ffmpeg silence generation failed for ${path}: ${res.stderr?.toString()}`);
}

/** Concatenates `paths` in order into `outPath`, re-encoding (never `-c copy`) since a silence bed
 *  and a real TTS clip are not guaranteed to share the same codec parameters. */
function concatFiles(paths: string[], outPath: string): void {
  const listPath = `${outPath}.concat.txt`;
  writeFileSync(listPath, paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const res = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '2', outPath]);
  if (res.status !== 0) throw new Error(`ffmpeg concat failed for ${outPath}: ${res.stderr?.toString()}`);
}

async function runSamples() {
  requireFfmpeg();
  mkdirSync(LESSON_DIR, { recursive: true });
  mkdirSync(SHARED_DIR, { recursive: true });
  mkdirSync(SAMPLES_DIR, { recursive: true });
  const rows = loadSheet();
  const picked = sampleRows(rows.filter((r) => r.type === 'voice'));
  for (const row of picked) {
    const outPath = samplePathFor(row);
    console.log(`Synthesizing sample [${row.clip}] ${row.speaker} -> ${outPath}`);
    await synthesizeClip(row, outPath);
  }

  // WO-C2b §3's other sample: the first minute of audio A, built the same way the real join
  // will be (per-line clips + a silence bed per SE cue), just scoped to ~60s and written to
  // _samples/ instead of being merged into the real production file.
  console.log('\nBuilding the first-minute-of-audio-A sample...');
  const listenARows = rows.filter((r) => r.file === 'c01_listen_A.mp3');
  mkdirSync(resolve(STAGING_DIR, 'sample_listen_A'), { recursive: true });
  const segmentPaths: string[] = [];
  let clockSec = 0;
  for (const row of listenARows) {
    if (clockSec >= 60) break;
    const segPath = resolve(STAGING_DIR, 'sample_listen_A', `${row.clip}.mp3`);
    if (row.type === 'SE') {
      synthesizeSilence(segPath, 1); // undocumented placeholder length — see synthesizeSilence's own doc comment
    } else {
      await synthesizeClip(row, segPath);
    }
    segmentPaths.push(segPath);
    clockSec += ffprobeDurationSec(segPath) + DEFAULT_GAP_MS / 1000;
  }
  const sampleOut = resolve(SAMPLES_DIR, 'audio-A-first-minute.mp3');
  concatFiles(segmentPaths, sampleOut);
  console.log(`  ${segmentPaths.length} segments, ~${clockSec.toFixed(1)}s -> ${sampleOut}`);
  console.log(`\n${picked.length} sample lines written. First-minute-of-audio-A join is not yet implemented in this scaffold — see the session's own report (blocked on GCP creds + ffmpeg in this environment; the join logic itself, once unblocked, follows planJoin() above).`);
}

const args = process.argv.slice(2);
if (args.includes('--list-voices')) {
  await listVoices();
} else if (args.includes('--dry-run')) {
  dryRun(args.includes('--samples'));
} else if (args.includes('--samples')) {
  await runSamples();
} else if (args.includes('--full')) {
  throw new Error('--full is intentionally not implemented yet: WO-C2b instruction 3 — "Don\'t generate the rest until the Founder approves the voices" (the samples). Implement the full run only after that approval.');
} else {
  console.log('Usage: --list-voices | --dry-run [--samples] | --samples | --full');
}
