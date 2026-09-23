/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleGetProgress, handlePutProgress } from '../backend/src/handlers/progress';
import type { Env } from '../backend/src/types';
import { entitlementPath, familyPath } from '../backend/src/schema';
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

async function seedFamilyAndProfile(env: Env, entitled: boolean): Promise<{ token: string; profileId: string }> {
  const familyId = 'f1';
  const now = new Date().toISOString();
  await env.db.set(familyPath(familyId), {
    email: 'parent@example.com', status: 'active', profileCount: 1, createdAt: now, updatedAt: now,
  });
  if (entitled) {
    await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: 'o1', grantedAt: now, revokedAt: null, revokedReason: null });
  }
  const profileId = 'p1';
  await env.db.set(`families/${familyId}/profiles/${profileId}`, {
    avatarId: 'a1', nicknameId: 'n1', stage: 2, settingsUpdatedAt: now, createdAt: now, deletedAt: null,
  });
  const { token } = await createSession(env, familyId, 'test-device');
  return { token, profileId };
}

function authedRequest(path: string, token: string, body: ModuleProgressState): Request {
  return new Request(`https://backend.example${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://app.example.com', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify(body),
  });
}

describe('AD-15 — server-authoritative access gate / server-side progress-write enforcement', () => {
  it('an UNENTITLED family cannot write completion for a paid mission, even by asking directly', async () => {
    const env = fakeEnv();
    const { token, profileId } = await seedFamilyAndProfile(env, false);

    const forged: ModuleProgressState = {
      ...emptyModuleProgress(),
      missions: {
        'm1-s2-1-1': { done: true, stamps: 1, coop: false }, // free — allowed
        'm1-s2-1-2': { done: true, stamps: 1, coop: false }, // paid, Story 2 — must be dropped
      },
    };
    const res = await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, forged), env, profileId, 'm1');
    const merged = await res.json();
    expect(merged.missions['m1-s2-1-1']).toBeTruthy(); // free mission still synced
    expect(merged.missions['m1-s2-1-2']).toBeUndefined(); // paid mission claim silently dropped

    const getRes = await handleGetProgress(
      new Request(`https://backend.example/api/v1/profiles/${profileId}/progress/m1`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } }),
      env, profileId, 'm1',
    );
    expect((await getRes.json()).missions['m1-s2-1-2']).toBeUndefined(); // and never persisted either
  });

  it('an ENTITLED family can write completion for any mission in that module', async () => {
    const env = fakeEnv();
    const { token, profileId } = await seedFamilyAndProfile(env, true);

    const state: ModuleProgressState = {
      ...emptyModuleProgress(),
      missions: { 'm1-s2-1-2': { done: true, stamps: 1, coop: false } },
    };
    const res = await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, state), env, profileId, 'm1');
    const merged = await res.json();
    expect(merged.missions['m1-s2-1-2'].done).toBe(true);
  });

  it('a purchase mid-session immediately unlocks writes for previously-dropped missions — no re-import needed', async () => {
    const env = fakeEnv();
    const { token, profileId } = await seedFamilyAndProfile(env, false);

    const forged: ModuleProgressState = { ...emptyModuleProgress(), missions: { 'm1-s2-1-2': { done: true, stamps: 1, coop: false } } };
    await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, forged), env, profileId, 'm1');

    await env.db.set(entitlementPath('f1', 'm1'), { status: 'active', shopifyOrderId: 'o1', grantedAt: new Date().toISOString(), revokedAt: null, revokedReason: null });

    const res = await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, forged), env, profileId, 'm1');
    expect((await res.json()).missions['m1-s2-1-2'].done).toBe(true);
  });

  it('engine-wide evidence (moveProgress/milestones/guidance) is never gated by module entitlement', async () => {
    const env = fakeEnv();
    const { token, profileId } = await seedFamilyAndProfile(env, false);

    const state: ModuleProgressState = {
      ...emptyModuleProgress(),
      guidance: { yomu: 2 },
      milestones: { M0: { achieved: true, achievedAt: 123 } },
    };
    const res = await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, state), env, profileId, 'm1');
    const merged = await res.json();
    expect(merged.guidance.yomu).toBe(2);
    expect(merged.milestones.M0.achieved).toBe(true);
  });
});
