/**
 * Story 1-1 (chanto) MODEL audio — Google Cloud Text-to-Speech generation.
 *
 * Founder decision: Google Cloud Text-to-Speech is the production AI-TTS path (project
 * `kodomo-ai`, region `asia-northeast1`). This script is the reproducible generator for exactly
 * one lesson's audio: Story 1-1's MODEL script, transcribed verbatim from Audio Reference
 * Scripts rev.3 (no dialogue rewrites) — see LINES below. Running it again with the same input
 * regenerates byte-for-byte-equivalent output; editing LINES/VOICES and re-running is how any
 * line gets re-recorded later.
 *
 * Architect resolution: both ROBOT lines are now the mission's own authored engine strings,
 * copied verbatim (never new copy authored here). Index 6 is layer-0's robotSays; index 38 is
 * layer-1's robotSays (chanto/s2.json), ruby markup stripped — audio is spoken text, not an
 * on-screen reading aid, so `{部屋|へや}` becomes plain `部屋`, matching `stripRuby()`
 * (src/engine/ruby.tsx)'s own behavior.
 *
 * ---- One-time GCP setup required before this script can run (see the session's own report) ----
 * 1. Enable the API:      gcloud services enable texttospeech.googleapis.com --project=kodomo-ai
 * 2. Auth (either one):
 *    (a) simplest — an API key restricted to "Cloud Text-to-Speech API" only, exported as
 *        GOOGLE_TTS_API_KEY (this script uses the plain REST endpoint with it, no IAM role to
 *        pick), or
 *    (b) a service account + downloaded JSON key, granted a role that includes the
 *        `texttospeech.text.synthesize` permission (no GCP predefined role is scoped to just this
 *        API today, so either bind a custom role with that one permission, or use (a) instead),
 *        exported as GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (Application Default
 *        Credentials — this script's normal client-library path).
 *
 * ---- Usage ----
 *   npx tsx scripts/audio/generate-1-1-model.ts --list-voices   # confirm live ja-JP voice catalog
 *   npx tsx scripts/audio/generate-1-1-model.ts --dry-run       # validate LINES/paths, no API calls, no credentials needed
 *   npx tsx scripts/audio/generate-1-1-model.ts                 # the real run — needs (2a) or (2b) above
 *   npx tsx scripts/audio/generate-1-1-model.ts --only=38       # re-synthesize ONE line only (by
 *                                                                 index) — requires a full run to
 *                                                                 have already produced the
 *                                                                 manifest's own `lines` array;
 *                                                                 merges into it, leaves every
 *                                                                 other line's file/entry alone
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

type Speaker = 'GUIDE' | 'PONTA' | 'ROBOT';

interface Line {
  speaker: Speaker;
  text: string;
  /** Gap held after this line, before the next one starts. Rev.3's own explicitly scripted
   *  「間」pauses; every other line uses DEFAULT_GAP_MS (ordinary conversational spacing, not
   *  scripted — rev.3 doesn't time these, so they aren't asserted as instructional fact). */
  pauseAfterMs?: number;
}

const DEFAULT_GAP_MS = 350;

/**
 * Story 1-1 MODEL — Audio Reference Scripts rev.3, §1B, verbatim. 〔SE:...〕 sound-effect cues
 * dropped (not dialogue); 〔間・Ns〕 markers converted to `pauseAfterMs` on the preceding line.
 */
const LINES: Line[] = [
  { speaker: 'GUIDE', text: '……おや、ポン太。どうしたの？　なんだか、こまった顔をしてるね。' },
  { speaker: 'PONTA', text: 'うん……。さっきね、お母さんに「ちゃんとしなさい！」って言われたの。' },
  { speaker: 'GUIDE', text: 'そっか。' },
  { speaker: 'PONTA', text: 'でもさ、ぼく、ちゃんとしてたつもりなんだけどな。' },
  { speaker: 'GUIDE', text: 'ふうん。……じゃあ、ロボに聞いてみる？' },
  { speaker: 'PONTA', text: 'うん！　ねえロボ、「ちゃんと」って、なに？' },
  // ROBOT — resolved to the mission's own authored layer-0 robotSays (chanto/s2.json), verbatim.
  { speaker: 'ROBOT', text: '『ちゃんと』は、きちんとすることだよ。' },
  { speaker: 'PONTA', text: 'あ、そっか。わかった！', pauseAfterMs: 1000 },
  { speaker: 'GUIDE', text: 'これで、ほんとうに わかった？' },
  { speaker: 'PONTA', text: 'うん。まじめに、きちんと、でしょ？' },
  { speaker: 'GUIDE', text: 'うん、ロボはそう言ったね。……じゃあポン太、今から何をすればいい？' },
  { speaker: 'PONTA', text: 'え？　えっと……まじめに……。' },
  { speaker: 'GUIDE', text: 'まじめに、何をするの？' },
  { speaker: 'PONTA', text: '……あれ？', pauseAfterMs: 2000 },
  { speaker: 'PONTA', text: 'わかったと思ったのに……何をすればいいのか、わかんない。' },
  { speaker: 'GUIDE', text: 'おもしろいね。答えをもらったのに、まだわからないことがある。' },
  { speaker: 'PONTA', text: 'ねえ、わかる？' },
  { speaker: 'GUIDE', text: 'うーん。わたしにも、よくわからないな。だから、いっしょに考えてみよう。' },
  { speaker: 'GUIDE', text: 'まだ わからないのは、どこ？' },
  // The single 4-second listener pause in this lesson (rev.3's performance notes: "do not
  // shorten it — it is the listener's first chance to think before Ponta does").
  { speaker: 'GUIDE', text: '聞いているきみも、いっしょに考えてみて。ポン太は、何がまだわからないのかな。', pauseAfterMs: 4000 },
  { speaker: 'PONTA', text: '「まじめに」とか「きちんと」とか、ことばの意味は、わかるんだよ。でも……。' },
  { speaker: 'GUIDE', text: 'でも？' },
  { speaker: 'PONTA', text: 'お母さんが、ほんとは何をしてほしいのかが、わかんない。' },
  { speaker: 'GUIDE', text: 'なるほど。ことばの意味はわかった。でも、何をすればいいかは、まだわからないんだね。' },
  { speaker: 'PONTA', text: 'そう、それ！' },
  { speaker: 'GUIDE', text: 'それがわからないと、どうなるかな。' },
  { speaker: 'PONTA', text: 'うーん……。また「ちゃんとしなさい！」って言われちゃうかも。' },
  { speaker: 'GUIDE', text: 'そうかもしれないね。', pauseAfterMs: 1000 },
  { speaker: 'GUIDE', text: 'じゃあ、つぎに 何を きけば いい？' },
  { speaker: 'PONTA', text: 'えっと……「ちゃんとって、なに？」って、もう一回聞く！' },
  { speaker: 'GUIDE', text: 'それを聞いたら、何がわかりそう？' },
  { speaker: 'PONTA', text: '……あ。さっきと同じ答えが、かえってきちゃうかも。' },
  { speaker: 'GUIDE', text: 'そうだね。同じ聞き方をしたら、同じ答えになるかもしれないね。' },
  { speaker: 'PONTA', text: 'じゃあ……ぼくが知りたいのは、「何をすればいいか」だから……。' },
  { speaker: 'GUIDE', text: 'うん。' },
  { speaker: 'PONTA', text: '「いまの『ちゃんと』は、何をすればいいの？」って聞いてみる！' },
  { speaker: 'GUIDE', text: 'それなら、ポン太の知りたいことが聞けそうだね。' },
  { speaker: 'PONTA', text: 'ロボ。いまの「ちゃんと」は、何をすればいいの？' },
  // ROBOT's second line — resolved to the mission's own authored layer-1 robotSays
  // (chanto/s2.json: '{部屋|へや}をかたづけるときは、もとの{場所|ばしょ}にもどすことかな。'),
  // ruby markup stripped for speech, verbatim otherwise. Architect-verified against current
  // repo truth; supersedes the earlier draft wording about cleaning and eating.
  { speaker: 'ROBOT', text: '部屋をかたづけるときは、もとの場所にもどすことかな。' },
  { speaker: 'PONTA', text: 'えっ！' },
  { speaker: 'GUIDE', text: 'おや。' },
  { speaker: 'PONTA', text: '同じ「ちゃんと」なのに、そうじとごはんで、ちがう！' },
  { speaker: 'GUIDE', text: 'ほんとだね。さっきより、何がわかった？' },
  { speaker: 'PONTA', text: '「ちゃんと」の中身は、ひとつじゃないってこと。', pauseAfterMs: 1000 },
  { speaker: 'GUIDE', text: '……さあ。これで、ほんとうに わかった？' },
  { speaker: 'PONTA', text: 'うーん……。' },
  { speaker: 'GUIDE', text: 'ここから先は、聞いているきみのばんだよ。' },
];

/**
 * Voice assignment — three DIFFERENT ja-JP Neural2 voice models (not just one voice pitch-shifted
 * twice), so GUIDE/PONTA/ROBOT stay clearly distinguishable by timbre, not only by rate/pitch.
 * `--list-voices` confirms these names are still current before a real run; if Cloud TTS has
 * since added better-suited voices (e.g. newer Chirp3-HD ja-JP voices), swap the `name` values
 * here — nothing else about this script changes.
 */
const VOICES: Record<Speaker, { languageCode: string; name: string; pitch: number; speakingRate: number }> = {
  // Warm, unhurried, sincere (rev.3's own performance notes) — female neural voice.
  GUIDE: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  // A child's small, real reactions — male neural voice, brighter/quicker than GUIDE.
  PONTA: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  // "Plain and evenly paced... never sounds wrong or foolish" — a THIRD, distinct male neural
  // voice, flat delivery.
  ROBOT: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.0, speakingRate: 1.0 },
};

const OUT_DIR = resolve(process.cwd(), 'public/audio/m1/1-1-chanto');
const MANIFEST_PATH = resolve(process.cwd(), 'src/audio/content/chanto.json');

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

async function listVoices() {
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  const client = new TextToSpeechClient();
  const [res] = await client.listVoices({ languageCode: 'ja-JP' });
  for (const v of res.voices ?? []) {
    console.log(v.name, v.ssmlGender, v.naturalSampleRateHertz);
  }
}

/**
 * `onlyIndex` (--only=N): re-synthesizes ONLY that one line, merging its new mp3/manifest entry
 * into the EXISTING `lines` array a prior full run already produced — every other line's file
 * and manifest entry is left untouched. Requires that prior full run to have happened (the
 * manifest must already carry a real `lines` array to merge into); refuses otherwise rather than
 * silently writing a 1-entry manifest that would look like the other 46 lines never existed.
 */
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
      audioUrl: `/audio/m1/1-1-chanto/${item.file}`, pauseAfterMs: item.pauseAfterMs,
    };
    if (onlyIndex === undefined) manifestLines.push(entry); else manifestLines[item.index] = entry;
    console.log(`wrote ${outPath}`);
  }

  const manifest = {
    ...existingManifest,
    missionId: 'm1-s2-1-1',
    role: 'MODEL',
    audioStatus: 'ready',
    robotLine: LINES.find((l) => l.speaker === 'ROBOT')!.text,
    demonstratedLayers: [0],
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
if (args.includes('--list-voices')) {
  await listVoices();
} else if (args.includes('--dry-run')) {
  dryRun();
} else if (onlyArg) {
  await generate(Number(onlyArg.slice('--only='.length)));
} else {
  await generate();
}
