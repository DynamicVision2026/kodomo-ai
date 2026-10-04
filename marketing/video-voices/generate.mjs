// Marketing-only: synthesizes the course characters' lines used in the marketing videos with the
// SAME locked voices as scripts/audio/generate-beginner-audio.ts (VOICES table). Writes only
// under marketing/video-voices/out/. Never touches app audio, lesson content or production.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const VOICES = {
  'ハテナ': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', pitch: 0, speakingRate: 0.97 },
  'ポン太': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', pitch: 2.0, speakingRate: 1.05 },
  'お母さん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-A', pitch: -1.0, speakingRate: 0.98 },
  'おばあちゃん': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-B', pitch: -2.0, speakingRate: 0.88 },
  'お父さん': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', pitch: -1.5, speakingRate: 0.96 },
  // Marketing-only roles (Founder decision 4 Oct): narrator = the course's 先生 voice; AI = a flat voice no course role uses.
  'ナレーター': { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-C', pitch: 0, speakingRate: 1.0 },
  'AI': { languageCode: 'ja-JP', name: 'ja-JP-Standard-D', pitch: -3.0, speakingRate: 1.08 },
};
const token = process.env.GCP_ACCESS_TOKEN;
if (!token) throw new Error('GCP_ACCESS_TOKEN missing');
const dir = new URL('.', import.meta.url).pathname;
const lines = JSON.parse(readFileSync(dir + 'lines.json', 'utf8'));
mkdirSync(dir + 'out', { recursive: true });
const manifest = {};
for (const l of lines) {
  const v = VOICES[l.speaker];
  if (!v) throw new Error('no voice for ' + l.speaker);
  const fn = `out/${l.id}.mp3`;
  manifest[l.id] = { speaker: l.speaker, text: l.text, file: fn };
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': process.env.PROJECT_ID || 'kodomo-ai' },
    body: JSON.stringify({ input: { text: l.tts }, voice: { languageCode: v.languageCode, name: v.name }, audioConfig: { audioEncoding: 'MP3', pitch: v.pitch, speakingRate: v.speakingRate, sampleRateHertz: 24000 } }),
  });
  if (!res.ok) throw new Error(`${l.id}: ${res.status} ${await res.text()}`);
  const { audioContent } = await res.json();
  writeFileSync(dir + fn, Buffer.from(audioContent, 'base64'));
  console.log('ok', l.id, l.speaker, l.text);
}
writeFileSync(dir + 'out/manifest.json', JSON.stringify(manifest, null, 1));
