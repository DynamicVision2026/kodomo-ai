/**
 * CI GATE — formal course content review + kanji/ruby lint (WO-C1 §5). See
 * scripts/lib/courseContentGate.ts for the actual rules; this file is filesystem/CLI plumbing
 * only, mirroring scripts/gate-claims-approved.ts's own split.
 *
 * Reads src/course/content/course.json's own `parts` list for which lesson ids are real (rather
 * than globbing every file under lessons/) — this is what naturally excludes c00-demo (WO-C1 §6:
 * "not shown in production", and indeed not listed in any part) from this gate without a special
 * case. A lesson id listed in `parts` but with no `{id}.lesson.json` file yet (WO-C1: "Real lesson
 * content arrives later, one lesson at a time") is simply skipped — nothing to check yet.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadGradeMap } from '../pipeline/lib/kanji.js';
import { checkCourseLesson, checkBeginnerCourseLesson, checkBeginnerEndingLesson } from './lib/courseContentGate.js';
import { loadAudioSheet, distinctAudioFiles, type AudioSheetRow } from './lib/audioSheet.js';
import type { CourseManifest, CourseLesson, CourseBeginnerManifest, CourseBeginnerLesson, CourseEndingLesson } from '../src/course/content/types.js';

const ROOT = process.cwd();
const COURSE_DIR = resolve(ROOT, 'src/course/content');
const MANIFEST_PATH = resolve(COURSE_DIR, 'course.json');
const PUBLIC_DIR = resolve(ROOT, 'public');
const STRICT = process.env.RELEASE === '1';

/** WO-C2b §4: c01's own frozen recording sheet — 250 voiced lines across the two joined きく
 *  blocks (already covered by `checkAudioFilesExist`'s first loop, via `lesson.listen[].audio`)
 *  plus every standalone practice/make/teach-back/family clip and the 3 shared UI prompts. No
 *  other lesson has a sheet like this yet (Lessons 2-12 are out of this work order's scope), so
 *  this stays keyed to `c01` specifically rather than a generic per-lesson path convention. */
const C01_AUDIO_SHEET_PATH = resolve(COURSE_DIR, 'audio/nazehori-lesson1-audio-sheet.csv');
const JOIN_TARGET_FILES = new Set(['c01_listen_A.mp3', 'c01_listen_B.mp3']); // already checked via lesson.listen[].audio

/**
 * WO-C2 §5/instruction 5: "Audio isn't recorded yet. Use placeholder audio in preview only;
 * production must fail if any audio file is missing." Independent of the philosophy/japanese
 * approval check above (which already blocks c01 from a strict build today via its own null
 * lesson-level review) — this is a belt-and-suspenders check so a lesson that later DOES get its
 * review fields set to `approved` can never reach a real production build with missing audio,
 * even if that particular oversight slips past a human reviewer. Only enforced when `STRICT`,
 * same signal as every other release-only check here — a routine/preview build never has real
 * audio recorded yet, so this would otherwise fail every PR.
 */
function checkAudioFilesExist(lesson: CourseLesson): string[] {
  const issues: string[] = [];
  for (const block of lesson.listen) {
    const audioPath = resolve(PUBLIC_DIR, block.audio);
    if (!existsSync(audioPath)) {
      issues.push(`lesson ${lesson.id} listen (tool ${block.tool}): audio file missing — public/${block.audio}`);
    }
  }
  if (lesson.id === 'c01' && existsSync(C01_AUDIO_SHEET_PATH)) {
    const rows = loadAudioSheet(C01_AUDIO_SHEET_PATH);
    for (const { file, dir } of distinctAudioFiles(rows)) {
      if (JOIN_TARGET_FILES.has(file)) continue; // covered by the loop above
      const relPath = `audio/course/${dir === 'lesson' ? lesson.id : 'shared'}/${file}`;
      if (!existsSync(resolve(PUBLIC_DIR, relPath))) {
        issues.push(`lesson ${lesson.id}: audio clip missing — public/${relPath}`);
      }
    }
  }
  return issues;
}

if (!existsSync(MANIFEST_PATH)) {
  console.log('gate:course-review: OK (0 course lesson file(s) — no course.json yet)');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as CourseManifest;
const gradeOf = loadGradeMap();

let checked = 0;
let failures = 0;
let warnings = 0;

for (const part of manifest.parts) {
  if (part.kind !== 'lesson') continue;
  const lessonPath = resolve(COURSE_DIR, 'lessons', `${part.id}.lesson.json`);
  if (!existsSync(lessonPath)) continue; // not authored yet — nothing to check

  const lesson = JSON.parse(readFileSync(lessonPath, 'utf8')) as CourseLesson;
  checked++;
  const result = checkCourseLesson(lesson, gradeOf, { strict: STRICT });

  for (const issue of result.approvalIssues) {
    failures++;
    console.error(`FAIL gate:course-review — ${issue}`);
  }
  if (STRICT) {
    for (const issue of checkAudioFilesExist(lesson)) {
      failures++;
      console.error(`FAIL gate:course-review — ${issue}`);
    }
  }
  for (const issue of result.contentLintIssues) {
    failures++;
    console.error(`FAIL gate:course-review — lesson ${lesson.id}: ${issue}`);
  }
  for (const issue of result.contentLintWarnings) {
    warnings++;
    console.warn(`WARN gate:course-review — lesson ${lesson.id} (pending review): ${issue}`);
  }
}

/* =================================================================================================
 * WO-C5 §8 — the beginner course (b01-b07 + b-ending), a SEPARATE manifest
 * (`content/lessons/beginner.course.json`, `courseId: 'beginner'`) from `course.json`'s own
 * `stage2` roster above — read directly rather than added to that manifest, so nothing here can
 * ever affect c01-c12's own gate behaviour. Audio-file check generalizes c01's own
 * `distinctAudioFiles` (hardcoded to a `c01_` filename prefix) via `content/course/beginner/
 * beginner.audio-sheet.csv`'s own `clip` id prefix instead — never touching `scripts/lib/
 * audioSheet.ts`'s existing c01-only helper, for the same "zero risk to the c01 gate" reason
 * WO-C4's own generation script wrote its own lesson-id derivation rather than reusing it.
 * ================================================================================================= */
const BEGINNER_COURSE_DIR = resolve(ROOT, 'src/course/content/lessons');
const BEGINNER_MANIFEST_PATH = resolve(BEGINNER_COURSE_DIR, 'beginner.course.json');
const BEGINNER_AUDIO_SHEET_PATH = resolve(ROOT, 'content/course/beginner/beginner.audio-sheet.csv');

function beginnerLessonIdForClip(clip: string): string | null {
  const m = clip.match(/^(b\d\d)-/);
  if (m) return m[1]!;
  return clip.startsWith('END-') ? 'beginner' : null;
}

/** Every DISTINCT final file the beginner sheet implies must exist, one entry per joined きく/
 *  ending master (not one per line) plus every standalone clip — mirrors c01's own
 *  `distinctAudioFiles` but keyed by clip-id prefix instead of a hardcoded filename prefix. */
function beginnerDistinctAudioFiles(rows: AudioSheetRow[]): { file: string; lessonId: string }[] {
  const files = new Map<string, string>();
  for (const row of rows) {
    const lessonId = beginnerLessonIdForClip(row.clip);
    if (lessonId) files.set(row.file, lessonId);
  }
  return [...files.entries()].map(([file, lessonId]) => ({ file, lessonId }));
}

function checkBeginnerAudioFilesExist(lessonId: string, audio: string): string[] {
  const audioPath = resolve(PUBLIC_DIR, audio);
  return existsSync(audioPath) ? [] : [`lesson ${lessonId} listen: audio file missing — public/${audio}`];
}

if (existsSync(BEGINNER_MANIFEST_PATH)) {
  const beginnerManifest = JSON.parse(readFileSync(BEGINNER_MANIFEST_PATH, 'utf8')) as CourseBeginnerManifest;

  for (const part of beginnerManifest.parts) {
    if (part.kind !== 'lesson') continue;
    const lessonPath = resolve(BEGINNER_COURSE_DIR, `${part.id}.lesson.json`);
    if (!existsSync(lessonPath)) continue;

    const lesson = JSON.parse(readFileSync(lessonPath, 'utf8')) as CourseBeginnerLesson;
    checked++;
    const result = checkBeginnerCourseLesson(lesson, gradeOf, { strict: STRICT });

    for (const issue of result.approvalIssues) { failures++; console.error(`FAIL gate:course-review — ${issue}`); }
    if (STRICT) {
      for (const issue of checkBeginnerAudioFilesExist(lesson.id, lesson.listen.audio)) {
        failures++;
        console.error(`FAIL gate:course-review — ${issue}`);
      }
    }
    for (const issue of result.contentLintIssues) { failures++; console.error(`FAIL gate:course-review — lesson ${lesson.id}: ${issue}`); }
    for (const issue of result.contentLintWarnings) { warnings++; console.warn(`WARN gate:course-review — lesson ${lesson.id} (pending review): ${issue}`); }
  }

  const endingPart = beginnerManifest.parts.find((p) => p.kind === 'ending');
  if (endingPart) {
    const endingPath = resolve(BEGINNER_COURSE_DIR, `${endingPart.id}.json`);
    if (existsSync(endingPath)) {
      const ending = JSON.parse(readFileSync(endingPath, 'utf8')) as CourseEndingLesson;
      checked++;
      const result = checkBeginnerEndingLesson(ending, gradeOf, { strict: STRICT });
      for (const issue of result.approvalIssues) { failures++; console.error(`FAIL gate:course-review — ${issue}`); }
      if (STRICT) {
        for (const issue of checkBeginnerAudioFilesExist(ending.id, ending.audio)) {
          failures++;
          console.error(`FAIL gate:course-review — ${issue}`);
        }
      }
      for (const issue of result.contentLintIssues) { failures++; console.error(`FAIL gate:course-review — lesson ${ending.id}: ${issue}`); }
      for (const issue of result.contentLintWarnings) { warnings++; console.warn(`WARN gate:course-review — lesson ${ending.id} (pending review): ${issue}`); }
    }
  }

  if (STRICT && existsSync(BEGINNER_AUDIO_SHEET_PATH)) {
    const rows = loadAudioSheet(BEGINNER_AUDIO_SHEET_PATH);
    const joinTargetFiles = new Set(
      beginnerManifest.parts.map((p) => (p.kind === 'lesson' ? `${p.id}_listen.mp3` : 'b_ending.mp3')),
    );
    for (const { file, lessonId } of beginnerDistinctAudioFiles(rows)) {
      if (joinTargetFiles.has(file)) continue; // already checked via each lesson's own listen.audio / ending.audio
      const relPath = `audio/course/${lessonId}/${file}`;
      if (!existsSync(resolve(PUBLIC_DIR, relPath))) {
        failures++;
        console.error(`FAIL gate:course-review — beginner course: audio clip missing — public/${relPath}`);
      }
    }
  }
}

if (failures > 0) {
  console.error(`\ngate:course-review: ${failures} failure(s) across ${checked} lesson(s)`);
  process.exit(1);
}

console.log(
  `gate:course-review: OK (${checked} lesson(s) checked, ${warnings} pending-review warning(s)` +
  `${STRICT ? ', release mode' : ''})`,
);
