/** WO-C2b: unit coverage for the audio-sheet CSV parser + file-list derivation (pure logic,
 *  shared by scripts/audio/generate-c01-lesson.ts and scripts/gate-course-review-approved.ts). */
import { describe, it, expect } from 'vitest';
import { parseAudioSheetCsv, distinctAudioFiles } from '../scripts/lib/audioSheet';

const SAMPLE_CSV = [
  'clip,file,speaker,text_ja,reading_notes,type,part_or_role,sound_cue,english',
  'LA-SE00,c01_listen_A.mp3,SE,ドアがしまる音,,SE,,,Sound of a door closing.',
  'LA-01,c01_listen_A.mp3,ハテナ,どうしたの？,,voice,A-1,,"What is wrong?"',
  'S-01,course_prompt_next.mp3,ハテナ,つぎに何を聞けばいい？,何を→なにを,voice,,,"What should Ponta ask next, and also this?"',
  'e01-Q0,c01_e01_q0.mp3,ポン太,何時に帰ってくればいい？,何時→なんじ,voice,,,What time?',
].join('\n') + '\n';

describe('parseAudioSheetCsv', () => {
  it('parses rows with quoted fields containing commas', () => {
    const rows = parseAudioSheetCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(4);
    expect(rows[2]!.english).toBe('What should Ponta ask next, and also this?');
  });

  it('preserves every column, including empty ones', () => {
    const rows = parseAudioSheetCsv(SAMPLE_CSV);
    expect(rows[0]).toEqual({
      clip: 'LA-SE00', file: 'c01_listen_A.mp3', speaker: 'SE', text_ja: 'ドアがしまる音',
      reading_notes: '', type: 'SE', part_or_role: '', sound_cue: '', english: 'Sound of a door closing.',
    });
  });

  it('returns an empty array for an empty/header-only input', () => {
    expect(parseAudioSheetCsv('')).toEqual([]);
    expect(parseAudioSheetCsv('clip,file,speaker,text_ja,reading_notes,type,part_or_role,sound_cue,english\n')).toEqual([]);
  });
});

describe('distinctAudioFiles', () => {
  it('lists each distinct file exactly once, even when many rows share it', () => {
    const rows = parseAudioSheetCsv(SAMPLE_CSV);
    const files = distinctAudioFiles(rows);
    expect(files.filter((f) => f.file === 'c01_listen_A.mp3')).toHaveLength(1);
  });

  it('classifies a c01_-prefixed file as "lesson" and any other file as "shared"', () => {
    const rows = parseAudioSheetCsv(SAMPLE_CSV);
    const files = distinctAudioFiles(rows);
    expect(files.find((f) => f.file === 'c01_e01_q0.mp3')?.dir).toBe('lesson');
    expect(files.find((f) => f.file === 'course_prompt_next.mp3')?.dir).toBe('shared');
  });
});
