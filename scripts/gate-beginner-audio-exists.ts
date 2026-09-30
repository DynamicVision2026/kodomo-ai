/**
 * WO-C6 A3: "File check (unit or build gate): every audio path referenced in
 * content/course/beginner/*.json exists in the build output. Zero missing." — ALWAYS ON, unlike
 * gate-course-review-approved.ts's own `checkBeginnerAudioFilesExist`/`checkAudioFilesExist`
 * (both gated behind `STRICT = process.env.RELEASE === '1'`, which CI never sets, so that check
 * is dead code in every real run today). This script is deliberately independent of that file and
 * of `STRICT` — it only ever checks audio-file existence, never lesson review-approval status, so
 * it can run on every PR without blocking on unrelated, still-pending content review.
 *
 * Every path is computed with the SAME builder functions the real screens call
 * (src/course/audioPaths.ts) rather than re-deriving the naming rule here — a screen and this gate
 * can never silently drift apart on what path a given clip resolves to.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  exerciseQ0AudioPath, exerciseAnswerAudioPath, exerciseOptionAudioPath,
  auditQ0AudioPath, auditAnswerAudioPath, auditPromptAudioPath, auditCardAudioPath, auditCardFeedbackAudioPath,
  homeTitleAudioPath, homeStepAudioPath, SHARED_AUDIO,
} from '../src/course/audioPaths.js';
import type { CourseBeginnerManifest, CourseBeginnerLesson, CourseEndingLesson } from '../src/course/content/types.js';

const ROOT = process.cwd();
const PUBLIC_DIR = resolve(ROOT, 'public');
const BEGINNER_COURSE_DIR = resolve(ROOT, 'src/course/content/lessons');
const BEGINNER_MANIFEST_PATH = resolve(BEGINNER_COURSE_DIR, 'beginner.course.json');

let checked = 0;
let missing = 0;

function require_(path: string, where: string): void {
  checked++;
  if (!existsSync(resolve(PUBLIC_DIR, path))) {
    missing++;
    console.error(`FAIL gate:beginner-audio-exists — ${where}: audio file missing — public/${path}`);
  }
}

if (!existsSync(BEGINNER_MANIFEST_PATH)) {
  console.log('gate:beginner-audio-exists: OK (no beginner.course.json yet)');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(BEGINNER_MANIFEST_PATH, 'utf8')) as CourseBeginnerManifest;

for (const part of manifest.parts) {
  if (part.kind !== 'lesson') continue;
  const lessonPath = resolve(BEGINNER_COURSE_DIR, `${part.id}.lesson.json`);
  if (!existsSync(lessonPath)) continue; // not authored yet

  const lesson = JSON.parse(readFileSync(lessonPath, 'utf8')) as CourseBeginnerLesson;
  const lessonId = lesson.id;

  // きく (matches ListenScreen.tsx's own `<audio src={block.audio}>`)
  require_(lesson.listen.audio, `${lessonId} listen`);

  // おうちで (matches HomeTaskScreen.tsx's own useVoiceQueue call)
  require_(homeTitleAudioPath(lessonId), `${lessonId} home title`);
  lesson.home.steps.forEach((_, i) => require_(homeStepAudioPath(lessonId, i), `${lessonId} home step ${i}`));

  // れんしゅう (matches ExerciseScreen.tsx's own two useVoiceQueue calls)
  for (const exercise of lesson.exercises) {
    require_(exerciseQ0AudioPath(lessonId, exercise.id), `${exercise.id} q0`);
    require_(exerciseAnswerAudioPath(lessonId, exercise.id), `${exercise.id} answer (step 0)`);
    exercise.steps.forEach((step, stepIndex) => {
      for (const option of step.options) {
        if (option.kind === 'question' || option.kind === 'stop') {
          require_(exerciseOptionAudioPath(lessonId, exercise.id, option.id, 'ask', stepIndex), `${exercise.id} step ${stepIndex} option ${option.id} ask`);
        }
        require_(exerciseOptionAudioPath(lessonId, exercise.id, option.id, 'reply', stepIndex), `${exercise.id} step ${stepIndex} option ${option.id} reply`);
        require_(exerciseOptionAudioPath(lessonId, exercise.id, option.id, 'feedback', stepIndex), `${exercise.id} step ${stepIndex} option ${option.id} feedback`);
      }
    });
  }

  // チェック (matches AuditScreen.tsx's own three useVoiceQueue calls)
  for (const item of lesson.audit) {
    require_(auditQ0AudioPath(lessonId, item.id), `${item.id} q0`);
    require_(auditAnswerAudioPath(lessonId, item.id), `${item.id} answer`);
    require_(auditPromptAudioPath(lessonId, item.id), `${item.id} prompt`);
    item.cards.forEach((_, cardIndex) => {
      require_(auditCardAudioPath(lessonId, item.id, cardIndex), `${item.id} card ${cardIndex}`);
      require_(auditCardFeedbackAudioPath(lessonId, item.id, cardIndex), `${item.id} card ${cardIndex} feedback`);
    });
  }
}

const endingPart = manifest.parts.find((p) => p.kind === 'ending');
if (endingPart) {
  const endingPath = resolve(BEGINNER_COURSE_DIR, `${endingPart.id}.json`);
  if (existsSync(endingPath)) {
    const ending = JSON.parse(readFileSync(endingPath, 'utf8')) as CourseEndingLesson;
    require_(ending.audio, `${ending.id} ending`);
  }
}

// The 3 course-wide prompts ExerciseScreen queues (SHARED_AUDIO.practiceNextPrompt/
// practiceRetryPrompt) — checked once, not per-lesson, since they're the same file every time.
require_(SHARED_AUDIO.practiceNextPrompt, 'shared practiceNextPrompt');
require_(SHARED_AUDIO.practiceRetryPrompt, 'shared practiceRetryPrompt');

if (missing > 0) {
  console.error(`\ngate:beginner-audio-exists: ${missing} missing file(s) across ${checked} referenced path(s)`);
  process.exit(1);
}

console.log(`gate:beginner-audio-exists: OK (${checked} referenced audio path(s), 0 missing)`);
