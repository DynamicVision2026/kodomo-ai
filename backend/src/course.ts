import type { Env } from './types.js';
import type { CourseAllowFamiliesDoc } from './schema.js';
import { courseAllowFamiliesPath } from './schema.js';
import { getFamily, normalizeEmail } from './family.js';

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

/**
 * WO-C5 preview follow-up: a server-side-only staff preview list, by VERIFIED login email
 * (`FamilyDoc.email` — set once, only ever from an already-verified OTP, `getOrCreateFamilyIdInTx`'s
 * own doc comment) rather than by familyId — the Founder asked for this specifically because he
 * won't edit Firestore, and a staff mailbox is easier to hand out than a familyId nobody sees
 * without an Admin Dashboard round-trip. `COURSE_PREVIEW_EMAILS` is set only in the backend's own
 * deploy env (ci.yml's `deploy-backend` job) — never a `VITE_*` var, so it never reaches the
 * frontend bundle at all; it's staff's own mailbox address, not a secret, but there's still no
 * reason to ship it client-side. Comma-separated, case/whitespace-insensitive exact match only
 * (`normalizeEmail` — the same trim+lowercase already used for the email-uniqueness index, so
 * "Info@Domo-AI.com" and "info@domo-ai.com " both match the one canonical form).
 */
function coursePreviewEmails(env: Env): string[] {
  return (env.COURSE_PREVIEW_EMAILS ?? '')
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

export async function isCourseAllowedForFamily(env: Env, familyId: string): Promise<boolean> {
  const ids = await getCourseAllowedFamilyIds(env);
  if (ids.includes(familyId)) return true;

  const previewEmails = coursePreviewEmails(env);
  if (previewEmails.length === 0) return false;
  const family = await getFamily(env, familyId);
  return !!family && previewEmails.includes(normalizeEmail(family.email));
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
