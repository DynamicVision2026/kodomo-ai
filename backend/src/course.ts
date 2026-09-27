import type { Env } from './types.js';
import type { CourseAllowFamiliesDoc } from './schema.js';
import { courseAllowFamiliesPath } from './schema.js';

/**
 * WO-C1 §1/§4: `config/course.allowFamilies`, edited by hand in the Firestore console — the
 * exact same pattern as `getRefundPolicy` (backend/src/refund.ts): a small typed getter with an
 * empty-array default when the doc doesn't exist yet. No admin-dashboard UI for this by design
 * (WO-C1 §4/Coordinator: "No cross-service preview and no admin UI"); staff and the Founder add
 * their own test family's id to this same list, the same way any allowlisted family would be.
 */
export async function getCourseAllowedFamilyIds(env: Env): Promise<string[]> {
  const doc = await env.db.get<CourseAllowFamiliesDoc>(courseAllowFamiliesPath());
  return doc?.familyIds ?? [];
}

export async function isCourseAllowedForFamily(env: Env, familyId: string): Promise<boolean> {
  const ids = await getCourseAllowedFamilyIds(env);
  return ids.includes(familyId);
}

/**
 * WO-C5 §7/follow-up: the backend-side twin of the frontend's own `BEGINNER_LAUNCH` gate
 * (`VITE_BEGINNER_LAUNCH === '1' || me.courseAllowed`, src/course/BeginnerCourseApp.tsx) — reused
 * here by `backend/src/access.ts`'s `checkUnitAccess` so the Playground's own access rules (free
 * entry, no trial) change for a family at EXACTLY the moment the beginner course itself becomes
 * visible to them, never before. `env.BEGINNER_LAUNCH` is the server-side env var a real deploy
 * sets alongside the frontend build's `VITE_BEGINNER_LAUNCH` (both flipped together — see
 * docs/launch-runbook.md); `isCourseAllowedForFamily` reuses the SAME `config/course.allowFamilies`
 * allowlist stage2's own `courseAllowed` already reads, per the original WO-C5's own "the existing
 * COURSE_ENABLED / allowlist mechanism" instruction — one allowlist, not a second one to keep in
 * sync.
 */
export async function isBeginnerLaunchEnabled(env: Env, familyId: string): Promise<boolean> {
  if (env.BEGINNER_LAUNCH === '1') return true;
  return isCourseAllowedForFamily(env, familyId);
}
