/**
 * Story 1-6 (zurui) independent-practice audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture (LINES/VOICES/manifest
 * shape, --dry-run/--only). Transcribed verbatim from the Architect's finalized production
 * script document ("Production Audio Scripts — remaining 16", baseline 513ab60) — its own
 * §1-6 table, in order. 〔SE:...〕 rows dropped (not dialogue); PAUSE rows converted to
 * `pauseAfterMs` on the preceding line.
 *
 * Role: the Architect's document labels this "independent practice ... not a checkpoint" —
 * deliberately distinct from the three existing AudioRole values (MODEL/GUIDED/CHECKPOINT).
 * Written here as the literal descriptive string, unchanged; this script only produces the
 * MP3s/manifest, it does not register the mission in src/audio/registry.ts or touch
 * src/audio/types.ts's AudioRole union — placement/engine wiring for this role is a separate,
 * not-yet-assigned ticket, exactly as instructed ("do not change AD-10 or engine content").
 *
 * No ROBOT speaker line in this script — Ponta narrates/quotes ROBOT's answers in reported
 * speech, same pattern as the approved 1-4 (oyatsu) CHECKPOINT master. `robotLine` below is the
 * mission's own authored layer-0 robotSays (zurui/s2.json), verbatim.
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-1-6-practice.ts --dry-run
 *   npx tsx scripts/audio/generate-1-6-practice.ts
 *   npx tsx scripts/audio/generate-1-6-practice.ts --only=3
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

/** Story 1-6 independent practice — Architect's finalized production script, §1-6, verbatim. */
const LINES: Line[] = [
  { speaker: 'GUIDE', text: 'ポン太も、「ずるい」のところを ほってみたんだって。' },
  { speaker: 'PONTA', text: 'うん。「『ずるい』って、何？」ってやつ。' },
  { speaker: 'GUIDE', text: 'ロボは、さいしょ何て言った？' },
  { speaker: 'PONTA', text: '「先に えらべた 人が、とくだから、ずるいよ」って。だから、わかった！って思ったの。' },
  { speaker: 'GUIDE', text: 'そのとき、自分に聞いたことば、おぼえてる？　「これで、ほんとうに……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……わかった？」って。でもね、先にえらんだだけで ずるいのかなって、ちょっと へんな気がしたの。' },
  { speaker: 'GUIDE', text: 'それで、どうしたの？' },
  { speaker: 'PONTA', text: 'はじめ、「ずるいって、わるいこと？」って聞いちゃった。' },
  { speaker: 'GUIDE', text: 'うん。' },
  { speaker: 'PONTA', text: 'でも、ほれなかった。わるいかどうかじゃなくて、「ずるい」が 何なのかを 知りたかったのに。' },
  { speaker: 'GUIDE', text: 'そういうこと、あるよね。' },
  { speaker: 'GUIDE', text: 'そのあと、自分に何て聞いた？　「まだ わからないのは……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……どこ？」　わからないのは、「ずるい」が 先にえらぶことだけなのか、だった。だから、「ほかにもある？」って聞いたの。' },
  { speaker: 'GUIDE', text: 'そしたら？' },
  { speaker: 'PONTA', text: 'ロボが、「ルールを まもらなかった 人にも、『ずるい』って 言うよね」って。' },
  { speaker: 'PONTA', text: 'え、ぜんぜん ちがうことなのに、どっちも ずるい？って、ここで まよったんだ。' },
  { speaker: 'GUIDE', text: 'そういうとき、自分に何て聞いた？　「じゃあ、つぎに……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……何を きけば いい？」　それで、「なんで、どっちも『ずるい』なの？」って聞いたら……ねっこについたんだ。' },
  { speaker: 'GUIDE', text: '聞いているきみも、同じねっこについたよね。' },
  { speaker: 'GUIDE', text: 'きみは、どこでまよった？　ポン太と、同じところ？　ちがうところ？', pauseAfterMs: 3000 },
  { speaker: 'GUIDE', text: 'どっちでも、いいんだよ。まよったところは、人によってちがうからね。' },
  { speaker: 'PONTA', text: 'へえ。きみは、どこでまよったのかな。' },
  { speaker: 'GUIDE', text: 'こんど「ずるい」って思ったら、どんな やくそくが あったのかな、って 考えてみてね。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/1-6-zurui');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/zurui.json');

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
      audioUrl: `/audio/m1/1-6-zurui/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'm1-s2-1-6',
    role: 'independent practice',
    audioStatus: 'ready',
    robotLine: '先に えらべた 人が、とくだから、ずるいよ。',
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
