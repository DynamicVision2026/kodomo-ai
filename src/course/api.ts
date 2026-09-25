/**
 * WO-C1: the course shell's own API calls — reuses `src/family/api.ts`'s `apiFetch`/`isFailure`
 * (same-origin `/api/v1` reverse proxy, same `ApiFailure` sentinel) rather than a second copy, per
 * the Coordinator's "reuse... the shared infrastructure (family account, profiles, schema/progress
 * helpers...)" direction. `fetchMe`/`MeResponse` (with its `courseAllowed` field) are re-exported
 * as-is — the course shell's own gate check is `VITE_COURSE_ENABLED === '1' || me.courseAllowed`,
 * computed by the caller, not by this module.
 */
import { apiFetch, isFailure, fetchMe, type MeResponse } from '../family/api';
import type { CourseProgressState } from '../../shared/courseProgressMerge';

export { fetchMe, type MeResponse };

export async function getCourseProgress(profileId: string, courseId: string): Promise<CourseProgressState | null> {
  const res = await apiFetch(`/profiles/${profileId}/course-progress/${courseId}`, { method: 'GET' });
  if (isFailure(res) || !res.ok) return null;
  return (await res.json()) as CourseProgressState;
}

export async function putCourseProgress(
  profileId: string,
  courseId: string,
  state: CourseProgressState,
): Promise<CourseProgressState | null> {
  const res = await apiFetch(`/profiles/${profileId}/course-progress/${courseId}`, {
    method: 'PUT',
    body: JSON.stringify(state),
  });
  if (isFailure(res) || !res.ok) return null;
  return (await res.json()) as CourseProgressState;
}
