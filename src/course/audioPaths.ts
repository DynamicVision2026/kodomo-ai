/**
 * WO-C2b §4: "every other clip goes to audio/course/c01/<file> and every shared clip to
 * audio/course/shared/<file>, using the file names in the sheet. The app plays them by that
 * naming rule; no new JSON fields." This is the ONE place that naming rule is encoded on the app
 * side — scripts/audio/generate-c01-lesson.ts encodes the SAME rule on the generation side (kept
 * in sync by construction, not by a shared import, since one is a Vite-bundled app module and the
 * other a Node CLI script outside the app's own module graph).
 *
 * Every path returned here is relative to the site root (ListenScreen.tsx's own `<audio src=`
 * convention: a leading `/` is added by the caller, matching how `public/` assets are served).
 */
import type { CourseToolId } from './content/types';

const SHARED_DIR = 'audio/course/shared';

function lessonDir(lessonId: string): string {
  return `audio/course/${lessonId}`;
}

/** 'c01-e01' -> '01' */
function exerciseNumber(exerciseId: string): string {
  return exerciseId.split('-e')[1] ?? '';
}

export function exerciseQ0AudioPath(lessonId: string, exerciseId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_e${exerciseNumber(exerciseId)}_q0.mp3`;
}

export function exerciseAnswerAudioPath(lessonId: string, exerciseId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_e${exerciseNumber(exerciseId)}_answer.mp3`;
}

export type ExerciseOptionAudioPart = 'ask' | 'reply' | 'feedback';

/** WO-C5 §2 b07 chains: step 0's clips are unprefixed (`..._a_ask.mp3`), step 1 is `_s1_`-prefixed,
 *  step 2 is `_s2_`, etc. — the WO's own "don't play it twice" means there is no per-step `answer`
 *  clip beyond step 0 (a later step's `answer` text is the same audio as the PREVIOUS step's chosen
 *  option's own `reply`, already played). */
function chainStepInfix(stepIndex: number): string {
  return stepIndex === 0 ? '' : `_s${stepIndex}`;
}

export function exerciseOptionAudioPath(
  lessonId: string, exerciseId: string, optionId: string, part: ExerciseOptionAudioPart, stepIndex = 0,
): string {
  return `${lessonDir(lessonId)}/${lessonId}_e${exerciseNumber(exerciseId)}${chainStepInfix(stepIndex)}_${optionId}_${part}.mp3`;
}

/* ---- WO-C5 §3 チェック (audit) audio paths — 'b01-k1' -> lessonId 'b01', auditNumber '1' -------- */

function auditNumber(auditId: string): string {
  return auditId.replace(/^k/, '');
}

export function auditQ0AudioPath(lessonId: string, auditId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_k${auditNumber(auditId)}_q0.mp3`;
}

export function auditAnswerAudioPath(lessonId: string, auditId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_k${auditNumber(auditId)}_answer.mp3`;
}

export function auditPromptAudioPath(lessonId: string, auditId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_k${auditNumber(auditId)}_prompt.mp3`;
}

export function auditCardAudioPath(lessonId: string, auditId: string, cardIndex: number): string {
  return `${lessonDir(lessonId)}/${lessonId}_k${auditNumber(auditId)}_c${cardIndex}.mp3`;
}

export function auditCardFeedbackAudioPath(lessonId: string, auditId: string, cardIndex: number): string {
  return `${lessonDir(lessonId)}/${lessonId}_k${auditNumber(auditId)}_c${cardIndex}_feedback.mp3`;
}

/** `lineIndex` is 0-based (the dialogue array's own index); the sheet's own file names are
 *  1-based, 2-digit (`c01_makeA_01.mp3`, `..._02.mp3`, ...). */
export function makeDialogueAudioPath(lessonId: string, tool: CourseToolId, lineIndex: number): string {
  const nn = String(lineIndex + 1).padStart(2, '0');
  return `${lessonDir(lessonId)}/${lessonId}_make${tool}_${nn}.mp3`;
}

export function teachBackPromptAudioPath(lessonId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_teach_prompt.mp3`;
}

export function familyIntroAudioPath(lessonId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_family_intro.mp3`;
}

/* ---- WO-C6 A1 おうちで (home challenge) audio paths — title, then one clip per home.steps[i] --- */

export function homeTitleAudioPath(lessonId: string): string {
  return `${lessonDir(lessonId)}/${lessonId}_home_title.mp3`;
}

export function homeStepAudioPath(lessonId: string, stepIndex: number): string {
  return `${lessonDir(lessonId)}/${lessonId}_home_s${stepIndex}.mp3`;
}

/** The 3 course-wide UI prompts (WO-C2b §4: reused across every future lesson, never
 *  lesson-prefixed) — keyed to what they say, not to any one lesson's content. */
export const SHARED_AUDIO = {
  practiceNextPrompt: `${SHARED_DIR}/course_prompt_next.mp3`,
  practiceRetryPrompt: `${SHARED_DIR}/course_try_again.mp3`,
  makeSayItPrompt: `${SHARED_DIR}/course_say_it.mp3`,
} as const;
