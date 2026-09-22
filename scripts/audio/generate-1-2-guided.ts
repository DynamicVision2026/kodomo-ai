/**
 * Story 1-2 (genkan) GUIDED audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture (LINES/VOICES/manifest
 * shape, --dry-run/--only), Founder-approved production method, transcribed verbatim from
 * Audio Reference Scripts rev.3 §2B — the Architect's draft carried one 〔要確認〕 marker on its
 * single ROBOT line, now resolved to the mission's own authored layer-0 robotSays
 * (genkan/s2.json), copied verbatim (never new copy authored here).
 *
 * Unlike 1-1, this script's manifest carries no `demonstratedLayers` — rev.3 §2E is explicit
 * that no recording guard is needed here: the audio stops before any question or deeper answer,
 * so the child's own layer-0 play on the Practice Engine stage is their own first work, not a
 * repeat of something heard.
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-1-2-guided.ts --dry-run
 *   npx tsx scripts/audio/generate-1-2-guided.ts
 *   npx tsx scripts/audio/generate-1-2-guided.ts --only=3
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

/**
 * Story 1-2 GUIDED — Audio Reference Scripts rev.3, §2B, verbatim. 〔SE:...〕 dropped;
 * 〔間・Ns〕 converted to `pauseAfterMs` on the preceding line.
 */
const LINES: Line[] = [
  { speaker: 'PONTA', text: 'ただいまー！' },
  { speaker: 'GUIDE', text: 'おかえり、ポン太。' },
  { speaker: 'PONTA', text: 'ねえロボ、なんで、げんかんでくつをぬぐの？' },
  // ROBOT — resolved to the mission's own authored layer-0 robotSays (genkan/s2.json), verbatim.
  { speaker: 'ROBOT', text: '外のくつは、よごれているから、ぬぐんだよ。' },
  { speaker: 'PONTA', text: 'そっか、わかった！', pauseAfterMs: 1000 },
  { speaker: 'GUIDE', text: 'これで、ほんとうに わかった？' },
  { speaker: 'PONTA', text: 'うん。外はよごれてて、きたないから、でしょ？' },
  { speaker: 'GUIDE', text: 'うん。……ねえポン太。きのう買ってもらった、あたらしいくつ、あるよね。' },
  { speaker: 'PONTA', text: 'うん、青いやつ！' },
  { speaker: 'GUIDE', text: 'あれ、まだ一回も、外ではいてないよね。' },
  { speaker: 'PONTA', text: 'うん。まだ、ぴかぴか。' },
  { speaker: 'GUIDE', text: 'あのくつで、おうちに入るときは？' },
  { speaker: 'PONTA', text: 'え？　そりゃ、ぬぐよ。……あれ？', pauseAfterMs: 2000 },
  { speaker: 'PONTA', text: 'あたらしくて、よごれてないのに……ぬぐ。' },
  { speaker: 'GUIDE', text: 'おもしろいね。', pauseAfterMs: 1000 },
  // The single 3-second listener pause in this lesson — where the listener starts to answer.
  { speaker: 'GUIDE', text: 'まだ わからないのは、どこ？', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: 'うーん……。' },
  { speaker: 'GUIDE', text: 'ポン太、考えてるみたい。……聞いているきみは、どこだと思う？　ここから先は、きみのばんだよ。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/1-2-genkan');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/genkan.json');

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
      audioUrl: `/audio/m1/1-2-genkan/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'm1-s2-1-2',
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
