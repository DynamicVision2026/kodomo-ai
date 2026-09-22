/**
 * Story 1-8 (randoseru) CHECKPOINT (final) audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture (LINES/VOICES/manifest
 * shape, --dry-run/--only). Transcribed verbatim from the Architect's finalized production
 * script document ("Production Audio Scripts — remaining 16", baseline 513ab60) — its own
 * §1-8 table, in order. 〔SE:...〕 rows dropped (not dialogue); PAUSE rows converted to
 * `pauseAfterMs` on the preceding line.
 *
 * randoseru/s2.json's authored chain is exactly tatoeba -> naze -> hokaniwa (no tsumari, no
 * わかれ root) — this script reports that faithfully; nothing here assumes the superseded
 * "four layers / all four moves" shape.
 *
 * No ROBOT speaker line — Ponta narrates/quotes ROBOT's answers in reported speech, same
 * pattern as the approved 1-4 (oyatsu) CHECKPOINT master. `robotLine` below is the mission's own
 * authored layer-0 robotSays (randoseru/s2.json), verbatim.
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-1-8-checkpoint.ts --dry-run
 *   npx tsx scripts/audio/generate-1-8-checkpoint.ts
 *   npx tsx scripts/audio/generate-1-8-checkpoint.ts --only=3
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

/** Story 1-8 CHECKPOINT (final) — Architect's finalized production script, §1-8, verbatim. */
const LINES: Line[] = [
  { speaker: 'GUIDE', text: 'ポン太、さいごのところを ほってみたんだって？' },
  { speaker: 'PONTA', text: 'うん！　「ランドセルは、6年つかっても、まだ同じ？」ってやつ。' },
  { speaker: 'GUIDE', text: 'ロボは、さいしょ何て言った？' },
  { speaker: 'PONTA', text: '「見た目は かわっても、ずっと 同じ ランドセルだよ」って。' },
  { speaker: 'PONTA', text: 'そのとき、自分に聞いたんだ。「これで、ほんとうに わかった？」って。' },
  { speaker: 'PONTA', text: 'そしたらね、「かわっても同じ」って、ぴんと こなかったの。' },
  { speaker: 'PONTA', text: 'はじめ、「ランドセルって、何年つかうの？」って聞いちゃった。でも、ほれなかった。何年か わかっても、同じかどうかは わからないから。' },
  { speaker: 'GUIDE', text: 'そういうこと、あるよね。' },
  { speaker: 'PONTA', text: 'それで、自分に聞いたの。「まだ わからないのは、どこ？」って。' },
  { speaker: 'PONTA', text: 'わからないのは、ほんとうに どこが かわったのか、だった。だから、「たとえば？」って聞いたんだ。' },
  { speaker: 'PONTA', text: 'ロボが、「たとえば、ベルトも しんも、はんぶん かえたことが あるんだよ」って。' },
  { speaker: 'PONTA', text: 'えっ、はんぶんも かえたのに、同じ？って、ここで まよったんだ。' },
  { speaker: 'PONTA', text: 'それで、自分に聞いたの。「じゃあ、つぎに 何を きけば いい？」って。' },
  { speaker: 'PONTA', text: 'それで、「なんで、それでも 同じって 言えるの？」って聞いたの。' },
  { speaker: 'PONTA', text: 'ロボが、「きみが、ずっと つかってきた、ひとつの ものだからだよ」って。' },
  { speaker: 'PONTA', text: 'それで、「ほかにもある？」って聞いたら……ねっこについたんだ。' },
  { speaker: 'GUIDE', text: 'ポン太、いま、ぜんぶ 自分で 聞いていたね。' },
  { speaker: 'GUIDE', text: 'さいしょは、わたしが 聞いていたのにね。' },
  { speaker: 'PONTA', text: 'えへへ。いつのまにか、自分で 聞いてた。' },
  { speaker: 'GUIDE', text: '聞いているきみも、ねっこについたよね。' },
  { speaker: 'GUIDE', text: 'きみは、どこでまよった？　ポン太と、同じところ？　ちがうところ？', pauseAfterMs: 3000 },
  { speaker: 'GUIDE', text: 'どっちでも、いいんだよ。まよったところは、人によってちがうからね。' },
  { speaker: 'GUIDE', text: 'こんど、うちで ずっと つかっている ものを 見つけたら、「同じって、なに？」って 考えてみてね。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/1-8-randoseru');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/randoseru.json');

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
      audioUrl: `/audio/m1/1-8-randoseru/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'm1-s2-1-8',
    role: 'CHECKPOINT',
    audioStatus: 'ready',
    robotLine: '見た目は かわっても、ずっと 同じ ランドセルだよ。',
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
