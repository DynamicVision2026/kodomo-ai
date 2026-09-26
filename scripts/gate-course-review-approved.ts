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
import { checkCourseLesson } from './lib/courseContentGate.js';
import type { CourseManifest, CourseLesson } from '../src/course/content/types.js';

const ROOT = process.cwd();
const COURSE_DIR = resolve(ROOT, 'src/course/content');
const MANIFEST_PATH = resolve(COURSE_DIR, 'course.json');
const PUBLIC_DIR = resolve(ROOT, 'public');
const STRICT = process.env.RELEASE === '1';

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

if (failures > 0) {
  console.error(`\ngate:course-review: ${failures} failure(s) across ${checked} lesson(s)`);
  process.exit(1);
}

console.log(
  `gate:course-review: OK (${checked} lesson(s) checked, ${warnings} pending-review warning(s)` +
  `${STRICT ? ', release mode' : ''})`,
);
