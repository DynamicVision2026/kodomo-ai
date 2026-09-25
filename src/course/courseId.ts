/** The one course id this shell ever talks to the backend about — kept in its own tiny module so
 *  both `src/course/CourseApp.tsx` and any test can import the exact same literal the backend
 *  handler uses (`backend/src/handlers/courseProgress.ts`'s own `COURSE_ID` constant). See that
 *  file's header comment for why "stage2" was chosen and what it can't collide with. */
export const COURSE_ID = 'stage2';
