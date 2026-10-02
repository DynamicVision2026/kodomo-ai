import type { MeResponse } from './api';

/**
 * WO-C5 §6: "the course needs the family licence, and existing 'Module 1' licences count." The
 * beginner course's own entitlement check is exactly `isModuleEntitled(familyId, 'm1')` restated
 * client-side against `/me`'s own entitlements list — the SAME SKU/moduleId (`kodomo-ai-m1`)
 * already used for the Playground, so a family that bought it before this course even existed is
 * licensed for the beginner course too, with zero new Shopify/webhook code.
 */
export function isBeginnerCourseLicensed(me: MeResponse): boolean {
  return me.entitlements.some((e) => e.moduleId === 'm1' && e.status === 'active');
}

/**
 * "Playground hidden; Lesson 1 is the free sample" (Founder, 2 Oct 2026) — a single, reversible
 * build flag, off by default (every real deploy to date ships with it unset, so this whole file's
 * behavior is unchanged from before this flag existed — see tests/beginnerLesson1FreeSample
 * .test.tsx's own flag-off regression case). When the Founder sets `VITE_PLAYGROUND_HIDDEN=1` in
 * a deploy: `/play/` itself (src/main.tsx) redirects to `/course/beginner/` instead of mounting
 * the Playground, and `FREE_SAMPLE_LESSON_ID` ('b01', Lesson 1) opens for every logged-in,
 * consented family regardless of the `m1` licence — Lessons 2-7 and the final page are
 * unaffected, still gated on `isBeginnerCourseLicensed` exactly as before. Unsetting the var
 * again is the entire rollback: nothing here is deleted, so the Playground and the all-lessons-
 * licensed-only gate both come back exactly as they were.
 *
 * This never touches `backend/src/access.ts`'s own `checkUnitAccess`/`isBeginnerLaunchEnabled` —
 * those gate the PLAYGROUND's own (`m1`) mission/bank units, a separate backend enforcement point
 * from the beginner course's lessons, which (like every other beginner-course gate today) are
 * enforced client-side only against `/me`, never by a backend per-lesson check.
 */
const PLAYGROUND_HIDDEN = import.meta.env.VITE_PLAYGROUND_HIDDEN === '1';
export const FREE_SAMPLE_LESSON_ID = 'b01';

/** Whether `lessonId` is openable for this family right now — Lesson 1 under the new flag,
 *  independent of licence; every other lesson (and the ending) still requires the licence. */
export function isLessonAccessible(me: MeResponse, lessonId: string): boolean {
  if (PLAYGROUND_HIDDEN && lessonId === FREE_SAMPLE_LESSON_ID) return true;
  return isBeginnerCourseLicensed(me);
}

/** The lesson ids open to every family regardless of licence, right now — `['b01']` once the
 *  flag is on, `[]` otherwise. Passed down to `BeginnerCourseHome` so its per-flower unlock/stage/
 *  lock-icon logic can stay keyed on `licensed` for everything except this explicit exception. */
export function freeSampleLessonIds(): string[] {
  return PLAYGROUND_HIDDEN ? [FREE_SAMPLE_LESSON_ID] : [];
}
