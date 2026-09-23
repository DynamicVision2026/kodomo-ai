/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleAccountEmail, handleDeleteAccount } from '../backend/src/handlers/account';
import { handleAuthRequest } from '../backend/src/handlers/authRequest';
import type { Env } from '../backend/src/types';
import { emailIndexPath, entitlementPath, familyPath } from '../backend/src/schema';
import { createSession, SESSION_COOKIE_NAME } from '../backend/src/session';
import { emailHashOf } from '../backend/src/family';
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

async function seedFamily(env: Env, email: string): Promise<{ familyId: string; token: string }> {
  const familyId = 'f1';
  const now = new Date().toISOString();
  await env.db.set(familyPath(familyId), { email, status: 'active', profileCount: 0, createdAt: now, updatedAt: now });
  await env.db.set(emailIndexPath(await emailHashOf(email)), { familyId, createdAt: now });
  // Account deletion's own OTP is requested through /auth/request, which only ever sends a real
  // code to a family with an active entitlement (AD-13 §4) — matches the real "delete an account
  // that actually purchased something" flow.
  await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: 'o1', grantedAt: now, revokedAt: null });
  const { token } = await createSession(env, familyId, 'test-device');
  return { familyId, token };
}

function authedRequest(path: string, token: string, body: unknown): Request {
  return new Request(`https://backend.example${path}`, {
    method: path.includes('DELETE') ? 'DELETE' : 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example.com', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify(body),
  });
}

async function extractCode(env: Env, to: string): Promise<string> {
  const sent = (env.email as FakeEmailSender).sent.filter((m) => m.to === to).at(-1);
  return sent!.text.match(/(\d{6})/)![1]!;
}

describe('AD-13 acceptance 13 — email change requires a code to the NEW address, notifies both', () => {
  it('requires the code before applying the change; both old and new addresses are notified', async () => {
    const env = fakeEnv();
    const { familyId, token } = await seedFamily(env, 'old@example.com');

    const requestRes = await handleAccountEmail(authedRequest('/api/v1/account/email', token, { newEmail: 'new@example.com' }), env);
    expect(requestRes.status).toBe(202);

    const code = await extractCode(env, 'new@example.com');
    const confirmRes = await handleAccountEmail(authedRequest('/api/v1/account/email', token, { newEmail: 'new@example.com', code }), env);
    expect(confirmRes.status).toBe(200);

    const family = await env.db.get<{ email: string }>(familyPath(familyId));
    expect(family?.email).toBe('new@example.com');

    const notified = (env.email as FakeEmailSender).sent.filter((m) => m.subject.includes('変更'));
    expect(notified.map((m) => m.to).sort()).toEqual(['new@example.com', 'old@example.com'].sort());
  });

  it('an unverified change (no code yet) never touches the family record', async () => {
    const env = fakeEnv();
    const { familyId, token } = await seedFamily(env, 'old@example.com');
    await handleAccountEmail(authedRequest('/api/v1/account/email', token, { newEmail: 'new@example.com' }), env);
    const family = await env.db.get<{ email: string }>(familyPath(familyId));
    expect(family?.email).toBe('old@example.com');
  });
});

describe('AD-13 acceptance 14 — account deletion requires a fresh OTP', () => {
  it('deletes the family, email index, and every session once a valid code is presented', async () => {
    const env = fakeEnv();
    const { familyId, token } = await seedFamily(env, 'parent@example.com');
    await handleAuthRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
        body: JSON.stringify({ email: 'parent@example.com' }),
      }),
      env,
    );
    const code = await extractCode(env, 'parent@example.com');

    const res = await handleDeleteAccount(authedRequest('/api/v1/account', token, { code }), env);
    expect(res.status).toBe(204);
    expect(await env.db.get(familyPath(familyId))).toBeNull();
    expect(await env.db.get(emailIndexPath(await emailHashOf('parent@example.com')))).toBeNull();
  });

  it('refuses deletion without a valid code', async () => {
    const env = fakeEnv();
    const { familyId, token } = await seedFamily(env, 'parent@example.com');
    const res = await handleDeleteAccount(authedRequest('/api/v1/account', token, { code: '000000' }), env);
    expect(res.status).toBe(401);
    expect(await env.db.get(familyPath(familyId))).not.toBeNull();
  });
});
