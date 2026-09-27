/**
 * WO-C4 — beginner course (b01–b07 + ending) voiced audio generation.
 *
 * Generalizes scripts/audio/generate-c01-lesson.ts (left untouched, per the Coordinator's own
 * instruction) just enough to read a MULTI-lesson sheet instead of a single-lesson one:
 *   - join-target detection is no longer a hardcoded set of file names — any `file` value that
 *     more than one sheet row shares is a joined master (built by concatenating every one of its
 *     rows, in sheet order); every other `file` value is a standalone clip. This sheet has 8 join
 *     targets (`b01_listen.mp3` … `b07_listen.mp3`, `b_ending.mp3`) and 741 standalone clips.
 *   - a clip's lesson (and therefore its output directory) is read off its own `clip` id prefix
 *     (`b01-…` … `b07-…`, or `END-…` for the ending) rather than assumed from a single `c01_`
 *     prefix rule — see `lessonIdFor`.
 *
 * ---- Nothing here touches production --------------------------------------------------------
 * Every output path is under a brand-new top-level `audio/` directory (never `public/`, never
 * `src/`) and `content/course/beginner/` (never `src/course/content/`) — neither is bundled by
 * Vite, served by the app, or scanned by any content/release gate. The beginner lessons have no
 * lesson.json yet and are not wired into CourseApp.tsx; that is explicitly separate, later work
 * (WO-C4's own "do not add the beginner lessons to the app yet"). c01–c06 and their own audio are
 * never read or written by this script.
 *
 * ---- Voices (Founder-approved, identical table to Lesson 1) -------------------------------------
 * Same 9 roles, same voice/pitch/rate as scripts/audio/generate-c01-lesson.ts's own VOICES table
 * (small, deliberate duplication — see that script's header for the catalog research this table
 * is based on). One new role this sheet introduces: `ポン太・ハテナ` (a single line, the ending's
 * 「もう一問！」) — WO-C4 sanctions a simplification if true two-voice overlay isn't simple; taken
 * here, flagged plainly in `--full`'s own report rather than silently: synthesized as ポン太 alone.
 *
 * ---- Reading notes (synthesis only; this never changes what any future screen displays) ---------
 * `reading_notes` may combine several directives with " / " — see `parseReadingNotes`:
 *   - `A→B`            : replace A with B in the TEXT SENT TO TTS only (applied longest-A-first,
 *                        so an overlapping shorter pattern in the same cell can't half-clobber a
 *                        longer one already applied — see e.g. row END-L16's two combined notes).
 *   - `〜は読まない`     : drop every literal `〜` before synthesis.
 *   - `PAUSE 350ms at each 。`: switch that row's REST call from plain `text` to `ssml`, inserting
 *                        `<break time="350ms"/>` after each `。` (with defensive XML-escaping).
 *   - `A＝B（…）`        : the one `はらなきゃ＝貼らなきゃ` row — treated as a synthesis substitution
 *                        exactly like `A→B` (so the TTS input reads 貼らなきゃ), but ALSO recorded
 *                        as a manual-QA flag in `--full`'s own report ("check this one clip by
 *                        ear" is a human instruction this script can't itself carry out).
 *   - anything else     : logged as "unhandled" in the report rather than silently applied or
 *                         silently dropped (WO-C4's own "any reading note the engine did not
 *                         follow" — independently verified empty for this sheet by --dry-run, but
 *                         checked here rather than assumed so a future sheet edit fails loudly).
 *
 * ---- Output (WO-C4 §"Output") -----------------------------------------------------------------
 * 1. The 8 joined masters (`bNN_listen.mp3` × 7, `b_ending.mp3`), each built from its own rows in
 *    sheet order with a 0.4s gap between lines and a 0.8s gap wherever `part_or_role` changes
 *    (a real synthesized silence segment of that exact length, not an assumed/measured one — see
 *    `buildJoinedMaster`). Every row's start time (voice AND SE alike — WO-C4's own JSON shape is
 *    `{file: [{clip, start}]}`, not scoped to voice rows only) is written to
 *    `content/course/beginner/beginner.timings.json`.
 *    Placed at `audio/course/<lessonId>/<file>` — the SAME per-lesson directory rule as every
 *    standalone clip (WO-C4's own path formula is given for "every other clip"; unlike c01, there
 *    is no pre-existing lesson.json `listen[].audio` field dictating a different, top-level path
 *    for these masters, so the one uniform rule is used for both).
 * 2. Every standalone clip: `audio/course/<lessonId>/<file>` (the ending has none — its 29 rows
 *    are all inside `b_ending.mp3`'s own join block).
 * 3. Review reels: per lesson b01–b07, `bNN_review.mp3` (that lesson's own listen master, then
 *    every standalone clip of that lesson in sheet order, 0.6s real-silence gaps throughout) +
 *    `bNN_review.csv` (clip, start-within-reel seconds, speaker, text_ja — one row per standalone
 *    clip; the embedded listen segment isn't itself a single sheet clip id, so it gets no row).
 *    The ending has no standalone clips to build a reel from — `b_ending.mp3` itself is uploaded
 *    in its place, per WO-C4's own wording ("the 7 reels, `b_ending.mp3` and the CSVs").
 *
 * ---- Usage --------------------------------------------------------------------------------
 *   npx tsx scripts/audio/generate-beginner-audio.ts --check      # confirm GCP_ACCESS_TOKEN works and the API is enabled; no synthesis
 *   npx tsx scripts/audio/generate-beginner-audio.ts --dry-run    # validate the sheet + lesson/join plan + reading-notes coverage; no token/ffmpeg needed
 *   npx tsx scripts/audio/generate-beginner-audio.ts --full       # generate everything (Founder-approved, 27 Sep 2026) — needs GCP_ACCESS_TOKEN + ffmpeg
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadAudioSheet, type AudioSheetRow } from '../lib/audioSheet.js';

const TTS_API_BASE = 'https://texttospeech.googleapis.com/v1';

function requireAccessToken(): string {
  const token = process.env.GCP_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'GCP_ACCESS_TOKEN is not set. Every network call in this script is a REST call authenticated ' +
      'with a bearer access token — set it to the output of `gcloud auth print-access-token` (already ' +
      'how .github/workflows/beginner-audio.yml runs this script, reusing the deploy jobs\' own ' +
      'Workload Identity Federation auth).',
    );
  }
  return token;
}

const ROOT = process.cwd();
const SHEET_PATH = resolve(ROOT, 'content/course/beginner/beginner.audio-sheet.csv');
const TIMINGS_PATH = resolve(ROOT, 'content/course/beginner/beginner.timings.json');
const AUDIO_ROOT = resolve(ROOT, 'audio/course'); // top-level — never public/ or src/, never bundled or gated
const STAGING_DIR = resolve(AUDIO_ROOT, '_staging'); // per-line + per-gap clips before the join step
const REVIEW_DIR = resolve(AUDIO_ROOT, '_review'); // Founder review reels + CSVs — the artifact source

const DEFAULT_GAP_SEC = 0.4;
const ROLE_CHANGE_GAP_SEC = 0.8;
const REVIEW_GAP_SEC = 0.6;
const SE_SILENCE_SEC = 1; // same fixed placeholder length as c01's SE rows

type SheetRow = AudioSheetRow;

function loadSheet(): SheetRow[] {
  return loadAudioSheet(SHEET_PATH);
}

/** Groups every row by its `file` column. A group with more than one row is a joined master (its
 *  rows are never themselves synthesis targets — see `stagingPathFor`); a group of exactly one is
 *  a standalone clip (see `outputPathFor`). Replaces c01's hardcoded `JOIN_TARGETS` set — the only
 *  generalization this sheet's multi-lesson shape actually requires. */
function groupByFile(rows: SheetRow[]): Map<string, SheetRow[]> {
  const map = new Map<string, SheetRow[]>();
  for (const row of rows) {
    const arr = map.get(row.file);
    if (arr) arr.push(row);
    else map.set(row.file, [row]);
  }
  return map;
}

/** A clip's lesson, read off its own `clip` id — `b01-…`…`b07-…` for the 7 numbered lessons,
 *  `END-…` for the ending (mapped to `beginner`, matching WO-C4's own "ending at
 *  `audio/course/beginner/`" wording literally). No per-lesson-number list is hardcoded — any
 *  `bNN-` prefix works, which is what "generalise it just enough" asks for. */
function lessonIdFor(row: SheetRow): string {
  const m = row.clip.match(/^(b\d\d)-/);
  if (m) return m[1]!;
  if (row.clip.startsWith('END-')) return 'beginner';
  throw new Error(`Cannot derive a lesson id for clip "${row.clip}" (file "${row.file}") — expected a "bNN-" or "END-" prefix.`);
}

/** The FINAL path for a STANDALONE clip, or for a joined master itself (see file header — both
 *  share the one per-lesson directory rule here, unlike c01). */
function outputPathFor(row: SheetRow): string {
  return resolve(AUDIO_ROOT, lessonIdFor(row), row.file);
}

/** Where one row's own line is synthesized to BEFORE a join step — never a row's own final path.
 *  `block` scopes the staging directory per joined file so two lessons' same-numbered clips (e.g.
 *  every lesson has an `L00`) can never collide. */
function stagingPathFor(row: SheetRow): string {
  const block = row.file.replace('.mp3', '');
  return resolve(STAGING_DIR, block, `${row.clip}.mp3`);
}

type Speaker = 'ポン太' | 'ハテナ' | 'お母さん' | 'お父さん' | 'おばあちゃん' | '先生' | 'ユウ' | 'お姉ちゃん' | '友だち';

interface VoiceConfig { languageCode: string; name: string; pitch: number; speakingRate: number }

/** Locked, Founder-approved (identical to Lesson 1) — see scripts/audio/generate-c01-lesson.ts's
 *  own VOICES table for the catalog research this is based on. Deliberately duplicated rather than
 *  imported: keeping c01's script untouched (per the Coordinator's instruction) matters more than
 *  avoiding this small, frozen table's duplication. */
const VOICES: Record<Speaker, VoiceConfig> = {
  'ハテナ': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  'ポン太': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  'お母さん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-A', pitch: 0, speakingRate: 0.98 },
  'おばあちゃん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-B', pitch: -2.0, speakingRate: 0.88 },
  'お父さん': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.5, speakingRate: 0.96 },
  'ユウ': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-D', pitch: 2.5, speakingRate: 1.06 },
  '先生': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-C', pitch: 0, speakingRate: 0.97 },
  'お姉ちゃん': { languageCode: 'ja-JP', name: 'ja-JP-Standard-A', pitch: 1.5, speakingRate: 1.02 },
  '友だち': { languageCode: 'ja-JP', name: 'ja-JP-Standard-D', pitch: 3.0, speakingRate: 1.08 },
};

/** The one row whose `speaker` isn't a real single role — WO-C4's own sanctioned fallback (see
 *  file header) is applied here, at the single call site every synthesis path goes through, so it
 *  can never silently diverge between the join step and a (nonexistent, for this speaker)
 *  standalone path. */
const OVERLAY_FALLBACK_SPEAKER = 'ポン太・ハテナ';

function voiceFor(speaker: string): VoiceConfig {
  if (speaker === OVERLAY_FALLBACK_SPEAKER) return VOICES['ポン太'];
  const v = VOICES[speaker as Speaker];
  if (!v) throw new Error(`No voice configured for speaker "${speaker}" — every speaker in the sheet must have an entry in VOICES (or the overlay fallback).`);
  return v;
}

function assertDistinctVoices(): void {
  const byName = new Map<string, string>();
  for (const [speaker, voice] of Object.entries(VOICES)) {
    const existing = byName.get(voice.name);
    if (existing) throw new Error(`VOICES: "${voice.name}" is assigned to both ${existing} and ${speaker} — every role must have its own distinct voice.`);
    byName.set(voice.name, speaker);
  }
}

// ---- Reading notes -----------------------------------------------------------------------------

interface ParsedNotes {
  subs: { a: string; b: string; manualQA: boolean }[];
  dropTilde: boolean;
  pause350: boolean;
  unhandled: string[];
}

/** Splits a `reading_notes` cell on " / " and classifies each token — see file header for the 4
 *  known directive shapes. Never throws: an unrecognized token is collected into `unhandled`
 *  rather than applied or silently ignored, so `--dry-run`/`--full` can report it. */
function parseReadingNotes(raw: string): ParsedNotes {
  const result: ParsedNotes = { subs: [], dropTilde: false, pause350: false, unhandled: [] };
  if (!raw) return result;
  for (const rawToken of raw.split(' / ')) {
    const token = rawToken.trim();
    if (!token) continue;
    if (token === '〜は読まない') { result.dropTilde = true; continue; }
    if (token === 'PAUSE 350ms at each 。') { result.pause350 = true; continue; }
    if (token.includes('→')) {
      const [a, b] = token.split('→');
      if (a && b !== undefined) { result.subs.push({ a, b, manualQA: false }); continue; }
    }
    if (token.includes('＝')) {
      const [a, bRaw] = token.split('＝');
      const b = bRaw?.replace(/（.*）$/, '').trim();
      if (a && b) { result.subs.push({ a, b, manualQA: true }); continue; }
    }
    result.unhandled.push(token);
  }
  return result;
}

interface SynthesisPlan {
  payload: { text: string } | { ssml: string };
  manualQA: boolean;
  unhandled: string[];
}

/** Builds the exact REST `input` payload for one row's synthesis call — substitutions applied
 *  longest-`a`-first (see file header), then the tilde-drop, then (if requested) re-escaped and
 *  wrapped as SSML with a break after each `。`. Never touches `row.text_ja` itself — the sheet's
 *  own text is what any future screen would display verbatim. */
function buildSynthesisPlan(row: SheetRow): SynthesisPlan {
  const notes = parseReadingNotes(row.reading_notes);
  let text = row.text_ja;
  for (const { a, b } of [...notes.subs].sort((x, y) => y.a.length - x.a.length)) {
    text = text.split(a).join(b);
  }
  if (notes.dropTilde) text = text.split('〜').join('');
  const manualQA = notes.subs.some((s) => s.manualQA);
  if (notes.pause350) {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const withBreaks = escaped.split('。').join('。<break time="350ms"/>');
    return { payload: { ssml: `<speak>${withBreaks}</speak>` }, manualQA, unhandled: notes.unhandled };
  }
  return { payload: { text }, manualQA, unhandled: notes.unhandled };
}

// ---- REST synthesis + ffmpeg -------------------------------------------------------------------

interface RestVoice { name: string; ssmlGender: string; naturalSampleRateHertz: number }

async function fetchVoicesRest(): Promise<RestVoice[]> {
  const token = requireAccessToken();
  const res = await fetch(`${TTS_API_BASE}/voices?languageCode=ja-JP`, { headers: { Authorization: `Bearer ${token}` } });
  const bodyText = await res.text();
  if (!res.ok) {
    let hint = '';
    if (bodyText.includes('SERVICE_DISABLED') || bodyText.includes('has not been used in project')) {
      const urlMatch = bodyText.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/\S+/);
      hint = urlMatch
        ? `\nThe Text-to-Speech API is not enabled for this project. Exact console step: open ${urlMatch[0]} and click Enable (or run: gcloud services enable texttospeech.googleapis.com --project=kodomo-ai).`
        : '\nThe Text-to-Speech API appears to not be enabled for this project.';
    }
    throw new Error(`voices.list failed: HTTP ${res.status}\n${bodyText}${hint}`);
  }
  const body = JSON.parse(bodyText) as { voices?: RestVoice[] };
  return body.voices ?? [];
}

async function checkAccess() {
  const voices = await fetchVoicesRest();
  console.log(`OK: Text-to-Speech API reachable and enabled. ${voices.length} ja-JP voice(s) returned.`);
}

function requireFfmpeg() {
  const check = spawnSync('ffmpeg', ['-version']);
  if (check.error) throw new Error('ffmpeg is required and was not found on PATH.');
}

async function synthesizeClip(row: SheetRow, outPath: string): Promise<void> {
  const token = requireAccessToken();
  const voice = voiceFor(row.speaker);
  const { payload } = buildSynthesisPlan(row);
  const res = await fetch(`${TTS_API_BASE}/text:synthesize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: payload,
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: { audioEncoding: 'MP3', pitch: voice.pitch, speakingRate: voice.speakingRate },
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`text:synthesize failed for clip ${row.clip} (${row.speaker}): HTTP ${res.status}\n${bodyText}`);
  const body = JSON.parse(bodyText) as { audioContent?: string };
  if (!body.audioContent) throw new Error(`No audioContent returned for clip ${row.clip} (${row.speaker})`);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, Buffer.from(body.audioContent, 'base64'));
}

/** `--full`'s own retry log — reported verbatim at the end (WO-C4: "any failed or retried lines").
 *  Same 3-attempt retry-and-record pattern as generate-c01-lesson.ts's synthesizeClipWithRetry. */
const retryLog: { clip: string; speaker: string; attempts: number; failed: boolean }[] = [];

async function synthesizeClipWithRetry(row: SheetRow, outPath: string, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await synthesizeClip(row, outPath);
      if (attempt > 1) retryLog.push({ clip: row.clip, speaker: row.speaker, attempts: attempt, failed: false });
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        retryLog.push({ clip: row.clip, speaker: row.speaker, attempts: attempt, failed: true });
        throw err;
      }
      console.log(`  retrying [${row.clip}] ${row.speaker} (attempt ${attempt} failed: ${(err as Error).message.split('\n')[0]})`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function ffprobeDurationSec(path: string): number {
  const res = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  if (res.status !== 0) throw new Error(`ffprobe failed for ${path}: ${res.stderr?.toString()}`);
  return Number(res.stdout.toString().trim());
}

function synthesizeSilence(path: string, seconds: number): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const res = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(seconds), '-q:a', '9', path]);
  if (res.status !== 0) throw new Error(`ffmpeg silence generation failed for ${path}: ${res.stderr?.toString()}`);
}

function concatFiles(paths: string[], outPath: string): void {
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  const listPath = `${outPath}.concat.txt`;
  writeFileSync(listPath, paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const res = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '2', outPath]);
  if (res.status !== 0) throw new Error(`ffmpeg concat failed for ${outPath}: ${res.stderr?.toString()}`);
}

/** Minimal RFC4180 field quoting for the review CSVs — quotes a field iff it needs it (contains a
 *  comma, a quote, or a newline), doubling any embedded quote. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// ---- Dry run ------------------------------------------------------------------------------------

function dryRun(): void {
  const rows = loadSheet();
  const voiceRows = rows.filter((r) => r.type === 'voice');
  const seRows = rows.filter((r) => r.type === 'SE');
  console.log(`Sheet: ${rows.length} rows (${voiceRows.length} voice, ${seRows.length} SE).`);
  const totalChars = voiceRows.reduce((sum, r) => sum + r.text_ja.length, 0);
  console.log(`Total text_ja characters (voiced rows): ${totalChars}`);

  const groups = groupByFile(rows);
  const joinTargets = [...groups.entries()].filter(([, g]) => g.length > 1);
  const standalone = [...groups.entries()].filter(([, g]) => g.length === 1);
  console.log(`Distinct output files: ${groups.size} (${joinTargets.length} joined masters, ${standalone.length} standalone clips).`);

  const missingVoices = [...new Set(rows.map((r) => r.speaker))].filter((s) => s !== 'SE' && s !== OVERLAY_FALLBACK_SPEAKER && !VOICES[s as Speaker]);
  if (missingVoices.length > 0) throw new Error(`No VOICES entry for: ${missingVoices.join(', ')}`);
  assertDistinctVoices();
  console.log(`Speakers covered: ${Object.keys(VOICES).length} + overlay fallback (${OVERLAY_FALLBACK_SPEAKER} -> ポン太 only).`);

  const byLesson = new Map<string, number>();
  for (const row of rows) byLesson.set(lessonIdFor(row), (byLesson.get(lessonIdFor(row)) ?? 0) + 1);
  console.log('\nRows per lesson:');
  for (const [lesson, count] of [...byLesson.entries()].sort()) console.log(`  ${lesson}: ${count} rows`);

  console.log('\nJoin plan:');
  for (const [file, fileRows] of joinTargets) {
    let roleChanges = 0;
    let prevRole: string | null = null;
    for (const row of fileRows) {
      if (prevRole !== null && row.part_or_role !== prevRole) roleChanges++;
      prevRole = row.part_or_role;
    }
    console.log(`  ${file}: ${fileRows.length} segments, ${roleChanges} role-change (0.8s) gaps, ${fileRows.length - 1 - roleChanges} default (0.4s) gaps -> ${outputPathFor(fileRows[0]!)}`);
  }

  console.log('\nReading-notes coverage:');
  const unhandled = new Set<string>();
  const manualQAClips: string[] = [];
  let overlayClips = 0;
  for (const row of rows) {
    const { manualQA, unhandled: rowUnhandled } = buildSynthesisPlan(row);
    for (const u of rowUnhandled) unhandled.add(`${row.clip}: "${u}"`);
    if (manualQA) manualQAClips.push(row.clip);
    if (row.speaker === OVERLAY_FALLBACK_SPEAKER) overlayClips++;
  }
  console.log(`  unhandled tokens: ${unhandled.size === 0 ? 'none' : [...unhandled].join('; ')}`);
  console.log(`  manual-QA-by-ear flagged clips: ${manualQAClips.length === 0 ? 'none' : manualQAClips.join(', ')}`);
  console.log(`  overlay-fallback clips (${OVERLAY_FALLBACK_SPEAKER} -> ポン太 only): ${overlayClips}`);
}

// ---- Full generation ------------------------------------------------------------------------

interface TimingEntry { clip: string; start: number }

async function buildJoinedMaster(file: string, fileRows: SheetRow[], totalCharsRef: { value: number }): Promise<{ path: string; entries: TimingEntry[]; durationSec: number }> {
  const block = file.replace('.mp3', '');
  const outPath = outputPathFor(fileRows[0]!);
  console.log(`\nBuilding ${file} (${fileRows.length} segments) -> ${outPath}`);

  const segmentPaths: string[] = [];
  const entries: TimingEntry[] = [];
  let clockSec = 0;
  let prevRole: string | null = null;
  let gapIndex = 0;
  for (const row of fileRows) {
    if (prevRole !== null) {
      const gapSec = row.part_or_role !== prevRole ? ROLE_CHANGE_GAP_SEC : DEFAULT_GAP_SEC;
      const gapPath = resolve(STAGING_DIR, block, `_gap_${gapIndex++}.mp3`);
      synthesizeSilence(gapPath, gapSec);
      segmentPaths.push(gapPath);
      clockSec += gapSec;
    }
    const segPath = stagingPathFor(row);
    if (row.type === 'SE') {
      synthesizeSilence(segPath, SE_SILENCE_SEC);
    } else {
      await synthesizeClipWithRetry(row, segPath);
      totalCharsRef.value += row.text_ja.length;
    }
    entries.push({ clip: row.clip, start: Number(clockSec.toFixed(3)) });
    segmentPaths.push(segPath);
    clockSec += ffprobeDurationSec(segPath);
    prevRole = row.part_or_role;
  }
  concatFiles(segmentPaths, outPath);
  const durationSec = ffprobeDurationSec(outPath);
  console.log(`  ${fileRows.length} segments, ${durationSec.toFixed(1)}s (real) -> ${outPath}`);
  return { path: outPath, entries, durationSec };
}

async function buildReviewReel(lessonId: string, allRows: SheetRow[], listenFile: string, listenMasterPath: string): Promise<{ mp3Path: string; csvPath: string } | null> {
  const lessonClips = allRows.filter((r) => lessonIdFor(r) === lessonId && r.file !== listenFile);
  if (lessonClips.length === 0) return null; // the ending: no standalone clips to build a reel from

  const segmentPaths: string[] = [listenMasterPath];
  let clockSec = ffprobeDurationSec(listenMasterPath);
  const csvRows: { clip: string; start: number; speaker: string; text_ja: string }[] = [];
  let gapIndex = 0;
  for (const row of lessonClips) {
    const gapPath = resolve(STAGING_DIR, '_review_gaps', `${lessonId}_${gapIndex++}.mp3`);
    synthesizeSilence(gapPath, REVIEW_GAP_SEC);
    segmentPaths.push(gapPath);
    clockSec += REVIEW_GAP_SEC;

    const clipPath = outputPathFor(row); // already synthesized in the standalone-clips pass
    csvRows.push({ clip: row.clip, start: Number(clockSec.toFixed(3)), speaker: row.speaker, text_ja: row.text_ja });
    segmentPaths.push(clipPath);
    clockSec += ffprobeDurationSec(clipPath);
  }

  const mp3Path = resolve(REVIEW_DIR, `${lessonId}_review.mp3`);
  concatFiles(segmentPaths, mp3Path);
  const csvPath = resolve(REVIEW_DIR, `${lessonId}_review.csv`);
  const csvLines = ['clip,start,speaker,text_ja', ...csvRows.map((r) => [r.clip, r.start.toFixed(3), csvField(r.speaker), csvField(r.text_ja)].join(','))];
  mkdirSync(REVIEW_DIR, { recursive: true });
  writeFileSync(csvPath, csvLines.join('\n') + '\n');
  console.log(`  review reel: ${lessonClips.length} clips, ${clockSec.toFixed(1)}s -> ${mp3Path}`);
  return { mp3Path, csvPath };
}

async function runFull(): Promise<void> {
  requireFfmpeg();
  const rows = loadSheet();
  assertDistinctVoices();
  const groups = groupByFile(rows);

  mkdirSync(AUDIO_ROOT, { recursive: true });
  mkdirSync(STAGING_DIR, { recursive: true });
  mkdirSync(REVIEW_DIR, { recursive: true });

  const totalCharsRef = { value: 0 };
  const unhandledNotes = new Set<string>();
  const manualQAClips: string[] = [];

  // 1) Standalone clips first (the review reels below read their already-synthesized files back).
  const standaloneRows = rows.filter((r) => (groups.get(r.file)?.length ?? 0) === 1);
  console.log(`Generating ${standaloneRows.length} standalone clips...`);
  for (const row of standaloneRows) {
    const { manualQA, unhandled } = buildSynthesisPlan(row);
    for (const u of unhandled) unhandledNotes.add(`${row.clip}: "${u}"`);
    if (manualQA) manualQAClips.push(row.clip);
    const outPath = outputPathFor(row);
    if (row.type === 'SE') {
      synthesizeSilence(outPath, SE_SILENCE_SEC);
    } else {
      await synthesizeClipWithRetry(row, outPath);
      totalCharsRef.value += row.text_ja.length;
    }
  }

  // 2) The 8 joined masters (7 lessons + ending).
  const joinFiles = [...groups.entries()].filter(([, g]) => g.length > 1);
  const timings: Record<string, TimingEntry[]> = {};
  const masterDurations: Record<string, number> = {};
  for (const [file, fileRows] of joinFiles) {
    for (const row of fileRows) {
      const { manualQA, unhandled } = buildSynthesisPlan(row);
      for (const u of unhandled) unhandledNotes.add(`${row.clip}: "${u}"`);
      if (manualQA) manualQAClips.push(row.clip);
    }
    const { entries, durationSec } = await buildJoinedMaster(file, fileRows, totalCharsRef);
    timings[file] = entries;
    masterDurations[file] = durationSec;
  }

  mkdirSync(resolve(TIMINGS_PATH, '..'), { recursive: true });
  writeFileSync(TIMINGS_PATH, JSON.stringify(timings, null, 2) + '\n');
  console.log(`\nWrote ${TIMINGS_PATH}`);

  // 3) Review reels for b01-b07 (the ending has none — see buildReviewReel).
  console.log('\nBuilding review reels...');
  const lessonTotals: Record<string, number> = {};
  for (const lessonNum of ['01', '02', '03', '04', '05', '06', '07']) {
    const lessonId = `b${lessonNum}`;
    const listenFile = `${lessonId}_listen.mp3`;
    const listenMasterPath = resolve(AUDIO_ROOT, lessonId, listenFile);
    const reel = await buildReviewReel(lessonId, rows, listenFile, listenMasterPath);
    const clipsTotal = rows
      .filter((r) => lessonIdFor(r) === lessonId && r.file !== listenFile)
      .reduce((sum, r) => sum + ffprobeDurationSec(outputPathFor(r)), 0);
    lessonTotals[lessonId] = (masterDurations[listenFile] ?? 0) + clipsTotal;
    if (!reel) console.log(`  ${lessonId}: no standalone clips — no reel built.`);
  }

  console.log('\n==== WO-C4 report ====');
  console.log(`Voiced lines: ${rows.filter((r) => r.type === 'voice').length}, characters: ${totalCharsRef.value}`);
  console.log('\nLength per lesson (listen block + all standalone clips):');
  for (const [lessonId, total] of Object.entries(lessonTotals)) {
    console.log(`  ${lessonId}: listen ${(masterDurations[`${lessonId}_listen.mp3`] ?? 0).toFixed(1)}s, total ${total.toFixed(1)}s`);
  }
  console.log(`  ending: ${(masterDurations['b_ending.mp3'] ?? 0).toFixed(1)}s`);

  if (retryLog.length === 0) {
    console.log('\nNo retries or failures.');
  } else {
    console.log(`\n${retryLog.length} clip(s) needed a retry:`);
    for (const r of retryLog) console.log(`  [${r.clip}] ${r.speaker}: ${r.attempts} attempt(s)${r.failed ? ' — FAILED' : ' — succeeded'}`);
  }

  console.log(`\nManual-QA-by-ear flagged clip(s): ${manualQAClips.length === 0 ? 'none' : manualQAClips.join(', ')}`);
  console.log(`Overlay-fallback (${OVERLAY_FALLBACK_SPEAKER} -> ポン太 only) clip(s): ${rows.filter((r) => r.speaker === OVERLAY_FALLBACK_SPEAKER).map((r) => r.clip).join(', ') || 'none'}`);
  console.log(`Reading notes the engine did not follow: ${unhandledNotes.size === 0 ? 'none' : [...unhandledNotes].join('; ')}`);
}

const args = process.argv.slice(2);
if (args.includes('--check')) {
  await checkAccess();
} else if (args.includes('--dry-run')) {
  dryRun();
} else if (args.includes('--full')) {
  await runFull();
} else {
  console.log('Usage: --check | --dry-run | --full');
}
