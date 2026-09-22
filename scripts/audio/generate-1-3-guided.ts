/**
 * Story 1-3 (rouka) GUIDED audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture (LINES/VOICES/manifest
 * shape, --dry-run/--only). Transcribed verbatim from the Architect's finalized production
 * script document ("Production Audio Scripts — remaining 16", baseline 513ab60) — its own
 * §1-3 table, in order. 〔SE:...〕 sound-effect rows dropped (not dialogue, same convention as
 * every prior approved master); PAUSE rows converted to `pauseAfterMs` on the preceding line.
 *
 * The single ROBOT line (row 5) is the mission's own authored layer-0 robotSays (rouka/s2.json),
 * copied verbatim — never new copy authored here. This is the same GUIDED shape as 1-2/genkan:
 * the audio stops at "まだ わからないのは、どこ？" — no recording guard is needed, since it
 * demonstrates no deepening question or deeper answer (rev.3 §2E's own reasoning, unchanged).
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-1-3-guided.ts --dry-run
 *   npx tsx scripts/audio/generate-1-3-guided.ts
 *   npx tsx scripts/audio/generate-1-3-guided.ts --only=3
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

/** Story 1-3 GUIDED — Architect's finalized production script, §1-3, verbatim. */
const LINES: Line[] = [
  { speaker: 'PONTA', text: 'きょう、ろうかを走ったら、先生に「走っちゃダメ！」って言われちゃった。' },
  { speaker: 'GUIDE', text: 'そっか。' },
  { speaker: 'PONTA', text: 'ねえロボ、ろうかで走っちゃダメなのは、なんで？' },
  // ROBOT — the mission's own authored layer-0 robotSays (rouka/s2.json), verbatim.
  { speaker: 'ROBOT', text: '走るとあぶないから、走っちゃダメなんだよ。' },
  { speaker: 'PONTA', text: 'そっか、あぶないからか。わかった！', pauseAfterMs: 1000 },
  { speaker: 'GUIDE', text: 'これで、ほんとうに わかった？', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: 'うーん……？' },
  { speaker: 'GUIDE', text: 'ここから先は、聞いているきみのばんだよ。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/1-3-rouka');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/rouka.json');

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
      audioUrl: `/audio/m1/1-3-rouka/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'm1-s2-1-3',
    role: 'GUIDED',
    audioStatus: 'ready',
    robotLine: LINES.find((l) => l.speaker === 'ROBOT')!.text,
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
