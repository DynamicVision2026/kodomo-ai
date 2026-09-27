/**
 * WO-C4 / WO-C4b — beginner course (b01–b07 + ending) voiced audio generation.
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
 * ---- WO-C4b (audio fix run, 27 Sep 2026) — what changed from WO-C4's own first pass -------------
 * All 7 lessons + the ending passed the audio review; three fixes came back, applied here:
 *   1. お母さん's pitch moved 0 -> -1.0 (rate unchanged) — every other role's voice/pitch/rate is
 *      untouched. WO-C4's own run never persisted per-line audio (only the review reels + the
 *      ending master + timings.json left the runner — see WO-C4's own file header), so there is no
 *      prior clip to selectively patch; this run regenerates the full set again, now with お母さん's
 *      new pitch and everyone else's SAME config as before — reported plainly in `--full`'s own
 *      output rather than silently doing more than the "regenerate her lines" wording literally asks.
 *   2. `ポン太・ハテナ` (END-L28, 「もう一問！」) is now a REAL two-voice overlay — WO-C4's own
 *      sanctioned ポン太-only fallback is retired ("Ponta alone is no longer OK"). Both voices are
 *      synthesized separately then mixed into one clip with ffmpeg's `amix` filter (`duration=longest`
 *      so neither voice's tail is cut short — see `synthesizeOverlayClip`).
 *   3. A new reading-note shape, `BREAK <ms>ms before <text>` (END-L04 only): inserts
 *      `<break time="<ms>ms"/>` immediately before the first occurrence of `<text>` in the
 *      (post-substitution) TTS input — see `parseReadingNotes` / `buildSynthesisPlan`.
 * WO-C4b also asks to keep the FULL final set this time — all 749 files + timings.json — stored
 * "the same way as c01's audio", i.e. committed under `public/audio/course/` (this run's OWN output
 * root; WO-C4's first pass deliberately used a gitignored top-level `audio/` instead, since nothing
 * was meant to be kept then). That tree is real production-shaped audio, but the beginner lessons
 * still have no lesson.json and are not wired into CourseApp.tsx — "ready for the app later" is
 * explicit that wiring it in is separate, future work. Intermediate per-line/per-gap clips before a
 * join, and the check-reel's own scratch files, still live under the gitignored `audio/course/`
 * tree (never committed) — only the FINAL 749 files + timings.json go to `public/`.
 *
 * ---- Nothing here touches PRODUCTION content --------------------------------------------------
 * `content/course/beginner/` (never `src/course/content/`) holds the sheet + timings.json — neither
 * bundled by Vite nor scanned by any content/release gate. c01–c06's own content/audio, the content
 * gate, and ci.yml are never read or written by this script. `public/audio/course/<lessonId>/…` is
 * real, servable audio (unlike WO-C4's first pass) but nothing routes to it yet — see WO-C4b's own
 * "still don't add the lessons to the app."
 *
 * ---- Voices (Founder-approved; locked except お母さん's pitch, see WO-C4b §1) --------------------
 * Same 9 roles as scripts/audio/generate-c01-lesson.ts's own VOICES table (small, deliberate
 * duplication — see that script's header for the catalog research this table is based on).
 *
 * ---- Reading notes (synthesis only; this never changes what any future screen displays) ---------
 * `reading_notes` may combine several directives with " / " — see `parseReadingNotes`:
 *   - `A→B`            : replace A with B in the TEXT SENT TO TTS only (applied longest-A-first,
 *                        so an overlapping shorter pattern in the same cell can't half-clobber a
 *                        longer one already applied — see e.g. row END-L16's two combined notes).
 *   - `〜は読まない`     : drop every literal `〜` before synthesis.
 *   - `PAUSE 350ms at each 。`: switch that row's REST call from plain `text` to `ssml`, inserting
 *                        `<break time="350ms"/>` after each `。` (with defensive XML-escaping).
 *   - `BREAK <ms>ms before <text>` (WO-C4b, new): insert `<break time="<ms>ms"/>` immediately before
 *                        the first occurrence of `<text>` in the (escaped) TTS input.
 *   - `A＝B（…）`        : the one `はらなきゃ＝貼らなきゃ` row — treated as a synthesis substitution
 *                        exactly like `A→B` (so the TTS input reads 貼らなきゃ), but ALSO recorded
 *                        as a manual-QA flag in `--full`'s own report ("check this one clip by
 *                        ear" is a human instruction this script can't itself carry out).
 *   - anything else     : logged as "unhandled" in the report rather than silently applied or
 *                         silently dropped.
 *
 * ---- Output ---------------------------------------------------------------------------------
 * 1. The 8 joined masters (`bNN_listen.mp3` × 7, `b_ending.mp3`), each built from its own rows in
 *    sheet order with a 0.4s gap between lines and a 0.8s gap wherever `part_or_role` changes (a
 *    real synthesized silence segment of that exact length — unchanged from WO-C4's own review-
 *    approved gap scheme; WO-C4b's own "keep about 1s between sections" is read as scoped to the
 *    NEW check-reel's own sections, not a re-litigation of gaps the review already passed — see
 *    `buildFixCheckReel`). Every row's start time (voice AND SE alike) is written to
 *    `content/course/beginner/beginner.timings.json` as `{file: [{clip, start}]}`.
 *    Placed at `public/audio/course/<lessonId>/<file>`.
 * 2. Every standalone clip: `public/audio/course/<lessonId>/<file>` (the ending has none — its 29
 *    rows are all inside `b_ending.mp3`'s own join block).
 * 3. `fix-check.mp3` (WO-C4b's own check reel, NOT committed — uploaded as the
 *    `beginner-audio-fixcheck` artifact instead): the new `b_ending.mp3` master, then 10 お母さん
 *    lines picked round-robin across every lesson that has her (b01/b02/b04/b07 — she has no lines
 *    in b03/b05/b06), in sheet order within each lesson, ~1s of real silence between every section.
 *    No trimming anywhere in this pipeline — every segment is used exactly as TTS/ffmpeg produced it.
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
const PUBLIC_AUDIO_ROOT = resolve(ROOT, 'public/audio/course'); // FINAL, committed — WO-C4b: "stored the same way as c01's audio"
const STAGING_ROOT = resolve(ROOT, 'audio/course'); // gitignored — intermediate only, never committed
const STAGING_DIR = resolve(STAGING_ROOT, '_staging'); // per-line + per-gap clips before a join step
const FIXCHECK_DIR = resolve(STAGING_ROOT, '_fixcheck'); // WO-C4b's own check-reel scratch + output

const DEFAULT_GAP_SEC = 0.4;
const ROLE_CHANGE_GAP_SEC = 0.8;
const FIXCHECK_GAP_SEC = 1; // WO-C4b: "about 1s of silence between sections"
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
 *  `END-…` for the ending (mapped to `beginner`). No per-lesson-number list is hardcoded — any
 *  `bNN-` prefix works. */
function lessonIdFor(row: SheetRow): string {
  const m = row.clip.match(/^(b\d\d)-/);
  if (m) return m[1]!;
  if (row.clip.startsWith('END-')) return 'beginner';
  throw new Error(`Cannot derive a lesson id for clip "${row.clip}" (file "${row.file}") — expected a "bNN-" or "END-" prefix.`);
}

/** The FINAL, committed path for a STANDALONE clip, or for a joined master itself — both share the
 *  one per-lesson directory rule under `public/audio/course/`. */
function outputPathFor(row: SheetRow): string {
  return resolve(PUBLIC_AUDIO_ROOT, lessonIdFor(row), row.file);
}

/** Where one row's own line is synthesized to BEFORE a join step — never a row's own final path.
 *  `block` scopes the staging directory per joined file so two lessons' same-numbered clips (e.g.
 *  every lesson has an `L00`) can never collide. Kept under the gitignored `audio/` tree. */
function stagingPathFor(row: SheetRow): string {
  const block = row.file.replace('.mp3', '');
  return resolve(STAGING_DIR, block, `${row.clip}.mp3`);
}

/** The source clip for a row that's ALREADY been synthesized this run — its final committed path
 *  if it's a standalone clip, or its (still-on-disk) staging path if it belongs to a joined master
 *  (join-block per-line clips are never copied to `public/` individually — only their joined
 *  master is). Used by `buildFixCheckReel` to reuse real, already-synthesized audio rather than
 *  re-synthesizing lines a second time. */
function sourceClipPathFor(row: SheetRow, groups: Map<string, SheetRow[]>): string {
  return (groups.get(row.file)?.length ?? 0) > 1 ? stagingPathFor(row) : outputPathFor(row);
}

type Speaker = 'ポン太' | 'ハテナ' | 'お母さん' | 'お父さん' | 'おばあちゃん' | '先生' | 'ユウ' | 'お姉ちゃん' | '友だち';

interface VoiceConfig { languageCode: string; name: string; pitch: number; speakingRate: number }

/** Founder-approved. WO-C4b §1: お母さん's pitch moves 0 -> -1.0 (rate unchanged, still 0.98) —
 *  every other role's voice/pitch/rate is IDENTICAL to WO-C4's first pass (and to Lesson 1's own
 *  table in generate-c01-lesson.ts). Deliberately duplicated rather than imported: keeping c01's
 *  script untouched matters more than avoiding this small, frozen table's duplication. */
const VOICES: Record<Speaker, VoiceConfig> = {
  'ハテナ': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  'ポン太': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  'お母さん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-A', pitch: -1.0, speakingRate: 0.98 },
  'おばあちゃん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-B', pitch: -2.0, speakingRate: 0.88 },
  'お父さん': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.5, speakingRate: 0.96 },
  'ユウ': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-D', pitch: 2.5, speakingRate: 1.06 },
  '先生': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-C', pitch: 0, speakingRate: 0.97 },
  'お姉ちゃん': { languageCode: 'ja-JP', name: 'ja-JP-Standard-A', pitch: 1.5, speakingRate: 1.02 },
  '友だち': { languageCode: 'ja-JP', name: 'ja-JP-Standard-D', pitch: 3.0, speakingRate: 1.08 },
};

/** The one row whose `speaker` isn't a real single role. WO-C4b §2: a REAL two-voice overlay now
 *  (ポン太 alone is no longer an acceptable fallback) — see `synthesizeOverlayClip`. */
const OVERLAY_SPEAKER = 'ポン太・ハテナ';

function voiceFor(speaker: string): VoiceConfig {
  const v = VOICES[speaker as Speaker];
  if (!v) throw new Error(`No voice configured for speaker "${speaker}" — every speaker in the sheet must have an entry in VOICES (the overlay speaker is handled separately, never through voiceFor).`);
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
  breaksBefore: { ms: number; target: string }[];
  unhandled: string[];
}

/** Splits a `reading_notes` cell on " / " and classifies each token — see file header for the
 *  known directive shapes. Never throws: an unrecognized token is collected into `unhandled`
 *  rather than applied or silently ignored, so `--dry-run`/`--full` can report it. */
function parseReadingNotes(raw: string): ParsedNotes {
  const result: ParsedNotes = { subs: [], dropTilde: false, pause350: false, breaksBefore: [], unhandled: [] };
  if (!raw) return result;
  for (const rawToken of raw.split(' / ')) {
    const token = rawToken.trim();
    if (!token) continue;
    if (token === '〜は読まない') { result.dropTilde = true; continue; }
    if (token === 'PAUSE 350ms at each 。') { result.pause350 = true; continue; }
    const breakMatch = token.match(/^BREAK (\d+)ms before (.+)$/);
    if (breakMatch) { result.breaksBefore.push({ ms: Number(breakMatch[1]), target: breakMatch[2]! }); continue; }
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
 *  longest-`a`-first, then the tilde-drop, then (if requested) re-escaped and wrapped as SSML with
 *  a break after each `。` and/or before a named target substring (WO-C4b's own `BREAK` directive).
 *  Never touches `row.text_ja` itself — the sheet's own text is what any future screen would
 *  display verbatim. */
function buildSynthesisPlan(row: SheetRow): SynthesisPlan {
  const notes = parseReadingNotes(row.reading_notes);
  let text = row.text_ja;
  for (const { a, b } of [...notes.subs].sort((x, y) => y.a.length - x.a.length)) {
    text = text.split(a).join(b);
  }
  if (notes.dropTilde) text = text.split('〜').join('');
  const manualQA = notes.subs.some((s) => s.manualQA);

  const needsSsml = notes.pause350 || notes.breaksBefore.length > 0;
  if (!needsSsml) return { payload: { text }, manualQA, unhandled: notes.unhandled };

  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let ssmlText = escapeXml(text);
  if (notes.pause350) ssmlText = ssmlText.split('。').join('。<break time="350ms"/>');
  for (const { ms, target } of notes.breaksBefore) {
    const escapedTarget = escapeXml(target);
    const idx = ssmlText.indexOf(escapedTarget);
    if (idx === -1) {
      notes.unhandled.push(`BREAK ${ms}ms before ${target} (target text not found)`);
      continue;
    }
    ssmlText = ssmlText.slice(0, idx) + `<break time="${ms}ms"/>` + ssmlText.slice(idx);
  }
  return { payload: { ssml: `<speak>${ssmlText}</speak>` }, manualQA, unhandled: notes.unhandled };
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

async function synthesizeClipAs(row: SheetRow, outPath: string, voice: VoiceConfig): Promise<void> {
  const token = requireAccessToken();
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
  if (!res.ok) throw new Error(`text:synthesize failed for clip ${row.clip} (voice ${voice.name}): HTTP ${res.status}\n${bodyText}`);
  const body = JSON.parse(bodyText) as { audioContent?: string };
  if (!body.audioContent) throw new Error(`No audioContent returned for clip ${row.clip} (voice ${voice.name})`);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, Buffer.from(body.audioContent, 'base64'));
}

async function synthesizeClip(row: SheetRow, outPath: string): Promise<void> {
  await synthesizeClipAs(row, outPath, voiceFor(row.speaker));
}

/** WO-C4b §2: END-L28 only. Synthesizes ポン太's and ハテナ's own reading of the same line
 *  separately, then mixes both into one clip with ffmpeg's `amix` (`duration=longest` so the
 *  shorter of the two voices' takes is padded with silence rather than cutting the longer one's
 *  tail — "don't trim clip edges"; `normalize=1`, ffmpeg's own default, scales the mix down just
 *  enough to avoid clipping when two speech tracks overlap). */
async function synthesizeOverlayClip(row: SheetRow, outPath: string): Promise<void> {
  const tmpDir = resolve(STAGING_DIR, '_overlay_tmp');
  const pontaPath = resolve(tmpDir, `${row.clip}-ponta.mp3`);
  const hatenaPath = resolve(tmpDir, `${row.clip}-hatena.mp3`);
  await synthesizeClipAs(row, pontaPath, VOICES['ポン太']);
  await synthesizeClipAs(row, hatenaPath, VOICES['ハテナ']);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  const res = spawnSync('ffmpeg', [
    '-y', '-i', pontaPath, '-i', hatenaPath,
    '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:normalize=1',
    '-c:a', 'libmp3lame', '-q:a', '2', outPath,
  ]);
  if (res.status !== 0) throw new Error(`ffmpeg overlay mix failed for ${row.clip}: ${res.stderr?.toString()}`);
}

/** `--full`'s own retry log — reported verbatim at the end ("any failed or retried lines"). Wraps
 *  EITHER a normal synthesis or the overlay mix — both are "one row's worth of work" from the
 *  retry log's point of view. */
const retryLog: { clip: string; speaker: string; attempts: number; failed: boolean }[] = [];

async function withRetry(row: SheetRow, fn: () => Promise<void>, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
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

/** The one dispatch point every row's synthesis goes through, in BOTH the standalone-clips pass
 *  and each joined master's per-line loop — SE silence, the real two-voice overlay, or a normal
 *  single-voice line. */
async function synthesizeRow(row: SheetRow, outPath: string, totalCharsRef: { value: number }): Promise<void> {
  if (row.type === 'SE') { synthesizeSilence(outPath, SE_SILENCE_SEC); return; }
  if (row.speaker === OVERLAY_SPEAKER) {
    await withRetry(row, () => synthesizeOverlayClip(row, outPath));
  } else {
    await withRetry(row, () => synthesizeClip(row, outPath));
  }
  totalCharsRef.value += row.text_ja.length;
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

/** The concat-demuxer's own file list is always written under the gitignored STAGING_DIR, never
 *  next to `outPath` — `outPath` can be a real, committed `public/` path (a joined master or the
 *  fix-check reel), and a `<file>.concat.txt` sibling there would get committed right along with
 *  it (caught on this pipeline's own first `public/`-writing run: 8 stray `*_listen.mp3.concat.txt`
 *  files landed in `public/audio/course/` alongside the real masters — fixed here, not worked
 *  around at the call site, since every join goes through this one function). */
function concatFiles(paths: string[], outPath: string): void {
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  mkdirSync(STAGING_DIR, { recursive: true });
  const listPath = resolve(STAGING_DIR, `_concat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`);
  writeFileSync(listPath, paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const res = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '2', outPath]);
  if (res.status !== 0) throw new Error(`ffmpeg concat failed for ${outPath}: ${res.stderr?.toString()}`);
}

/** WO-C4b's own check reel: お母さん's lines picked round-robin, one per lesson per round, across
 *  every lesson that has her (in ascending lesson order) — so 10 picks spread across as many
 *  distinct lessons as exist before any lesson contributes a second line. The ending's own お母さん
 *  lines are excluded here since the full ending master is already included whole. */
function pickMomLinesRoundRobin(rows: SheetRow[], count: number): SheetRow[] {
  const byLesson = new Map<string, SheetRow[]>();
  for (const row of rows) {
    if (row.speaker !== 'お母さん' || row.type !== 'voice') continue;
    const lessonId = lessonIdFor(row);
    if (lessonId === 'beginner') continue;
    const arr = byLesson.get(lessonId) ?? [];
    arr.push(row);
    byLesson.set(lessonId, arr);
  }
  const lessons = [...byLesson.keys()].sort();
  const picked: SheetRow[] = [];
  for (let round = 0; picked.length < count; round++) {
    let addedThisRound = false;
    for (const lesson of lessons) {
      const arr = byLesson.get(lesson)!;
      if (round < arr.length) {
        picked.push(arr[round]!);
        addedThisRound = true;
        if (picked.length === count) break;
      }
    }
    if (!addedThisRound) break; // every lesson's お母さん lines exhausted
  }
  return picked;
}

/** Builds `fix-check.mp3`: the (already-synthesized) `b_ending.mp3` master, then each picked
 *  お母さん line with a ~1s real-silence gap before it — reusing already-synthesized audio via
 *  `sourceClipPathFor` rather than re-synthesizing (no double network cost, and "don't trim clip
 *  edges" is automatically satisfied since these are the exact same segments the final set uses). */
function buildFixCheckReel(rows: SheetRow[], groups: Map<string, SheetRow[]>, endingMasterPath: string): { path: string; picked: SheetRow[] } {
  const picked = pickMomLinesRoundRobin(rows, 10);
  mkdirSync(FIXCHECK_DIR, { recursive: true });
  const segmentPaths: string[] = [endingMasterPath];
  let gapIndex = 0;
  for (const row of picked) {
    const gapPath = resolve(FIXCHECK_DIR, `_gap_${gapIndex++}.mp3`);
    synthesizeSilence(gapPath, FIXCHECK_GAP_SEC);
    segmentPaths.push(gapPath);
    segmentPaths.push(sourceClipPathFor(row, groups));
  }
  const outPath = resolve(FIXCHECK_DIR, 'fix-check.mp3');
  concatFiles(segmentPaths, outPath);
  return { path: outPath, picked };
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

  const missingVoices = [...new Set(rows.map((r) => r.speaker))].filter((s) => s !== 'SE' && s !== OVERLAY_SPEAKER && !VOICES[s as Speaker]);
  if (missingVoices.length > 0) throw new Error(`No VOICES entry for: ${missingVoices.join(', ')}`);
  assertDistinctVoices();
  console.log(`Speakers covered: ${Object.keys(VOICES).length} + real two-voice overlay (${OVERLAY_SPEAKER}). お母さん pitch: ${VOICES['お母さん'].pitch}.`);

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
    if (row.speaker === OVERLAY_SPEAKER) overlayClips++;
  }
  console.log(`  unhandled tokens: ${unhandled.size === 0 ? 'none' : [...unhandled].join('; ')}`);
  console.log(`  manual-QA-by-ear flagged clips: ${manualQAClips.length === 0 ? 'none' : manualQAClips.join(', ')}`);
  console.log(`  real two-voice overlay clip(s): ${overlayClips}`);

  const momPicks = pickMomLinesRoundRobin(rows, 10);
  console.log(`\nFix-check reel would use: b_ending.mp3 + ${momPicks.length} お母さん lines: ${momPicks.map((r) => r.clip).join(', ')}`);
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
    await synthesizeRow(row, segPath, totalCharsRef);
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

async function runFull(): Promise<void> {
  requireFfmpeg();
  const rows = loadSheet();
  assertDistinctVoices();
  const groups = groupByFile(rows);

  mkdirSync(PUBLIC_AUDIO_ROOT, { recursive: true });
  mkdirSync(STAGING_DIR, { recursive: true });

  const totalCharsRef = { value: 0 };
  const unhandledNotes = new Set<string>();
  const manualQAClips: string[] = [];

  const standaloneRows = rows.filter((r) => (groups.get(r.file)?.length ?? 0) === 1);
  console.log(`Generating ${standaloneRows.length} standalone clips...`);
  for (const row of standaloneRows) {
    const { manualQA, unhandled } = buildSynthesisPlan(row);
    for (const u of unhandled) unhandledNotes.add(`${row.clip}: "${u}"`);
    if (manualQA) manualQAClips.push(row.clip);
    await synthesizeRow(row, outputPathFor(row), totalCharsRef);
  }

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

  console.log('\nBuilding fix-check reel...');
  const endingMasterPath = outputPathFor(rows.find((r) => r.clip === 'END-L00')!);
  const { path: fixCheckPath, picked } = buildFixCheckReel(rows, groups, endingMasterPath);
  console.log(`  fix-check reel: b_ending.mp3 + ${picked.length} お母さん lines (${picked.map((r) => r.clip).join(', ')}) -> ${fixCheckPath}`);

  const lessonTotals: Record<string, number> = {};
  for (const lessonNum of ['01', '02', '03', '04', '05', '06', '07']) {
    const lessonId = `b${lessonNum}`;
    const listenFile = `${lessonId}_listen.mp3`;
    const clipsTotal = rows
      .filter((r) => lessonIdFor(r) === lessonId && r.file !== listenFile)
      .reduce((sum, r) => sum + ffprobeDurationSec(outputPathFor(r)), 0);
    lessonTotals[lessonId] = (masterDurations[listenFile] ?? 0) + clipsTotal;
  }

  console.log('\n==== WO-C4b report ====');
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
  console.log(`Overlay clip(s) (${OVERLAY_SPEAKER}, real two-voice ffmpeg mix): ${rows.filter((r) => r.speaker === OVERLAY_SPEAKER).map((r) => r.clip).join(', ') || 'none'}`);
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
