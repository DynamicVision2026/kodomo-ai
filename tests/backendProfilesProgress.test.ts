/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleCreateProfile } from '../backend/src/handlers/profiles';
import { handleGetProgress, handlePutProgress } from '../backend/src/handlers/progress';
import type { Env } from '../backend/src/types';
import { entitlementPath, familyPath, MAX_PROFILES } from '../backend/src/schema';
import { createSession, SESSION_COOKIE_NAME } from '../backend/src/session';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';
import { emptyModuleProgress, type ModuleProgressState } from '../shared/progressMerge';

function fakeEnv(): Env {
  return {
    db: new MemoryDb(),
    email: new FakeEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: 'test-webhook',
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
    APP_ORIGIN: 'https://app.example.com',
  };
}

async function seedFamily(env: Env): Promise<{ familyId: string; token: string }> {
  const familyId = 'f1';
  const now = new Date().toISOString();
  await env.db.set(familyPath(familyId), {
    email: 'parent@example.com', status: 'active', profileCount: 0, createdAt: now, updatedAt: now,
    trialStartedAt: now, trialEndsAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  });
  // AD-15's server-side progress-write enforcement (backend/src/handlers/progress.ts) only
  // accepts a non-free mission id when the module is actively entitled — this suite is about
  // profile/progress mechanics, not entitlement gating (tests/ad15ProgressWriteEnforcement.test.ts
  // covers that), so this family is a paying one throughout.
  await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: 'o1', grantedAt: now, revokedAt: null });
  const { token } = await createSession(env, familyId, 'test-device');
  return { familyId, token };
}

function authedRequest(path: string, token: string, init: RequestInit = {}): Request {
  return new Request(`https://backend.example${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example.com',
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(init.headers ?? {}),
    },
  });
}

describe('AD-13 acceptance 9 — profile cap and preset validation', () => {
  it('a 7th profile is refused', async () => {
    const env = fakeEnv();
    const { token } = await seedFamily(env);
    for (let i = 0; i < MAX_PROFILES; i++) {
      const res = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
      expect(res.status).toBe(201);
    }
    const res = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    expect(res.status).toBe(409);
  });

  it('an invalid avatar or nickname id is refused', async () => {
    const env = fakeEnv();
    const { token } = await seedFamily(env);
    const badAvatar = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'not-real', nicknameId: 'n1', stage: 2 }) }), env);
    expect(badAvatar.status).toBe(400);
    const badNickname = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'not-real', stage: 2 }) }), env);
    expect(badNickname.status).toBe(400);
  });
});

describe('AD-13 acceptance 10 — every profile and its progress is restored from the server', () => {
  it('GET progress returns exactly what was previously PUT (round-trips through the merge)', async () => {
    const env = fakeEnv();
    const { token } = await seedFamily(env);
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const progress: ModuleProgressState = { ...emptyModuleProgress(), missions: { 'm1-s2-1-1': { done: true, stamps: 3, coop: false } } };
    await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'PUT', body: JSON.stringify(progress) }), env, profileId, 'm1');

    const getRes = await handleGetProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'GET' }), env, profileId, 'm1');
    const body = await getRes.json();
    expect(body.missions['m1-s2-1-1']).toEqual({ done: true, stamps: 3, coop: false });
  });
});

describe('AD-13 acceptance 11 — two devices syncing concurrently union their progress, nothing lost or duplicated', () => {
  it('device A and device B each PUT their own evidence; the server holds the union of both', async () => {
    const env = fakeEnv();
    const { token } = await seedFamily(env);
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const deviceAProgress: ModuleProgressState = { ...emptyModuleProgress(), missions: { 'm1-s2-1-1': { done: true, stamps: 1, coop: false } } };
    const deviceBProgress: ModuleProgressState = { ...emptyModuleProgress(), missions: { 'm1-s2-1-2': { done: true, stamps: 2, coop: true } } };

    await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'PUT', body: JSON.stringify(deviceAProgress) }), env, profileId, 'm1');
    const secondRes = await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'PUT', body: JSON.stringify(deviceBProgress) }), env, profileId, 'm1');

    const merged = await secondRes.json();
    expect(merged.missions['m1-s2-1-1'].done).toBe(true); // device A's own evidence, still present
    expect(merged.missions['m1-s2-1-2'].done).toBe(true); // device B's own evidence, not overwritten
    expect(merged.rev).toBe(2);
  });
});
