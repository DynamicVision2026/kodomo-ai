/** @vitest-environment node */
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import { describe, it, expect } from 'vitest';
import { handleAccountEmail, handleDeleteAccount, handleRequestDeleteCode } from '../backend/src/handlers/account';
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
  await env.db.set(familyPath(familyId), { email, status: 'active', profileCount: 0, createdAt: now, updatedAt: now, consentAt: now, consentTextVersion: CONSENT_TEXT_VERSION });
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

  it('post-launch-check (Founder, iPhone test): a "change" to the SAME address is refused, sends no code and no notification', async () => {
    const env = fakeEnv();
    const { token } = await seedFamily(env, 'info@domo-ai.com');

    const res = await handleAccountEmail(
      authedRequest('/api/v1/account/email', token, { newEmail: 'info@domo-ai.com' }),
      env,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'same_email' });
    // No verification code sent (there would be a login-code email to the address), and
    // critically — the bug this reproduces — no "email changed" notification either.
    const emailSender = env.email as FakeEmailSender;
    expect(emailSender.sent).toHaveLength(0);
  });

  it('a same-address change is refused case/whitespace-insensitively too', async () => {
    const env = fakeEnv();
    const { token } = await seedFamily(env, 'info@domo-ai.com');

    const res = await handleAccountEmail(
      authedRequest('/api/v1/account/email', token, { newEmail: '  INFO@DOMO-AI.COM  ' }),
      env,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'same_email' });
    expect((env.email as FakeEmailSender).sent).toHaveLength(0);
  });
});

describe('AD-13 acceptance 14 — account deletion requires a fresh OTP', () => {
  it('deletes the family, email index, and every session once a valid code is presented', async () => {
    const env = fakeEnv();
    const { familyId, token } = await seedFamily(env, 'parent@example.com');
    const codeRes = await handleRequestDeleteCode(authedRequest('/api/v1/account/delete-code', token, {}), env);
    expect(codeRes.status).toBe(202);
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

  describe('delete-code bug fix (1 Oct 2026): sends to the family\'s own REAL stored email, never a client-supplied one', () => {
    it('requires an authenticated session', async () => {
      const env = fakeEnv();
      await seedFamily(env, 'parent@example.com');
      const res = await handleRequestDeleteCode(
        new Request('https://backend.example/api/v1/account/delete-code', {
          method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.example.com' }, body: '{}',
        }),
        env,
      );
      expect(res.status).toBe(401);
      expect((env.email as FakeEmailSender).sent).toHaveLength(0);
    });

    it('ignores anything the client sends in the body — the real address comes only from the session\'s own family record', async () => {
      const env = fakeEnv();
      const { token } = await seedFamily(env, 'parent@example.com');
      const res = await handleRequestDeleteCode(
        authedRequest('/api/v1/account/delete-code', token, { email: 'attacker@example.com' }),
        env,
      );
      expect(res.status).toBe(202);
      const sent = (env.email as FakeEmailSender).sent;
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe('parent@example.com'); // never the masked string the client would have, never attacker-supplied
    });
  });
});
