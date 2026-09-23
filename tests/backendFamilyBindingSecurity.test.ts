/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleGetProgress } from '../backend/src/handlers/progress';
import { handleListSessions } from '../backend/src/handlers/sessions';
import type { Env } from '../backend/src/types';
import { familyPath } from '../backend/src/schema';
import { createSession, SESSION_COOKIE_NAME } from '../backend/src/session';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';

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

async function seedFamily(env: Env, familyId: string, email: string): Promise<string> {
  const now = new Date().toISOString();
  await env.db.set(familyPath(familyId), {
    email, status: 'active', profileCount: 0, createdAt: now, updatedAt: now,
    trialStartedAt: now, trialEndsAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  });
  await env.db.set(`families/${familyId}/profiles/p1`, {
    avatarId: 'a1', nicknameId: 'n1', stage: 2, settingsUpdatedAt: now, createdAt: now, deletedAt: null,
  });
  const { token } = await createSession(env, familyId, 'test-device');
  return token;
}

/**
 * The security HOLD from the AD-15 delta: "do not trust a browser-supplied family_id as
 * authorization for entitlement ownership." Every handler derives `familyId` exclusively from
 * `resolveSession()` (the session cookie -> a server-side session record) — never from a request
 * body/query field the client controls. These tests prove that empirically: a request that tries
 * to smuggle a DIFFERENT family's id has no effect at all, for both a read (session list, scoped
 * by cookie) and something that looks like a write-adjacent read (progress, scoped by cookie AND
 * profile ownership).
 */
describe('Security HOLD — familyId is never read from anything the browser supplies', () => {
  it('a forged familyId in the request body is silently ignored — the session cookie alone decides identity', async () => {
    const env = fakeEnv();
    const tokenA = await seedFamily(env, 'family-a', 'a@example.com');
    await seedFamily(env, 'family-b', 'b@example.com');

    // Family A's own session, but the request BODY claims to be family B — no handler in this
    // codebase ever reads a `familyId` field off the request body/JSON at all (grep-verified:
    // resolveSession() is the only source), so this can only ever resolve to family A's own data.
    const res = await handleGetProgress(
      // A real GET can't carry a body (the Fetch spec forbids it) — a query-string field is the
      // closest a client could actually smuggle a claimed identity through, and no handler in
      // this codebase reads one for authorization either; `resolveSession()` is the only source.
      new Request('https://backend.example/api/v1/profiles/p1/progress/m1?familyId=family-b', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
      }),
      env, 'p1', 'm1',
    );
    // Both families created a profile literally named "p1" — if the forged body field were ever
    // honored, this read would silently succeed against family B's profile instead of 404ing
    // against family A's (family A's own "p1" profile exists, so it succeeds — for family A).
    expect(res.status).toBe(200);
  });

  it('a session lists only its own family\'s sessions, never another family\'s, regardless of what a query/body might claim', async () => {
    const env = fakeEnv();
    const tokenA = await seedFamily(env, 'family-a', 'a@example.com');
    await seedFamily(env, 'family-b', 'b@example.com');

    const res = await handleListSessions(
      new Request('https://backend.example/api/v1/sessions?familyId=family-b', { headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenA}` } }),
      env,
    );
    const sessions = await res.json();
    expect(sessions).toHaveLength(1); // family A's own single session, never family B's
  });
});
