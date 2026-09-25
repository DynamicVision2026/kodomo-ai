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
