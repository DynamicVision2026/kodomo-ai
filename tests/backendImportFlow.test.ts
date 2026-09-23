/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleImport } from '../backend/src/handlers/importHandler';
import { handleGetProgress } from '../backend/src/handlers/progress';
import type { Env } from '../backend/src/types';
import { familyPath } from '../backend/src/schema';
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

async function seedFamily(env: Env): Promise<string> {
  const now = new Date().toISOString();
  await env.db.set(familyPath('f1'), { email: 'parent@example.com', status: 'active', profileCount: 0, createdAt: now, updatedAt: now });
  const { token } = await createSession(env, 'f1', 'test-device');
  return token;
}

function importRequest(token: string, body: unknown): Request {
  return new Request('https://backend.example/api/v1/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example.com', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify(body),
  });
}

const guestProgress: ModuleProgressState = { ...emptyModuleProgress(), missions: { 'm1-s2-1-1': { done: true, stamps: 2, coop: false } } };

describe('AD-13 acceptance 12 — guest 1-1 import', () => {
  it('a guest profile becomes a real family profile carrying its progress', async () => {
    const env = fakeEnv();
    const token = await seedFamily(env);
    const res = await handleImport(importRequest(token, {
      importId: 'guest-profile-1',
      moduleId: 'm1',
      guestProfile: { avatarId: 'a1', nicknameId: 'n1', stage: 2 },
      progress: guestProgress,
    }), env);
    expect(res.status).toBe(200);
    const { profileId } = await res.json();

    const progressRes = await handleGetProgress(
      new Request(`https://backend.example/api/v1/profiles/${profileId}/progress/m1`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } }),
      env, profileId, 'm1',
    );
    expect((await progressRes.json()).missions['m1-s2-1-1'].done).toBe(true);
  });

  it('the import repeated (same importId) is a no-op, never a duplicate profile', async () => {
    const env = fakeEnv();
    const token = await seedFamily(env);
    const first = await handleImport(importRequest(token, {
      importId: 'guest-profile-1', moduleId: 'm1',
      guestProfile: { avatarId: 'a1', nicknameId: 'n1', stage: 2 }, progress: guestProgress,
    }), env);
    const second = await handleImport(importRequest(token, {
      importId: 'guest-profile-1', moduleId: 'm1',
      guestProfile: { avatarId: 'a1', nicknameId: 'n1', stage: 2 }, progress: guestProgress,
    }), env);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.profileId).toBe(firstBody.profileId);
    expect(secondBody.alreadyImported).toBe(true);
  });

  it('at 6 profiles, a targetProfileId merges into an existing profile instead of creating a 7th', async () => {
    const env = fakeEnv();
    const token = await seedFamily(env);
    // Fill the family to the cap with an existing profile we'll merge into.
    const { handleCreateProfile } = await import('../backend/src/handlers/profiles');
    let targetId = '';
    for (let i = 0; i < 6; i++) {
      const res = await handleCreateProfile(
        new Request('https://backend.example/api/v1/profiles', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'https://app.example.com', cookie: `${SESSION_COOKIE_NAME}=${token}` },
          body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }),
        }),
        env,
      );
      if (i === 0) targetId = (await res.json()).id;
    }

    const res = await handleImport(importRequest(token, {
      importId: 'guest-at-cap', moduleId: 'm1', targetProfileId: targetId, progress: guestProgress,
    }), env);
    expect(res.status).toBe(200);
    expect((await res.json()).profileId).toBe(targetId);

    const progressRes = await handleGetProgress(
      new Request(`https://backend.example/api/v1/profiles/${targetId}/progress/m1`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } }),
      env, targetId, 'm1',
    );
    expect((await progressRes.json()).missions['m1-s2-1-1'].done).toBe(true);
  });
});
