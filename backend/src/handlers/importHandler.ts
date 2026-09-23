import type { Env } from '../types.js';
import type { FamilyDoc, ImportDoc, ProfileDoc, ProgressDoc } from '../schema.js';
import { familyPath, importPath, MAX_PROFILES, profilePath, progressPath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { isValidAvatarId, isValidNicknameId } from '../../../shared/presetIds.js';
import { emptyModuleProgress, mergeModuleProgress, type ModuleProgressState } from '../../../shared/progressMerge.js';
import { randomToken } from '../util.js';

interface ImportBody {
  importId?: unknown;
  moduleId?: unknown;
  guestProfile?: { avatarId?: unknown; nicknameId?: unknown; stage?: unknown };
  progress?: unknown;
  targetProfileId?: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * POST /api/v1/import — AD-13 §3/§5 step 3.4/acceptance test 12: guest 1-1 progress, made on this
 * device with no account, imported into the family at first login. `importId` (client-generated,
 * per attempt) makes a retry/redelivery a no-op rather than a second profile or a double merge —
 * the same idempotency shape the Shopify webhook already uses for orders.
 */
export async function handleImport(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.importId !== 'string' || !body.importId) return new Response('importId is required', { status: 400 });
  if (typeof body.moduleId !== 'string' || !body.moduleId) return new Response('moduleId is required', { status: 400 });

  const existingImport = await env.db.get<ImportDoc>(importPath(body.importId));
  if (existingImport) {
    if (existingImport.familyId !== familyId) return new Response('forbidden', { status: 403 });
    return jsonResponse({ profileId: existingImport.profileId, alreadyImported: true });
  }

  const guestProgress = (body.progress ?? emptyModuleProgress()) as ModuleProgressState;
  const now = new Date().toISOString();

  if (typeof body.targetProfileId === 'string' && body.targetProfileId) {
    // AD-13 §3: "at 6 profiles, the parent picks a profile to merge into."
    const targetId = body.targetProfileId;
    const target = await env.db.get<ProfileDoc>(profilePath(familyId, targetId));
    if (!target || target.deletedAt) return new Response('target profile not found', { status: 404 });

    const path = progressPath(familyId, targetId, body.moduleId);
    await env.db.runTransaction(async (tx) => {
      const server = await tx.get<ProgressDoc>(path);
      const merged = mergeModuleProgress(server ?? emptyModuleProgress(), guestProgress);
      tx.set(path, { ...merged, schemaVersion: 1, rev: (server?.rev ?? 0) + 1, updatedAt: now });
      tx.set(importPath(body.importId as string), { familyId, profileId: targetId, createdAt: now } satisfies ImportDoc);
    });
    return jsonResponse({ profileId: targetId, alreadyImported: false });
  }

  const guest = body.guestProfile;
  if (!guest || typeof guest.avatarId !== 'string' || !isValidAvatarId(guest.avatarId)) {
    return new Response('invalid guestProfile.avatarId', { status: 400 });
  }
  if (typeof guest.nicknameId !== 'string' || !isValidNicknameId(guest.nicknameId)) {
    return new Response('invalid guestProfile.nicknameId', { status: 400 });
  }
  const stage = typeof guest.stage === 'number' && [1, 2, 3].includes(guest.stage) ? guest.stage : 2;

  const result = await env.db.runTransaction(async (tx) => {
    const family = await tx.get<FamilyDoc>(familyPath(familyId));
    if (!family) return { ok: false as const, reason: 'family_not_found' as const };
    if (family.profileCount >= MAX_PROFILES) return { ok: false as const, reason: 'max_profiles' as const };

    const profileId = randomToken(8);
    const profile: ProfileDoc = {
      avatarId: guest.avatarId as string,
      nicknameId: guest.nicknameId as string,
      stage,
      settingsUpdatedAt: now,
      createdAt: now,
      deletedAt: null,
    };
    tx.set(profilePath(familyId, profileId), profile);
    tx.set(familyPath(familyId), { ...family, profileCount: family.profileCount + 1, updatedAt: now });
    tx.set(progressPath(familyId, profileId, body.moduleId as string), {
      ...guestProgress,
      schemaVersion: 1,
      rev: 1,
      updatedAt: now,
    });
    tx.set(importPath(body.importId as string), { familyId, profileId, createdAt: now } satisfies ImportDoc);
    return { ok: true as const, profileId };
  });

  if (!result.ok) {
    return jsonResponse({ error: result.reason }, result.reason === 'max_profiles' ? 409 : 404);
  }
  return jsonResponse({ profileId: result.profileId, alreadyImported: false });
}
