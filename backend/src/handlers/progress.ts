import type { Env } from '../types.js';
import type { ProfileDoc, ProgressDoc } from '../schema.js';
import { profilePath, progressPath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { emptyModuleProgress, mergeModuleProgress, type ModuleProgressState } from '../../../shared/progressMerge.js';

const SCHEMA_VERSION = 1;

async function ownsProfile(env: Env, familyId: string, profileId: string): Promise<boolean> {
  const profile = await env.db.get<ProfileDoc>(profilePath(familyId, profileId));
  return !!profile && !profile.deletedAt;
}

/** GET /api/v1/profiles/{pid}/progress/{moduleId} — AD-13 §3/§5 step 4: "progress is fetched." */
export async function handleGetProgress(request: Request, env: Env, profileId: string, moduleId: string): Promise<Response> {
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;
  if (!(await ownsProfile(env, familyId, profileId))) return new Response('not found', { status: 404 });

  const stored = await env.db.get<ProgressDoc>(progressPath(familyId, profileId, moduleId));
  const body: ProgressDoc = stored ?? { ...emptyModuleProgress(), schemaVersion: SCHEMA_VERSION, rev: 0, updatedAt: new Date(0).toISOString() };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/**
 * PUT /api/v1/profiles/{pid}/progress/{moduleId} — AD-13 §3: "client state -> merged with the
 * server state in a transaction -> merged state returned." The transaction is what makes
 * acceptance test 11 (two devices syncing concurrently) safe: without it, two near-simultaneous
 * PUTs could both read the same pre-merge server state and each write their own merge, silently
 * dropping whichever wrote second's contribution.
 */
export async function handlePutProgress(request: Request, env: Env, profileId: string, moduleId: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;
  if (!(await ownsProfile(env, familyId, profileId))) return new Response('not found', { status: 404 });

  let clientState: ModuleProgressState;
  try {
    clientState = (await request.json()) as ModuleProgressState;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const path = progressPath(familyId, profileId, moduleId);
  const merged = await env.db.runTransaction(async (tx) => {
    const server = await tx.get<ProgressDoc>(path);
    const mergedState = mergeModuleProgress(server ?? emptyModuleProgress(), clientState);
    const doc: ProgressDoc = {
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
