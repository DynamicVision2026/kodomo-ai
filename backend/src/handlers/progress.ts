import type { Env } from '../types.js';
import type { ProfileDoc, ProgressDoc } from '../schema.js';
import { profilePath, progressPath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { emptyModuleProgress, mergeModuleProgress, type ModuleProgressState } from '../../../shared/progressMerge.js';
import { isFreeMission } from '../../../shared/freeMissions.js';
import { isModuleEntitled } from '../family.js';
import { recordFirstPaidUse } from '../access.js';

const SCHEMA_VERSION = 1;

async function ownsProfile(env: Env, familyId: string, profileId: string): Promise<boolean> {
  const profile = await env.db.get<ProfileDoc>(profilePath(familyId, profileId));
  return !!profile && !profile.deletedAt;
}

/**
 * AD-15 "server-authoritative access gate" / "server-side progress-write enforcement": a
 * `missions[missionId]` entry is only ever accepted when `moduleId` itself is actively entitled,
 * OR `missionId` is one of that module's own free/trial ids (AD-15: "trial content = Lesson 1-1
 * only" — the same free tier a guest already gets, never widened by being logged in or mid-trial).
 * Everything else (`moveProgress`, `milestones`, `memories`, `m2Evidence`, `guidance`) is engine
 * evidence that isn't itself a claim of "I completed paid mission X" and is left untouched — this
 * is a deliberately narrow gate on the one field that IS such a claim, not a blanket lock on every
 * synced field. Silently dropping a disallowed key (never rejecting the whole request) means a
 * family's legitimate free-mission progress still syncs even while an entitlement lapses/expires
 * mid-session, exactly like AD-13's own webhook idempotency philosophy ("never fail the whole
 * request over a part of it that doesn't apply").
 */
function enforceMissionAccess(
  missions: ModuleProgressState['missions'],
  moduleId: string,
  moduleEntitled: boolean,
): ModuleProgressState['missions'] {
  if (moduleEntitled) return missions;
  const allowed: ModuleProgressState['missions'] = {};
  for (const [missionId, progress] of Object.entries(missions)) {
    if (isFreeMission(moduleId, missionId)) allowed[missionId] = progress;
  }
  return allowed;
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

  const moduleEntitled = await isModuleEntitled(env, familyId, moduleId);
  const sanitizedMissions = enforceMissionAccess(clientState.missions, moduleId, moduleEntitled);
  const sanitizedState: ModuleProgressState = { ...clientState, missions: sanitizedMissions };

  // AD-16 §6 "defensive rule": a PUT carrying an accepted (i.e. genuinely entitled) paid-unit
  // event also records first paid use, in case it happened to reach here without going through
  // POST /units/{unitId}/open first (e.g. an older client, or a retried/offline-queued write).
  // recordFirstPaidUse is itself idempotent — this never overwrites an already-set record.
  const paidUnitId = Object.keys(sanitizedMissions).find((missionId) => !isFreeMission(moduleId, missionId));
  if (paidUnitId) {
    await recordFirstPaidUse(env, familyId, moduleId, paidUnitId, profileId);
  }

  const path = progressPath(familyId, profileId, moduleId);
  const merged = await env.db.runTransaction(async (tx) => {
    const server = await tx.get<ProgressDoc>(path);
    const mergedState = mergeModuleProgress(server ?? emptyModuleProgress(), sanitizedState);
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
