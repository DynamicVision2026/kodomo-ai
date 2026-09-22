/**
 * Bank B01 (bank-atode) TRANSFER audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture (LINES/VOICES/manifest
 * shape, --dry-run/--only). Transcribed verbatim from the Architect's finalized production
 * script document ("Production Audio Scripts — remaining 16", baseline 513ab60) — its own
 * §B01 table, in order. 〔SE:...〕 rows dropped (not dialogue); PAUSE rows converted to
 * `pauseAfterMs` on the preceding line.
 *
 * Role: written here as "TRANSFER" — the Architect's document labels every Bank script
 * "DO → LISTEN → USE ... all play after the child's work", matching this repo's own existing
 * "Transfer Practice" term for Bank Digs (see tests/FullCourseJourney.test.tsx). Not one of the
 * three existing AudioRole values (MODEL/GUIDED/CHECKPOINT); this script only produces the
 * MP3s/manifest, it does not register the mission in src/audio/registry.ts or touch
 * src/audio/types.ts's AudioRole union — placement/engine wiring is a separate, not-yet-assigned
 * ticket ("do not change AD-10 or engine content").
 *
 * No ROBOT speaker line — Ponta narrates/quotes ROBOT's answers in reported speech, same
 * pattern as the approved 1-4 (oyatsu) CHECKPOINT master. `robotLine` below is the mission's own
 * authored layer-0 robotSays (bank-atode/s2.json), verbatim.
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-b01-atode.ts --dry-run
 *   npx tsx scripts/audio/generate-b01-atode.ts
 *   npx tsx scripts/audio/generate-b01-atode.ts --only=3
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

/** Bank B01 (atode) — Architect's finalized production script, §B01, verbatim. */
const LINES: Line[] = [
  { speaker: 'GUIDE', text: 'ポン太、「あとで」のところを ほってみたんだって？' },
  { speaker: 'PONTA', text: 'うん。「『あとで』って、いつ？」ってやつ。' },
  { speaker: 'PONTA', text: 'ロボは、さいしょ「『あとで』は、すこし たってからだよ」って。' },
  { speaker: 'PONTA', text: 'そのとき、自分に聞いたんだ。「これで、ほんとうに わかった？」って。' },
  { speaker: 'PONTA', text: '「すこし」って、どれくらいなのか、わからなかった。' },
  { speaker: 'PONTA', text: 'それで、「まだ わからないのは、どこ？」って考えて、「どういうこと？」って聞いたの。' },
  { speaker: 'PONTA', text: 'ロボが、「言う人に よって、5分のことも、1時間のことも あるんだよ」って。' },
  { speaker: 'PONTA', text: '「じゃあ、つぎに 何を きけば いい？」って考えて、「なんで、人によって ちがうの？」って聞いたら……ねっこについたんだ。' },
  { speaker: 'GUIDE', text: 'ポン太の「あとで」は、みじかい？　ながい？' },
  { speaker: 'PONTA', text: 'ぼくの「あとで」は、みじかいよ。5分くらいかな。' },
  { speaker: 'GUIDE', text: 'そうなんだ。もっと ながい「あとで」の人も いるよね。' },
  { speaker: 'GUIDE', text: '聞いているきみの「あとで」は、みじかい？　ながい？', pauseAfterMs: 3000 },
  { speaker: 'GUIDE', text: 'どっちでも いいんだよ。' },
  { speaker: 'GUIDE', text: 'こんど「あとで」って言われたら、「いつごろ？」って聞いてみてね。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/b01-atode');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/bank-atode.json');

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
      audioUrl: `/audio/m1/b01-atode/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'bank-b01',
    role: 'TRANSFER',
    audioStatus: 'ready',
    robotLine: '「あとで」は、すこし たってからだよ。',
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
