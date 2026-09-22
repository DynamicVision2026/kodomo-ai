/**
 * Story 1-4 (oyatsu) CHECKPOINT audio — Google Cloud Text-to-Speech generation.
 *
 * Mirrors scripts/audio/generate-1-1-model.ts's exact architecture (LINES/VOICES/manifest
 * shape, --dry-run/--only), transcribed from Audio Reference Scripts rev.3 §3B with one
 * Architect-resolved content fix (see below).
 *
 * Architect resolution — the §3D "one content dependency" warning: the draft's narration of
 * Ponta's successful dig used 「たとえばで聞いてみた」（ガムは？水とうのジュースは？おにぎりは？）,
 * but `たとえば` is not an authored deepening move anywhere in 1-4's chain (oyatsu/s2.json).
 * Per rev.3's own COMPARE rule ("the successful move at each layer must be the authored
 * deepening move"), that line has been replaced with Ponta narrating the actual authored
 * three-move chain, in order: どういうこと？ (layer 0, follow-tsumari) → ほかにもある？ (layer 1,
 * follow-hokaniwa) → なんで、ちがうの？ (layer 2, follow-naze) — the exact `hand` card text at
 * each of oyatsu/s2.json's three layers. Ponta's earlier MISS — 「バナナって、何円？」 — carries no
 * such risk (a question that fails to dig cannot contradict the engine) and is unchanged.
 * Ponta's quoted recollection of ROBOT's layer-0 answer (line 3) is now the mission's own
 * authored layer-0 robotSays, verbatim, resolving the draft's other 〔要確認〕 marker. No other
 * line changed; the root's own content is still never restated (rev.3 §3D).
 *
 * Unlike 1-1, this manifest carries no `demonstratedLayers` — rev.3 §3E is explicit that no
 * recording guard is needed: this audio plays only after the child's own work, teach-back and
 * M2b, so it can never prime anything. Its placement (CHECKPOINT, after 'stage-teachback') is
 * itself the guard.
 *
 * ---- Usage (same GCP setup as generate-1-1-model.ts) ----
 *   npx tsx scripts/audio/generate-1-4-checkpoint.ts --dry-run
 *   npx tsx scripts/audio/generate-1-4-checkpoint.ts
 *   npx tsx scripts/audio/generate-1-4-checkpoint.ts --only=3
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
 * Story 1-4 CHECKPOINT — Audio Reference Scripts rev.3, §3B, with the §3D たとえば fix applied
 * (see file header). 〔SE:...〕 dropped; 〔間・Ns〕 converted to `pauseAfterMs` on the preceding
 * line. No ROBOT speaker in this script — it plays after the child's own work, reflecting on it
 * through GUIDE/PONTA dialogue only; Ponta's one quoted line of ROBOT's answer is verbatim.
 */
const LINES: Line[] = [
  { speaker: 'GUIDE', text: 'ポン太も、同じところを ほってみたんだって。' },
  { speaker: 'PONTA', text: 'うん！　遠足のおやつの話。「バナナは、おやつに入りますか？」ってやつ。' },
  { speaker: 'GUIDE', text: 'ロボは、さいしょ何て言った？' },
  // Ponta's quoted recollection — the mission's own authored layer-0 robotSays (oyatsu/s2.json), verbatim.
  { speaker: 'PONTA', text: '「おやつは、300円までって、きまってるんだよ」って。だから、わかった！って思ったの。' },
  { speaker: 'GUIDE', text: 'そのとき、自分に聞いたことば、おぼえてる？　「これで、ほんとうに……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……わかった？」って。そしたらね、ぜんぜんわかってなかったの。' },
  { speaker: 'GUIDE', text: 'どうして？' },
  { speaker: 'PONTA', text: 'だって、300円までって言われても、バナナがおやつなのかどうか、わかんないんだもん。' },
  { speaker: 'GUIDE', text: 'なるほど。' },
  { speaker: 'PONTA', text: 'それでね、はじめ「バナナって、何円？」って聞いちゃった。' },
  { speaker: 'GUIDE', text: 'うん。' },
  { speaker: 'PONTA', text: 'でも、それじゃ、ぜんぜんほれなかった。バナナが何円でも、おやつかどうかは、わからないから。' },
  { speaker: 'GUIDE', text: 'そういうこと、あるよね。' },
  { speaker: 'GUIDE', text: 'そのあと、自分に何て聞いた？　「まだ わからないのは……」', pauseAfterMs: 3000 },
  { speaker: 'PONTA', text: '「……どこ？」　わからないのは、「なにがおやつで、なにがおやつじゃないか」だって思ったの。' },
  { speaker: 'GUIDE', text: 'それで、つぎは？　「じゃあ、つぎに……」', pauseAfterMs: 3000 },
  // Architect resolution: replaces the draft's superseded 「たとえばで聞いてみた」 line — Ponta now
  // narrates the actual authored three-move chain, in order (see file header).
  { speaker: 'PONTA', text: '「……何を きけば いい？」　それでね、「どういうこと？」って聞いてみたの。そしたら、バナナは くだものだから、べつあつかいなんだって。' },
  { speaker: 'GUIDE', text: 'なるほど。' },
  { speaker: 'PONTA', text: 'それから「ほかにもある？」って聞いたら、おやつに するかは、クラスや学校でも ちがうって。' },
  { speaker: 'GUIDE', text: 'へえ。' },
  { speaker: 'PONTA', text: 'さいごに「なんで、ちがうの？」って聞いたら……ねっこに ついたんだ。' },
  { speaker: 'GUIDE', text: '聞いているきみも、ねっこについたよね。' },
  { speaker: 'GUIDE', text: 'でも、ねっこまでの道は、どうだった？　ポン太と、同じだった？　ちがった？', pauseAfterMs: 3000 },
  { speaker: 'GUIDE', text: 'どっちでも、いいんだよ。同じねっこでも、ほる道は、いろいろあるからね。' },
  { speaker: 'PONTA', text: 'へえ。きみはどんなふうにほったのかな。聞いてみたいな。' },
  { speaker: 'GUIDE', text: 'こんど、ほかのきまりでも、「これは、きまりに入る？　入らない？」って、考えてみてね。' },
];

const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/1-4-oyatsu');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/oyatsu.json');

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
      audioUrl: `/audio/m1/1-4-oyatsu/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'm1-s2-1-4',
    role: 'CHECKPOINT',
    audioStatus: 'ready',
    robotLine: 'おやつは、300円までって、きまってるんだよ。',
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
