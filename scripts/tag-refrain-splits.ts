/**
 * Builder work order §6 (Listening Pocket — R2 refrain data): the audio manifests carry no
 * dedicated "this is a refrain" field, and a generic "long pause then a speaker change" shape
 * turned out to appear in R1 missions too (which must never get RefrainSlot treatment) — so
 * speaker/pause metadata ALONE cannot distinguish a real refrain split from an ordinary dramatic
 * beat. The user's own explicit, mechanical rule (verified against all 20 manifests, zero false
 * positives/negatives) is authoritative instead:
 *
 *   A split refrain is a GUIDE line whose text contains exactly one of three fixed fragments
 *   (each ending in the open ellipsis ……」), followed immediately by a PONTA line whose text
 *   STARTS WITH the matching completion fragment, with the GUIDE line's own pauseAfterMs
 *   confirming a real pause (not a same-beat continuation). R1 guide lines always speak the
 *   fragment's own FULL sentence (no ……」 truncation) and R3 ポン太 lines speak the whole
 *   refrain themselves — neither shape can ever match this rule, by construction.
 *
 * This script is the ONE place that rule is implemented — it writes the derived field onto the
 * GUIDE line (`refrainSplit: { refrain: 1 | 2 | 3, completion: string }`), never hand-edited.
 * scripts/lint-refrain-splits.ts re-derives the same rule and fails the build if the stored
 * field and the rule ever disagree, so the field can never silently drift from its own source.
 *
 * Usage: npx tsx scripts/tag-refrain-splits.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const AUDIO_DIR = resolve(process.cwd(), 'src/audio/content');

export interface RefrainRule {
  refrain: 1 | 2 | 3;
  /** The GUIDE line's own fragment — always ends in the open ellipsis, always closed by 」. */
  fragment: string;
  /** The PONTA completion the very next line must start with. */
  completion: string;
}

/** The three canonical refrain identities — verbatim across every R2 manifest (1-4/1-6/1-7;
 *  1-5/minna has none of them, which is itself a correct, expected finding, not a gap). */
export const REFRAIN_RULES: RefrainRule[] = [
  { refrain: 1, fragment: '「これで、ほんとうに……」', completion: '「……わかった？」' },
  { refrain: 2, fragment: '「まだ わからないのは……」', completion: '「……どこ？」' },
  { refrain: 3, fragment: '「じゃあ、つぎに……」', completion: '「……何を きけば いい？」' },
];

/** Strips the leading `「……` and trailing `」` off a completion fragment, e.g.
 *  `「……わかった？」` -> `わかった？` — the plain completion text RefrainSlot itself renders. */
function bareCompletion(completion: string): string {
  return completion.replace(/^「……/, '').replace(/」$/, '');
}

export interface AudioLine {
  speaker: string;
  text: string;
  audioUrl: string;
  pauseAfterMs: number;
  refrainSplit?: { refrain: 1 | 2 | 3; completion: string };
}
export interface AudioScript {
  missionId: string;
  role: string;
  lines?: AudioLine[];
}

export interface RefrainMatch {
  file: string;
  missionId: string;
  lineIndex: number;
  refrain: 1 | 2 | 3;
  completion: string;
}

/** Applies REFRAIN_RULES to one manifest's `lines`, returning the matches found. Mutates
 *  matching GUIDE lines in place (sets/overwrites `refrainSplit`); every other line is
 *  untouched, and a GUIDE line that no longer matches has `refrainSplit` removed. */
export function applyRefrainRules(script: AudioScript): RefrainMatch[] {
  const matches: RefrainMatch[] = [];
  const lines = script.lines ?? [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.speaker !== 'GUIDE') continue;
    const rule = REFRAIN_RULES.find((r) => line.text.includes(r.fragment));
    delete line.refrainSplit;
    if (!rule) continue;
    const next = lines[i + 1];
    const pauses = line.pauseAfterMs > 0;
    const nextMatches = next?.speaker === 'PONTA' && next.text.startsWith(rule.completion);
    if (pauses && nextMatches) {
      const completion = bareCompletion(rule.completion);
      line.refrainSplit = { refrain: rule.refrain, completion };
      matches.push({ file: '', missionId: script.missionId, lineIndex: i, refrain: rule.refrain, completion });
    }
  }
  return matches;
}

function main() {
  const files = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.json'));
  const allMatches: RefrainMatch[] = [];
  for (const file of files) {
    const path = join(AUDIO_DIR, file);
    const script = JSON.parse(readFileSync(path, 'utf8')) as AudioScript;
    const matches = applyRefrainRules(script);
    for (const m of matches) allMatches.push({ ...m, file });
    writeFileSync(path, `${JSON.stringify(script, null, 2)}\n`, 'utf8');
  }

  console.log(`Tagged ${allMatches.length} refrain split(s) across ${files.length} manifest(s):\n`);
  for (const m of allMatches) {
    console.log(`  ${m.file} (${m.missionId}) line ${m.lineIndex}: refrain ${m.refrain} -> "${m.completion}"`);
  }
}

// Only run when executed directly (`npx tsx scripts/tag-refrain-splits.ts`) — importing this
// module as a library (scripts/lint-refrain-splits.ts) must never have the side effect of
// rewriting every manifest on disk.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
