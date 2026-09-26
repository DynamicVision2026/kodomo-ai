/**
 * WO-C2b — the frozen Lesson 1 audio recording sheet (src/course/content/audio/
 * nazehori-lesson1-audio-sheet.csv), parsed once and shared by both the generation script
 * (scripts/audio/generate-c01-lesson.ts) and the production content gate
 * (scripts/gate-course-review-approved.ts) — one parser, one row shape, so "which files must
 * exist in production" and "which files this script writes" can never silently drift apart.
 */
import { readFileSync } from 'node:fs';

export interface AudioSheetRow {
  clip: string;
  file: string;
  speaker: string;
  text_ja: string;
  reading_notes: string;
  type: 'voice' | 'SE';
  part_or_role: string;
  sound_cue: string;
  english: string;
}

/** Minimal RFC4180 CSV parser (quoted fields, embedded commas, escaped "" ) — the sheet is a
 *  small, frozen, hand-authored file; a dependency for this alone isn't worth adding. */
export function parseAudioSheetCsv(text: string): AudioSheetRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  if (!header) return [];
  return data.map((cols) => Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ''])) as unknown as AudioSheetRow);
}

export function loadAudioSheet(sheetPath: string): AudioSheetRow[] {
  return parseAudioSheetCsv(readFileSync(sheetPath, 'utf8'));
}

/** Every DISTINCT final production file the sheet implies must exist — one entry per joined きく
 *  block (not one per line; the join step's own output is what production plays) plus every
 *  standalone/shared clip. `dir` follows the same "no `c01_` prefix -> shared" rule
 *  src/course/audioPaths.ts and generate-c01-lesson.ts both already encode. */
export function distinctAudioFiles(rows: AudioSheetRow[]): { file: string; dir: 'lesson' | 'shared' }[] {
  const files = new Map<string, 'lesson' | 'shared'>();
  for (const row of rows) {
    files.set(row.file, row.file.startsWith('c01_') ? 'lesson' : 'shared');
  }
  return [...files.entries()].map(([file, dir]) => ({ file, dir }));
}
