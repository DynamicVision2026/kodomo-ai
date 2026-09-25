/**
 * WO-C1: the one place the course manifest and its authored lesson files are loaded and typed —
 * every screen reads lesson/part data through this module, never importing a `.lesson.json` file
 * directly (mirrors src/main.tsx's own static per-mission import list for the Playground, adapted
 * to the course's much shorter roster: real content arrives "one lesson at a time, after human
 * review" per WO-C1's own goal, so new lessons are added here as an explicit one-line addition,
 * never a glob/dynamic-import).
 */
import courseManifestJson from './course.json';
import courseUiJson from './courseUi.json';
import c01Json from './lessons/c01.lesson.json';
import c00DemoJson from './lessons/c00-demo.lesson.json';
import type { CourseLesson, CourseManifest, CoursePart, CourseUiStrings } from './types';

export const courseManifest = courseManifestJson as unknown as CourseManifest;

/** spec v0.5 §7 / gate:no-hardcoded-copy: every fixed course-chrome string lives here, never as
 *  a literal in a screen component — see `CourseUiStrings`' own doc comment. */
export const courseUi = courseUiJson as unknown as CourseUiStrings;

/** Deliberately excludes c00-demo (see course.json's own comment — the demo lesson is never a
 *  manifest `part`, so it's naturally excluded from the CI content gate scan, the production
 *  garden's 13 flowers, and stage-percent math). Reached only via its own direct demo entry
 *  point (WO-C1 §6: "must show one demo lesson end to end"). */
const lessonsById: Record<string, CourseLesson> = {
  c01: c01Json as unknown as CourseLesson,
};

export const demoLesson: CourseLesson = c00DemoJson as unknown as CourseLesson;

export function getLesson(lessonId: string): CourseLesson | undefined {
  return lessonsById[lessonId];
}

const lessonParts: CoursePart[] = courseManifest.parts.filter((p) => p.kind === 'lesson');

/** A lesson's 1-12 position among the manifest's own `kind: 'lesson'` parts — see types.ts's
 *  `CourseLesson` header comment on why this is derived here rather than stored on the lesson
 *  file itself. Returns `null` for a lesson id not present in the manifest (e.g. the demo
 *  lesson, or a not-yet-authored one). */
export function lessonNumberFor(lessonId: string): number | null {
  const index = lessonParts.findIndex((p) => p.id === lessonId);
  return index === -1 ? null : index + 1;
}
