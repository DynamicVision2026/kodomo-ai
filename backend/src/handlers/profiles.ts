import type { Env } from '../types.js';
import type { FamilyDoc, ProfileDoc } from '../schema.js';
import { familyPath, MAX_PROFILES, profilePath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { isValidAvatarId, isValidNicknameId } from '../../../shared/presetIds.js';
import { randomToken } from '../util.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** POST /api/v1/profiles — AD-13 §3: "cap of 6; preset IDs only." Enforced inside a transaction
 *  against `family.profileCount` (never a plain list-and-count outside a transaction, which two
 *  simultaneous creates could both pass). */
export async function handleCreateProfile(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  let body: { avatarId?: unknown; nicknameId?: unknown; stage?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.avatarId !== 'string' || !isValidAvatarId(body.avatarId)) {
    return new Response('invalid avatarId', { status: 400 });
  }
  if (typeof body.nicknameId !== 'string' || !isValidNicknameId(body.nicknameId)) {
    return new Response('invalid nicknameId', { status: 400 });
  }
  const stage = typeof body.stage === 'number' && [1, 2, 3].includes(body.stage) ? body.stage : 2;

  const familyId = resolved.session.familyId;
  const now = new Date().toISOString();
  const result = await env.db.runTransaction(async (tx) => {
    const family = await tx.get<FamilyDoc>(familyPath(familyId));
    if (!family) return { ok: false as const, reason: 'family_not_found' as const };
    if (family.profileCount >= MAX_PROFILES) return { ok: false as const, reason: 'max_profiles' as const };

    const profileId = randomToken(8);
    const profile: ProfileDoc = {
      avatarId: body.avatarId as string,
      nicknameId: body.nicknameId as string,
      stage,
      settingsUpdatedAt: now,
      createdAt: now,
      deletedAt: null,
    };
    tx.set(profilePath(familyId, profileId), profile);
    tx.set(familyPath(familyId), { ...family, profileCount: family.profileCount + 1, updatedAt: now });
    return { ok: true as const, profileId, profile };
  });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), {
      status: result.reason === 'max_profiles' ? 409 : 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  return jsonResponse({ id: result.profileId, ...result.profile }, 201);
}

async function getOwnedProfile(env: Env, familyId: string, profileId: string): Promise<ProfileDoc | null> {
  const profile = await env.db.get<ProfileDoc>(profilePath(familyId, profileId));
  return profile && !profile.deletedAt ? profile : null;
}

/** PATCH /api/v1/profiles/{pid} — avatar/nickname/stage updates, last-write-wins by
 *  `settingsUpdatedAt` (AD-13 §2's own merge rule for profile settings) so two devices editing
 *  concurrently converge on whichever write actually happened last, not whichever request
 *  happened to land on the server last. */
export async function handleUpdateProfile(request: Request, env: Env, profileId: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  const familyId = resolved.session.familyId;
  const existing = await getOwnedProfile(env, familyId, profileId);
  if (!existing) return new Response('not found', { status: 404 });

  let body: { avatarId?: unknown; nicknameId?: unknown; stage?: unknown; settingsUpdatedAt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (body.avatarId !== undefined && (typeof body.avatarId !== 'string' || !isValidAvatarId(body.avatarId))) {
    return new Response('invalid avatarId', { status: 400 });
  }
  if (body.nicknameId !== undefined && (typeof body.nicknameId !== 'string' || !isValidNicknameId(body.nicknameId))) {
    return new Response('invalid nicknameId', { status: 400 });
  }
  if (body.stage !== undefined && (typeof body.stage !== 'number' || ![1, 2, 3].includes(body.stage))) {
    return new Response('invalid stage', { status: 400 });
  }

  const incomingTimestamp = typeof body.settingsUpdatedAt === 'string' ? body.settingsUpdatedAt : new Date().toISOString();
  if (new Date(incomingTimestamp).getTime() < new Date(existing.settingsUpdatedAt).getTime()) {
    // A stale write loses outright — the newer state already on the server wins.
    return jsonResponse({ id: profileId, ...existing });
  }

  const updated: ProfileDoc = {
    ...existing,
    avatarId: (body.avatarId as string) ?? existing.avatarId,
    nicknameId: (body.nicknameId as string) ?? existing.nicknameId,
    stage: (body.stage as number) ?? existing.stage,
    settingsUpdatedAt: incomingTimestamp,
  };
  await env.db.set(profilePath(familyId, profileId), updated);
  return jsonResponse({ id: profileId, ...updated });
}

/** DELETE /api/v1/profiles/{pid} — soft delete (kept for audit/undo headroom) + decrements
 *  `family.profileCount` in the same transaction that `handleCreateProfile` reads, so a delete
 *  immediately frees a slot the very next create can use. */
export async function handleDeleteProfile(request: Request, env: Env, profileId: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  const familyId = resolved.session.familyId;
  const now = new Date().toISOString();
  const result = await env.db.runTransaction(async (tx) => {
    const profile = await tx.get<ProfileDoc>(profilePath(familyId, profileId));
    if (!profile || profile.deletedAt) return { ok: false as const };
    const family = await tx.get<FamilyDoc>(familyPath(familyId));
    tx.set(profilePath(familyId, profileId), { ...profile, deletedAt: now });
    if (family) tx.set(familyPath(familyId), { ...family, profileCount: Math.max(0, family.profileCount - 1), updatedAt: now });
    return { ok: true as const };
  });

  if (!result.ok) return new Response('not found', { status: 404 });
  return new Response(null, { status: 204 });
}

