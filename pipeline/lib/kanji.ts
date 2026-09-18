import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type GradeTable = Record<string, string[]>;

const TABLE_PATH = resolve(process.cwd(), 'data/kyoiku-kanji.json');

/** Grade of a kanji, or 7 for anything above Grade 6 / not in the table. */
export type GradeMap = Map<string, number>;

export function loadGradeMap(): GradeMap {
  if (!existsSync(TABLE_PATH)) {
    throw new Error(
      'data/kyoiku-kanji.json is missing. Export the validated 1,026-character grade table ' +
      'from the SENJI repo first — see data/README.md. Content lint cannot run without it.',
    );
  }
  const raw = JSON.parse(readFileSync(TABLE_PATH, 'utf8')) as GradeTable;
  const total = Object.values(raw).reduce((n, list) => n + list.length, 0);
  if (total !== 1026) {
    throw new Error(`Grade table has ${total} characters, expected 1026. Re-export from SENJI.`);
  }
  const map: GradeMap = new Map();
  for (const [grade, list] of Object.entries(raw)) {
    for (const ch of list) map.set(ch, Number(grade));
  }
  return map;
}

const KANJI = /[\u4E00-\u9FFF\u3400-\u4DBF]/u;
export const isKanji = (ch: string): boolean => KANJI.test(ch);

export interface StageLimits {
  /** Kanji at or below this grade may appear with no ruby. */
  bareUpTo: number;
  /** Kanji above this grade may not appear at all. */
  allowedUpTo: number;
  maxSentence: number;
}

/** Spec v0.5 §3. */
export const STAGE_LIMITS: Record<number, StageLimits> = {
  1: { bareUpTo: 0, allowedUpTo: 2, maxSentence: 20 },
  2: { bareUpTo: 2, allowedUpTo: 4, maxSentence: 35 },
  3: { bareUpTo: 4, allowedUpTo: 6, maxSentence: 50 },
};
