/**
 * WO-C1 §3/§4, updated WO-C2 §2/§5: the course's own monotonic merge function — the pure
 * counterpart to shared/progressMerge.ts, for the course's progress shape instead of the
 * Playground's `ModuleProgressState`. Lives here, not imported by either side (same reasoning
 * shared/progressMerge.ts's own header comment gives): `backend/src/schema.ts`'s
 * `CourseProgressDoc`/`CourseLessonProgress` and `src/course/progress.ts`'s matching types both
 * structurally mirror the shapes below rather than importing them, so neither tsconfig
 * (tsconfig.server.json has no `src/`; this file must compile under it) ends up coupled to the
 * other side.
 *
 * Same commutative/idempotent contract as `mergeModuleProgress`: merging is safe in either
 * order, and merging a value with itself changes nothing — required for two devices (or a retried
 * request) syncing the same profile's course progress.
 *
 * Field-by-field merge rules:
 *  - `lessons[id].listenADone`/`listenBDone`  -> OR
 *  - `lessons[id].exercisesDone`              -> union (distinct exercise ids)
 *  - `lessons[id].makeADone`/`makeBDone`      -> OR
 *  - `lessons[id].teachBackDone`              -> OR
 *  - `lessons[id].stars`                      -> max (a count that only ever increases)
 *  - `lessons[id].lastStepAt`                 -> max (latest ISO timestamp wins — ties broken by
 *                                                string compare, safe for ISO 8601's lexical order)
 *  - `earlyUnlockedParts`                     -> union (a parent's early unlock, once granted, is
 *                                                never revoked by a later merge — WO-C1 §4:
 *                                                "Replaying never lowers progress")
 *  - `sixtyPercentNoticeShown`                -> union (once shown anywhere, never re-shown)
 *
 * WO-C2 §2 BREAKING CHANGE from WO-C1: `listenDone`/`makeDone` (single booleans) are replaced by
 * per-tool `listenADone`/`listenBDone` and `makeADone`/`makeBDone` — the new progress weights
 * (きくA/B = 10+10, つくるA/B = 10+10) score each tool's きく/つくる step independently, matching
 * `CourseLesson.listen`/`.make` already being one block per tool.
 */

export interface CourseLessonProgressState {
  listenADone: boolean;
  listenBDone: boolean;
  exercisesDone: string[];
  makeADone: boolean;
  makeBDone: boolean;
  teachBackDone: boolean;
  stars: number;
  lastStepAt: string;
}

export interface CourseProgressState {
  lessons: Record<string, CourseLessonProgressState>;
  earlyUnlockedParts: string[];
  sixtyPercentNoticeShown: string[];
}

export function emptyLessonProgressState(): CourseLessonProgressState {
  return {
    listenADone: false, listenBDone: false, exercisesDone: [],
    makeADone: false, makeBDone: false, teachBackDone: false,
    stars: 0, lastStepAt: '',
  };
}

export function emptyCourseProgressState(): CourseProgressState {
  return { lessons: {}, earlyUnlockedParts: [], sixtyPercentNoticeShown: [] };
}

function unique(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b])).sort();
}

function mergeLessonProgress(a: CourseLessonProgressState, b: CourseLessonProgressState): CourseLessonProgressState {
  return {
    listenADone: a.listenADone || b.listenADone,
    listenBDone: a.listenBDone || b.listenBDone,
    exercisesDone: unique(a.exercisesDone, b.exercisesDone),
    makeADone: a.makeADone || b.makeADone,
    makeBDone: a.makeBDone || b.makeBDone,
    teachBackDone: a.teachBackDone || b.teachBackDone,
    stars: Math.max(a.stars, b.stars),
    lastStepAt: a.lastStepAt > b.lastStepAt ? a.lastStepAt : b.lastStepAt,
  };
}

export function mergeCourseProgress(a: CourseProgressState, b: CourseProgressState): CourseProgressState {
  const lessonIds = new Set([...Object.keys(a.lessons), ...Object.keys(b.lessons)]);
  const lessons: CourseProgressState['lessons'] = {};
  for (const id of lessonIds) {
    const la = a.lessons[id];
    const lb = b.lessons[id];
    lessons[id] = la && lb ? mergeLessonProgress(la, lb) : (la ?? lb)!;
  }
  return {
    lessons,
    earlyUnlockedParts: unique(a.earlyUnlockedParts, b.earlyUnlockedParts),
    sixtyPercentNoticeShown: unique(a.sixtyPercentNoticeShown, b.sixtyPercentNoticeShown),
  };
}
