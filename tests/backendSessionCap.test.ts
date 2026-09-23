/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { createSession, listActiveSessions, resolveSession, SESSION_COOKIE_NAME, serializeSessionCookie } from '../backend/src/session';
import type { Env } from '../backend/src/types';
import { familyPath } from '../backend/src/schema';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';

function fakeEnv(): Env {
  return {
    db: new MemoryDb(),
    email: new FakeEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: 'test-webhook',
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
  };
}

describe('AD-13 acceptance 7 — a 6th device evicts the least-recently-used session', () => {
  it('caps active sessions at 5; the 6th login revokes the LRU one and reports it to the caller', async () => {
    const env = fakeEnv();
    const familyId = 'f1';
    const now = new Date().toISOString();
    await env.db.set(familyPath(familyId), { email: 'parent@example.com', status: 'active', profileCount: 0, createdAt: now, updatedAt: now });

    const sessions = [];
    for (let i = 0; i < 5; i++) {
      sessions.push(await createSession(env, familyId, `device-${i}`));
      // Distinct lastSeenAt ordering — real logins are never in the exact same millisecond either.
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(sessions.every((s) => !s.evicted)).toBe(true);
    expect(await listActiveSessions(env, familyId)).toHaveLength(5);

    const sixth = await createSession(env, familyId, 'device-5');
    expect(sixth.evicted?.session.label).toBe('device-0'); // the very first (least-recently-used)
    expect(await listActiveSessions(env, familyId)).toHaveLength(5); // still capped at 5
  });
});

describe('AD-13 acceptance 8 — the session cookie is first-party-safe', () => {
  it('carries __Host- prefix, HttpOnly, Secure, SameSite=Lax, Path=/', () => {
    const cookie = serializeSessionCookie('some-token', 31536000);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=some-token`);
    expect(SESSION_COOKIE_NAME.startsWith('__Host-')).toBe(true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('a session survives being read back purely from the Cookie header a browser would send', async () => {
    const env = fakeEnv();
    const now = new Date().toISOString();
    await env.db.set(familyPath('f1'), { email: 'parent@example.com', status: 'active', profileCount: 0, createdAt: now, updatedAt: now });
    const created = await createSession(env, 'f1', 'iPad · Safari');
    const request = new Request('https://api.example.com/api/v1/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${created.token}` },
    });
    const resolved = await resolveSession(env, request);
    expect(resolved?.session.familyId).toBe('f1');
  });
});
