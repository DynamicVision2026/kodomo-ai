import type { Env } from '../types.js';
import type { ProfileDoc, CourseProgressDoc } from '../schema.js';
import { profilePath, courseProgressPath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import {
  emptyCourseProgressState,
  mergeCourseProgress,
  type CourseProgressState,
} from '../../../shared/courseProgressMerge.js';
import { isCourseAllowedForFamily } from '../course.js';

const SCHEMA_VERSION = 1;

/**
 * WO-C1: the one internal course id this handler and `src/course/api.ts` both use for the
 * `courseProgress/{courseId}` path — "stage2", matching the content manifest's own `courseStage:
 * 2` and WO-C1's own `stage2.course.json` naming, chosen specifically so it can never collide
 * with `ProfileDoc.stage` (a grade-level 1|2|3, unrelated meaning) or Playground `moduleId`s like
 * "m1" (see `src/course/content/types.ts`'s header comment on the same naming-collision concern).
 */
export const COURSE_ID = 'stage2';

async function ownsProfile(env: Env, familyId: string, profileId: string): Promise<boolean> {
  const profile = await env.db.get<ProfileDoc>(profilePath(familyId, profileId));
  return !!profile && !profile.deletedAt;
}

/** GET /api/v1/profiles/{pid}/course-progress/{courseId} — mirrors handleGetProgress's shape,
 *  gated additionally by the course allowlist (WO-C1 §1/§4: unallowlisted families in production
 *  have no course to have progress on at all). */
export async function handleGetCourseProgress(request: Request, env: Env, profileId: string, courseId: string): Promise<Response> {
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;
  if (!(await ownsProfile(env, familyId, profileId))) return new Response('not found', { status: 404 });
  if (!(await isCourseAllowedForFamily(env, familyId))) return new Response('not found', { status: 404 });

  const stored = await env.db.get<CourseProgressDoc>(courseProgressPath(familyId, profileId, courseId));
  const body: CourseProgressDoc = stored ?? {
    ...emptyCourseProgressState(),
    schemaVersion: SCHEMA_VERSION,
    rev: 0,
    updatedAt: new Date(0).toISOString(),
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** PUT /api/v1/profiles/{pid}/course-progress/{courseId} — same transaction-merge shape as
 *  handlePutProgress, using mergeCourseProgress instead of mergeModuleProgress. No entitlement
 *  gate beyond the allowlist check itself: the course has no per-lesson paid/free split (WO-C1's
 *  content gate, not this handler, is what keeps unapproved lessons out of production). */
export async function handlePutCourseProgress(request: Request, env: Env, profileId: string, courseId: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;
  if (!(await ownsProfile(env, familyId, profileId))) return new Response('not found', { status: 404 });
  if (!(await isCourseAllowedForFamily(env, familyId))) return new Response('not found', { status: 404 });

  let clientState: CourseProgressState;
  try {
    clientState = (await request.json()) as CourseProgressState;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const path = courseProgressPath(familyId, profileId, courseId);
  const merged = await env.db.runTransaction(async (tx) => {
    const server = await tx.get<CourseProgressDoc>(path);
    const mergedState = mergeCourseProgress(server ?? emptyCourseProgressState(), clientState);
    const doc: CourseProgressDoc = {
      ...mergedState,
      schemaVersion: SCHEMA_VERSION,
      rev: (server?.rev ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    tx.set(path, doc);
    return doc;
  });

  return new Response(JSON.stringify(merged), { status: 200, headers: { 'content-type': 'application/json' } });
}
