/** WO-C5: the beginner course's own `courseId`, alongside (never replacing) `./courseId.ts`'s
 *  `'stage2'` — the backend's course-progress storage/API is already fully course-agnostic (see
 *  `backend/src/handlers/courseProgress.ts`), so a second `courseId` needs zero backend changes. */
export const BEGINNER_COURSE_ID = 'beginner';
