import type { Env } from '../types.js';
import type { ProfileDoc } from '../schema.js';
import { profilePath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { isModuleEntitled } from '../family.js';
import { recordFirstPaidUse } from '../access.js';

/** The beginner course shares the Playground's own `m1` licence/SKU (src/course/beginnerLicence.ts's
 *  own doc comment: "existing Module 1 licences count") — the SAME usage doc
 *  (`usagePath(familyId, 'm1')`) `/units/{unitId}/open` already writes to, so a beginner-course
 *  lesson open and a Playground mission open both feed the SAME admin "refund eligible" signal
 *  (backend/src/refund.ts's `computeEligibilitySnapshot`) with zero changes to that computation. */
const BEGINNER_COURSE_MODULE_ID = 'm1';

/** Lessons 2-7 only (Founder, 2 Oct 2026: "Record the first opening of Lessons 2 to 7... Opening
 *  Lesson 1, the course home or the account page must not count"). Lesson 1 (`b01`) is the free
 *  sample (src/course/beginnerLicence.ts) and must never count as "started"; the course home and
 *  account page never call this endpoint at all, so checking the set is the one defense this
 *  handler needs — a request naming any other id (b01, the ending, or anything invalid) is a
 *  silent no-op, never an error. */
const TRACKED_LESSON_IDS: ReadonlySet<string> = new Set(['b02', 'b03', 'b04', 'b05', 'b06', 'b07']);

async function ownsProfile(env: Env, familyId: string, profileId: string): Promise<boolean> {
  const profile = await env.db.get<ProfileDoc>(profilePath(familyId, profileId));
  return !!profile && !profile.deletedAt;
}

/**
 * POST /api/v1/course-lessons/{lessonId}/open — Founder, 2 Oct 2026: "Build the refund tracking
 * now. Record the first opening of Lessons 2 to 7 in the backend, and only when the family has the
 * licence. Reuse the existing usage record so the admin 'refund eligible' field picks it up."
 *
 * This is a tracking signal only, never a content gate: today's beginner-course lesson access is
 * enforced client-side against `/me` (`isLessonAccessible`), exactly as it was before this
 * endpoint existed — see src/course/beginnerLicence.ts's own doc comment ("like every other
 * beginner-course gate today... enforced client-side only against /me"). So an unlicensed family's
 * open, or an untracked lessonId, is a plain 200 no-op here rather than a 403/400 — there is
 * nothing to refuse, only nothing to record.
 */
export async function handleCourseLessonOpen(request: Request, env: Env, lessonId: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;

  let body: { profileId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.profileId !== 'string') return new Response('profileId is required', { status: 400 });
  const { profileId } = body as { profileId: string };
  if (!(await ownsProfile(env, familyId, profileId))) return new Response('not found', { status: 404 });

  if (TRACKED_LESSON_IDS.has(lessonId) && (await isModuleEntitled(env, familyId, BEGINNER_COURSE_MODULE_ID))) {
    await recordFirstPaidUse(env, familyId, BEGINNER_COURSE_MODULE_ID, lessonId, profileId, new Date());
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}
