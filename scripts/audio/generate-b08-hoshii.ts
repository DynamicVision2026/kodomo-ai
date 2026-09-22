/**
 * Bank B08 (bank-hoshii) TRANSFER audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture. Transcribed verbatim from
 * the Architect's finalized production script document ("Production Audio Scripts — remaining
 * 16", baseline 513ab60) — its own §B08 table, in order. See scripts/audio/generate-b01-atode.ts
 * for the full explanation of the "TRANSFER" role label and why no engine/registry files change.
 *
 * No ROBOT speaker line — Ponta narrates/quotes ROBOT's answers in reported speech. `robotLine`
 * is the mission's own authored layer-0 robotSays (bank-hoshii/s2.json), verbatim.
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-b08-hoshii.ts --dry-run
 *   npx tsx scripts/audio/generate-b08-hoshii.ts
 *   npx tsx scripts/audio/generate-b08-hoshii.ts --only=3
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

/** Bank B08 (hoshii) — Architect's finalized production script, §B08, verbatim. */
const LINES: Line[] = [
  { speaker: 'GUIDE', text: 'ポン太、「ほしい」のところを ほってみたんだって？' },
  { speaker: 'PONTA', text: 'うん。ロボは、さいしょ「みんなが もってるから、ほしいと おもうんだよ」って。' },
  { speaker: 'PONTA', text: '自分に聞いたんだ。「これで、ほんとうに わかった？」って。' },
  { speaker: 'PONTA', text: '「みんなが もってるから」って、どういうことなのか、わからなかった。' },
  { speaker: 'PONTA', text: 'それで、「まだ わからないのは、どこ？」って考えて、「どういうこと？」って聞いたの。' },
  { speaker: 'PONTA', text: 'ロボが、「じつは、なくても こまらないのに、ほしいと かんじるんだよ」って。' },
  { speaker: 'PONTA', text: '「じゃあ、つぎに 何を きけば いい？」って考えて、「なんで、こまらないのに ほしいの？」って聞いたら……ねっこについたんだ。' },
  { speaker: 'GUIDE', text: 'ポン太は、こまらなくても ほしいもの、ある？' },
  { speaker: 'PONTA', text: 'あるよ。ぼくは、ほしいものが あっても いいと 思うな。わくわくするから。' },
  { speaker: 'GUIDE', text: 'そうなんだ。すこし まってから 考える、っていう人も いるよね。' },
  { speaker: 'GUIDE', text: '聞いているきみは、どっち？', pauseAfterMs: 3000 },
  { speaker: 'GUIDE', text: 'どっちでも いいんだよ。ほしいって 思うのは、わるいことじゃ ないからね。' },
  { speaker: 'GUIDE', text: 'こんど 何かが ほしくなったら、どうして ほしいのか、ちょっと 考えてみてね。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/b08-hoshii');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/bank-hoshii.json');

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
      audioUrl: `/audio/m1/b08-hoshii/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'bank-b08',
    role: 'TRANSFER',
    audioStatus: 'ready',
    robotLine: 'みんなが もってるから、ほしいと おもうんだよ。',
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
