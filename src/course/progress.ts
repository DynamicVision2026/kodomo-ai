/**
 * WO-C1 §4: pure progress/unlock math for the formal course. No storage/network access — callers
 * (src/course/CourseApp.tsx, the backend's course-progress handler) feed in already-loaded state
 * and act on what these functions return. Unit-tested directly (tests/courseProgress.test.ts).
 */
import type { CourseLesson, CoursePart } from './content/types';

export interface CourseLessonProgress {
  listenDone: boolean;
  exercisesDone: string[];
  makeDone: boolean;
  teachBackDone: boolean;
  stars: number;
  lastStepAt: string;
}

export function emptyLessonProgress(): CourseLessonProgress {
  return { listenDone: false, exercisesDone: [], makeDone: false, teachBackDone: false, stars: 0, lastStepAt: '' };
}

export interface CourseProgressState {
  lessons: Record<string, CourseLessonProgress>;
  earlyUnlockedParts: string[];
  sixtyPercentNoticeShown: string[];
}

export function emptyCourseProgress(): CourseProgressState {
  return { lessons: {}, earlyUnlockedParts: [], sixtyPercentNoticeShown: [] };
}

/**
 * WO-C1 §4: "Lesson %: listen 20; exercises 40, split evenly across that lesson's exercises;
 * make 20 (on 「いって みた！」); teach-back 20 (on 「いえた！」)." `exercisesDone` is trusted to
 * only ever contain ids that belong to this lesson (the write path only ever adds an id it just
 * saw a best-option feedback for — see src/course/CourseApp.tsx) — filtered defensively anyway
 * so a corrupted/stale client value can never push a lesson over 100%.
 */
export function computeLessonPercent(lesson: CourseLesson, progress: CourseLessonProgress | undefined): number {
  if (!progress) return 0;
  const validIds = new Set(lesson.exercises.map((e) => e.id));
  const doneCount = progress.exercisesDone.filter((id) => validIds.has(id)).length;
  const exerciseTotal = lesson.exercises.length;
  const exercisePercent = exerciseTotal > 0 ? (doneCount / exerciseTotal) * 40 : 0;
  let percent = 0;
  if (progress.listenDone) percent += 20;
  percent += exercisePercent;
  if (progress.makeDone) percent += 20;
  if (progress.teachBackDone) percent += 20;
  return Math.min(100, Math.round(percent));
}

/** WO-C1 §4: "Playground %: 12.5 per completed story mission. Bank digs don't count." `storyIds`
 *  is `src/modules/m1/module.json`'s own `missionOrder` — data, not behavior, read the same way
 *  main.tsx already does; nothing here imports any Playground component or engine logic. */
export function playgroundFlowerPercent(storyIds: string[], missionDone: Record<string, boolean>): number {
  const done = storyIds.filter((id) => missionDone[id]).length;
  return Math.min(100, Math.round(done * 12.5));
}

export type FlowerStage = 'たね' | 'め' | 'つぼみ' | 'はな';

/** WO-C1 §3: "たね 0%, め 1–59%, つぼみ 60–99%, はな 100%." */
export function flowerStageForPercent(percent: number): FlowerStage {
  if (percent >= 100) return 'はな';
  if (percent >= 60) return 'つぼみ';
  if (percent >= 1) return 'め';
  return 'たね';
}

/** WO-C1 §4: "Stage %: the sum of the 13 parts' percentages ÷ 13." `partPercents` must already
 *  be in the SAME order/length as the manifest's own `parts` (13 entries: playground + 12
 *  lessons) — callers build it from `parts.map(...)`, never reordered here. */
export function computeStagePercent(partPercents: number[]): number {
  if (partPercents.length === 0) return 0;
  const sum = partPercents.reduce((a, b) => a + b, 0);
  return Math.round(sum / partPercents.length);
}

/**
 * WO-C1 §4: "Order: each part opens when the previous part reaches 100%. A parent can open the
 * next part early from the parent screen. Replaying never lowers progress." The first part is
 * always unlocked; every later part needs EITHER the immediately-previous part at 100% OR its
 * own id in `earlyUnlockedParts` (a parent override, itself monotonic — see
 * `CourseProgressDoc.earlyUnlockedParts`'s own doc comment on why it's never revoked).
 */
export function isPartUnlocked(
  index: number,
  parts: CoursePart[],
  partPercents: number[],
  earlyUnlockedParts: string[],
): boolean {
  if (index <= 0) return true;
  const part = parts[index];
  if (part && earlyUnlockedParts.includes(part.id)) return true;
  return (partPercents[index - 1] ?? 0) >= 100;
}

/** WO-C1 §4: "At 60% of a lesson, show 「きょうは ここまで で OK」 once." Called with the percent
 *  BEFORE and AFTER a progress-changing action — fires only on the crossing, and only if this
 *  lesson hasn't shown it before, so a lesson replayed after already reaching 100% never shows it
 *  again. */
export function shouldShowSixtyPercentNotice(
  lessonId: string,
  percentBefore: number,
  percentAfter: number,
  sixtyPercentNoticeShown: string[],
): boolean {
  if (sixtyPercentNoticeShown.includes(lessonId)) return false;
  return percentBefore < 60 && percentAfter >= 60;
}
