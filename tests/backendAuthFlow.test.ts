/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleAuthRequest } from '../backend/src/handlers/authRequest';
import { handleAuthVerify } from '../backend/src/handlers/authVerify';
import type { Env } from '../backend/src/types';
import type { LoginCodeDoc } from '../backend/src/schema';
import { entitlementPath, familyPath, loginCodePath, trialPath } from '../backend/src/schema';
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

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://backend.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
    body: JSON.stringify(body),
  });
}

async function seedEntitledFamily(env: Env, email: string): Promise<string> {
  const familyId = 'f-seed';
  const now = new Date();
  const nowIso = now.toISOString();
  await env.db.set(familyPath(familyId), {
    email, status: 'active', profileCount: 0, createdAt: nowIso, updatedAt: nowIso,
  });
  await env.db.set(`emailIndex/${await emailHashOf(email)}`, { familyId, createdAt: nowIso });
  await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: 'o1', grantedAt: nowIso, revokedAt: null, revokedReason: null });
  return familyId;
}

async function issuedCode(env: Env, email: string): Promise<string> {
  await handleAuthRequest(jsonRequest('/api/v1/auth/request', { email }), env);
  const doc = await env.db.get<LoginCodeDoc>(loginCodePath(await emailHashOf(email)));
  // Recover the plaintext code the only way a test legitimately can: re-derive by trying every
  // digit combination is absurd, so this helper instead reaches past the HMAC by asking the
  // email sender what it actually sent (FakeEmailSender records every message verbatim). `.at(-1)`
  // (not `.find`) because a test calling this twice for the same email (a resend, or a second
  // login) must get the LATEST code, not the first one ever sent to that address.
  const sent = (env.email as FakeEmailSender).sent.filter((m) => m.to === email).at(-1);
  const match = sent?.text.match(/(\d{6})/);
  expect(doc).not.toBeNull();
  expect(match).not.toBeNull();
  return match![1]!;
}

describe('AD-13 acceptance 5 — code lifecycle: correct code, 5 wrong attempts, expiry, resend cooldown', () => {
  it('a correct code logs in', async () => {
    const env = fakeEnv();
    await seedEntitledFamily(env, 'parent@example.com');
    const code = await issuedCode(env, 'parent@example.com');
    const res = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'parent@example.com', code }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('__Host-nz_session=');
  });

  it('5 wrong attempts kill the code outright — a 6th attempt with the RIGHT code still fails', async () => {
    const env = fakeEnv();
    await seedEntitledFamily(env, 'parent@example.com');
    const code = await issuedCode(env, 'parent@example.com');
    for (let i = 0; i < 5; i++) {
      const res = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'parent@example.com', code: '000000' }), env);
      expect(res.status).toBe(401);
    }
    const finalRes = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'parent@example.com', code }), env);
    expect(finalRes.status).toBe(401);
    expect((await finalRes.json()).error).toBe('locked');
  });

  it('an expired code is rejected', async () => {
    const env = fakeEnv();
    await seedEntitledFamily(env, 'parent@example.com');
    const code = await issuedCode(env, 'parent@example.com');
    const emailHash = await emailHashOf('parent@example.com');
    const doc = await env.db.get<LoginCodeDoc>(loginCodePath(emailHash));
    await env.db.set(loginCodePath(emailHash), { ...doc!, expiresAt: new Date(Date.now() - 1000).toISOString() });
    const res = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'parent@example.com', code }), env);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('expired');
  });

  it('a resend within 60 seconds is refused (silently, from the caller\'s point of view — always 200)', async () => {
    const env = fakeEnv();
    await seedEntitledFamily(env, 'parent@example.com');
    await handleAuthRequest(jsonRequest('/api/v1/auth/request', { email: 'parent@example.com' }), env);
    const firstCount = (env.email as FakeEmailSender).sent.length;
    await handleAuthRequest(jsonRequest('/api/v1/auth/request', { email: 'parent@example.com' }), env);
    expect((env.email as FakeEmailSender).sent.length).toBe(firstCount); // no second email sent
  });
});

describe('AD-13 acceptance 6 — no enumeration', () => {
  it('an unknown email gets the identical HTTP response as a known one', async () => {
    const env = fakeEnv();
    await seedEntitledFamily(env, 'known@example.com');
    const knownRes = await handleAuthRequest(jsonRequest('/api/v1/auth/request', { email: 'known@example.com' }), env);
    const unknownRes = await handleAuthRequest(jsonRequest('/api/v1/auth/request', { email: 'unknown@example.com' }), env);
    expect(knownRes.status).toBe(unknownRes.status);
    expect(await knownRes.json()).toEqual(await unknownRes.json());
  });
});

describe('AD-15 — account-first trial (account creation, not gated by any prior purchase)', () => {
  it('a brand-new email gets a REAL login code (never "no purchase found") — anyone can start a trial', async () => {
    const env = fakeEnv();
    const code = await issuedCode(env, 'newcomer@example.com');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('the first successful verify for a brand-new email creates its family, with no trial history yet (nothing has opened a unit)', async () => {
    const env = fakeEnv();
    const code = await issuedCode(env, 'newcomer@example.com');
    const res = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'newcomer@example.com', code }), env);
    expect(res.status).toBe(200);
    const me = await res.json();
    expect(me.familyId).toBeTruthy();
    expect(me.trials).toEqual([]); // AD-16 §0/§5/§6: trial starts lazily at first unit open, never at login
  });

  it('a second login (still unpurchased) reuses the SAME family', async () => {
    const env = fakeEnv();
    const code1 = await issuedCode(env, 'newcomer@example.com');
    const first = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'newcomer@example.com', code: code1 }), env);
    const firstMe = await first.json();

    const code2 = await issuedCode(env, 'newcomer@example.com');
    const second = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'newcomer@example.com', code: code2 }), env);
    const secondMe = await second.json();

    expect(secondMe.familyId).toBe(firstMe.familyId);
  });
});

describe('AD-16 §0 — login/session are NEVER gated by trial or entitlement state (bug fix)', () => {
  it('a family whose only module trial has already expired still logs in, and /me still returns its profiles/entitlements', async () => {
    const env = fakeEnv();
    const code1 = await issuedCode(env, 'trial-over@example.com');
    const first = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'trial-over@example.com', code: code1 }), env);
    const familyId = (await first.json()).familyId as string;

    // Simulate the module's own 72-hour trial clock having elapsed, with no purchase.
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
      convertedAt: null, convertedOrderId: null,
    });

    const code2 = await issuedCode(env, 'trial-over@example.com');
    const second = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'trial-over@example.com', code: code2 }), env);
    expect(second.status).toBe(200);
    const me = await second.json();
    expect(me.familyId).toBe(familyId);
    expect(me.trials).toEqual([{ moduleId: 'm1', state: 'expired', endsAt: expect.any(String) }]);
  });

  it('a refunded family still logs in normally — only the entitled module itself is locked, never the account', async () => {
    const env = fakeEnv();
    const familyId = await seedEntitledFamily(env, 'refunded@example.com');
    await env.db.set(entitlementPath(familyId, 'm1'), {
      status: 'revoked', shopifyOrderId: 'o1', grantedAt: new Date().toISOString(), revokedAt: new Date().toISOString(), revokedReason: 'refund',
    });
    const code = await issuedCode(env, 'refunded@example.com');
    const res = await handleAuthVerify(jsonRequest('/api/v1/auth/verify', { email: 'refunded@example.com', code }), env);
    expect(res.status).toBe(200);
    const me = await res.json();
    expect(me.entitlements).toEqual([{ moduleId: 'm1', status: 'revoked' }]);
  });
});

describe('AD-13 acceptance 17 — CSRF', () => {
  it('a request from a foreign Origin is refused', async () => {
    const env = fakeEnv();
    const res = await handleAuthRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
        body: JSON.stringify({ email: 'parent@example.com' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('a non-JSON content type is refused even from the right origin', async () => {
    const env = fakeEnv();
    const res = await handleAuthRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', origin: 'https://app.example.com' },
        body: 'email=parent@example.com',
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
