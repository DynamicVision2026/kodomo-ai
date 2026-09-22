/**
 * Story 1-5 (minna) FRAME audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture (LINES/VOICES/manifest
 * shape, --dry-run/--only). Transcribed verbatim from the Architect's finalized 24-line
 * production script for this unit. 〔SE:...〕 sound-effect rows dropped (not dialogue, same
 * convention as every prior approved master); PAUSE rows converted to `pauseAfterMs` on the
 * preceding line.
 *
 * This is the only framed わかれ Main Lesson (Architect's own design notes): it demonstrates
 * the SHAPE of a わかれ ending — two people genuinely disagreeing and both being right — using
 * an independent rainy-day/grandmother example, deliberately NOT the mission's own authored
 * `minna` (smartphone peer-pressure) dig chain. Nobody asks ROBOT anything, no ROBOT line is
 * spoken, and no dig is demonstrated, so unlike every other Story/Bank script there is no
 * layer-0 robotSays for this file to quote — `robotLine` is left empty rather than pulling in
 * (or inventing) minna/s2.json content that this script intentionally does not use. LISTEN ->
 * DO, R2 — plays before practice, same placement as the existing GUIDED role (rev.3's frozen
 * three-role set is unchanged; no new AudioRole is introduced for this).
 *
 * Line 6 (script row 8) quotes the Architect's ruby markup `{畑|はたけ}`, stripped to plain
 * kanji for speech — TTS can't speak bracket syntax — matching `stripRuby()` (src/engine/
 * ruby.tsx)'s own behavior, the same convention already applied to Story 1-1 and B10's own
 * ROBOT/quoted lines.
 *
 * Neither this script's manifest (src/audio/content/minna.json) nor any of the Story/Bank
 * manifests from the same production pass are wired into src/audio/registry.ts — see that
 * file's own comment for why only the three original Audio Reference Slice scripts (chanto/
 * genkan/oyatsu) are registered today.
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-1-5-frame.ts --dry-run
 *   npx tsx scripts/audio/generate-1-5-frame.ts
 *   npx tsx scripts/audio/generate-1-5-frame.ts --only=3
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

type Speaker = 'GUIDE' | 'PONTA' | 'ROBOT';

interface Line {
  speaker: Speaker;
  text: string;
  pauseAfterMs?: number;
}

const DEFAULT_GAP_MS = 350;

/** Story 1-5 FRAME — Architect's finalized 24-line production script, verbatim. */
const LINES: Line[] = [
  { speaker: 'PONTA', text: 'あーあ、雨だ。雨の日って、いやな日だよね。外であそべないもん。' },
  { speaker: 'GUIDE', text: 'そっか。ポン太は、雨の日は いやな日だと思うんだね。' },
  { speaker: 'PONTA', text: 'うん。ぜったい、いやな日！' },
  { speaker: 'GUIDE', text: '「これで、ほんとうに……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……わかった？」　うん、わかったよ。いやな日に きまってる。' },
  // Ruby markup stripped for speech (畑|はたけ -> 畑) — see file header.
  { speaker: 'GUIDE', text: 'ねえポン太。畑をしている おばあちゃんは、雨の日が うれしいんだって。やさいが そだつからね。' },
  { speaker: 'PONTA', text: '……あ。おばあちゃんには、いい日なんだ。', pauseAfterMs: 2000 },
  { speaker: 'PONTA', text: 'でも、ぼくには いやな日なんだけどなあ。' },
  { speaker: 'GUIDE', text: '「まだ わからないのは……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……どこ？」　いい日なのか、いやな日なのか、わかんなくなってきた。' },
  { speaker: 'GUIDE', text: 'どっちが、ただしいと思う？', pauseAfterMs: 2000 },
  { speaker: 'PONTA', text: '……どっちも、ちょっと わかる。' },
  { speaker: 'GUIDE', text: 'うん。こたえが ひとつじゃ ないことも ある。それも、ほったから わかることだよ。' },
  { speaker: 'GUIDE', text: '「じゃあ、つぎに……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……何を きけば いい？」' },
  { speaker: 'GUIDE', text: 'それは、きみが ほりながら 考えてね。こんど ほるところも、こたえが ひとつじゃ ないかもしれないよ。' },
  { speaker: 'GUIDE', text: 'ここから先は、きみのばんだよ。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/1-5-minna');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/minna.json');

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function outputPlan() {
  return LINES.map((line, i) => ({
    index: i,
    speaker: line.speaker,
    text: line.text,
    file: `${pad(i)}-${line.speaker.toLowerCase()}.mp3`,
    pauseAfterMs: line.pauseAfterMs ?? DEFAULT_GAP_MS,
  }));
}

async function generate(onlyIndex?: number) {
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  const client = new TextToSpeechClient();
  mkdirSync(OUT_DIR, { recursive: true });

  const plan = outputPlan();
  const targets = onlyIndex === undefined ? plan : plan.filter((item) => item.index === onlyIndex);
  if (onlyIndex !== undefined && targets.length === 0) {
    throw new Error(`--only=${onlyIndex}: no such line (valid range 0-${plan.length - 1})`);
  }

  const existingManifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : {};
  if (onlyIndex !== undefined && !Array.isArray(existingManifest.lines)) {
    throw new Error('--only requires a full run to have already produced the manifest\'s own `lines` array — run without --only first.');
  }

  type ManifestLine = { speaker: Speaker; text: string; audioUrl: string; pauseAfterMs: number };
  const manifestLines: ManifestLine[] = onlyIndex === undefined ? [] : [...existingManifest.lines];

  for (const item of targets) {
    const voice = VOICES[item.speaker];
    const [res] = await client.synthesizeSpeech({
      input: { text: item.text },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: { audioEncoding: 'MP3', pitch: voice.pitch, speakingRate: voice.speakingRate },
    });
    if (!res.audioContent) throw new Error(`No audio returned for line ${item.index} (${item.speaker})`);
    const outPath = resolve(OUT_DIR, item.file);
    writeFileSync(outPath, res.audioContent as Buffer);
    const entry: ManifestLine = {
      speaker: item.speaker, text: item.text,
      audioUrl: `/audio/m1/1-5-minna/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'm1-s2-1-5',
    role: 'GUIDED',
    audioStatus: 'ready',
    robotLine: '',
    lines: manifestLines,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${MANIFEST_PATH}`);
  console.log(`\n${targets.length} line(s) synthesized${onlyIndex !== undefined ? ` (--only=${onlyIndex})` : ''}.`);
}

function dryRun() {
  const plan = outputPlan();
  const totalChars = LINES.reduce((n, l) => n + l.text.length, 0);
  console.log(`${plan.length} lines, ${totalChars} characters total.`);
  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Manifest:   ${MANIFEST_PATH}`);
  for (const item of plan) {
    console.log(`  [${pad(item.index)}] ${item.speaker.padEnd(5)} (+${item.pauseAfterMs}ms) ${item.file}  "${item.text}"`);
  }
}

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
if (args.includes('--dry-run')) {
  dryRun();
} else if (onlyArg) {
  await generate(Number(onlyArg.slice('--only='.length)));
} else {
  await generate();
}
