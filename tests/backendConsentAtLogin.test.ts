/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import { handleAuthRequest } from '../backend/src/handlers/authRequest';
import { handleAuthVerify } from '../backend/src/handlers/authVerify';
import { handleMe } from '../backend/src/handlers/me';
import { handleShopifyOrderWebhook } from '../backend/src/handlers/webhook';
import { sendEmailWithConsent } from '../backend/src/emailGate';
import { moduleActivatedEmail } from '../backend/src/email';
import type { Env } from '../backend/src/types';
import type { FamilyDoc, OrderDoc, EntitlementDoc, ClaimDoc } from '../backend/src/schema';
import { entitlementPath, familyPath, orderPath } from '../backend/src/schema';
import { emailHashOf } from '../backend/src/family';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';

const WEBHOOK_SECRET = 'test-webhook';

function fakeEnv(): Env {
  return {
    db: new MemoryDb(),
    email: new FakeEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
    APP_ORIGIN: 'https://app.example.com',
  };
}

const sent = (env: Env) => (env.email as FakeEmailSender).sent;

function post(path: string, body: unknown, cookie?: string): Request {
  return new Request(`https://backend.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example.com', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function requestCode(env: Env, email: string, consentTextVersion?: string): Promise<Response> {
  return handleAuthRequest(post('/api/v1/auth/request', { email, ...(consentTextVersion ? { consentTextVersion } : {}) }), env);
}

function lastCode(env: Env, email: string): string {
  const m = sent(env).filter((x) => x.to === email).at(-1)?.text.match(/(\d{6})/);
  return m![1]!;
}

async function login(env: Env, email: string, consent = true): Promise<{ res: Response; cookie: string }> {
  await requestCode(env, email, consent ? CONSENT_TEXT_VERSION : undefined);
  const res = await handleAuthVerify(post('/api/v1/auth/verify', { email, code: lastCode(env, email) }), env);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  return { res, cookie };
}

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function postOrder(env: Env, email: string, id = 7001): Promise<void> {
  const raw = JSON.stringify({
    id, name: `#${id}`, email, currency: 'JPY', financial_status: 'paid', created_at: '2026-01-01T00:00:00.000Z',
    line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 1, variant_id: 111, price: '9800' }],
  });
  await handleShopifyOrderWebhook(
    new Request('https://backend.example/webhooks/shopify/orders-paid', { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': await sign(raw) }, body: raw }),
    env,
  );
}

async function familyByEmail(env: Env, email: string): Promise<{ id: string; doc: FamilyDoc } | null> {
  const index = await env.db.get<{ familyId: string }>(`emailIndex/${await emailHashOf(email)}`);
  if (!index) return null;
  const doc = await env.db.get<FamilyDoc>(familyPath(index.familyId));
  return doc ? { id: index.familyId, doc } : null;
}

describe('consent at login — the login code', () => {
  it('a brand-new address WITHOUT consent in the request gets no code and no email, with the same 200', async () => {
    const env = fakeEnv();
    const res = await requestCode(env, 'new@example.com');
    expect(res.status).toBe(200);
    expect(sent(env)).toHaveLength(0);
  });

  it('a request carrying a STALE/unknown consent version is treated as no consent', async () => {
    const env = fakeEnv();
    await requestCode(env, 'new@example.com', 'v0-old-text');
    expect(sent(env)).toHaveLength(0);
  });

  it('a request carrying the current consent version sends the code, and verify stores consent time + text version on the new family', async () => {
    const env = fakeEnv();
    const before = Date.now();
    const { res } = await login(env, 'new@example.com');
    expect(res.status).toBe(200);
    const family = await familyByEmail(env, 'new@example.com');
    expect(family?.doc.consentTextVersion).toBe(CONSENT_TEXT_VERSION);
    expect(new Date(family!.doc.consentAt!).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('a family with recorded consent can request a new code without re-sending consent (e.g. the account-deletion re-auth)', async () => {
    const env = fakeEnv();
    await login(env, 'known@example.com');
    const countBefore = sent(env).length;
    // 60s resend cooldown: wipe the code doc so the second request isn't rate limited.
    await env.db.delete(`loginCodes/${await emailHashOf('known@example.com')}`);
    await requestCode(env, 'known@example.com');
    expect(sent(env)).toHaveLength(countBefore + 1);
  });

  it('an existing family with NO recorded consent (pre-feature) records it on its next consenting login, and /me reports it', async () => {
    const env = fakeEnv();
    const now = new Date().toISOString();
    await env.db.set(familyPath('legacy'), { email: 'legacy@example.com', status: 'active', profileCount: 0, createdAt: now, updatedAt: now } satisfies FamilyDoc);
    await env.db.set(`emailIndex/${await emailHashOf('legacy@example.com')}`, { familyId: 'legacy', createdAt: now });

    await requestCode(env, 'legacy@example.com'); // no consent, none on record
    expect(sent(env)).toHaveLength(0);

    const { cookie } = await login(env, 'legacy@example.com');
    expect((await env.db.get<FamilyDoc>(familyPath('legacy')))?.consentTextVersion).toBe(CONSENT_TEXT_VERSION);
    const me = await handleMe(new Request('https://backend.example/api/v1/me', { headers: { cookie } }), env);
    expect((await me.json()).consentRecorded).toBe(true);
  });
});

describe('consent at login — no email to any address without recorded consent', () => {
  it('the gate blocks moduleActivatedEmail to an address with no family, and to a family without consent', async () => {
    const env = fakeEnv();
    const msg = moduleActivatedEmail('nobody@example.com', 'https://app.example.com/login/', false);
    expect(await sendEmailWithConsent(env, msg)).toBe('blocked_no_consent');

    const now = new Date().toISOString();
    await env.db.set(familyPath('nc'), { email: 'nc@example.com', status: 'active', profileCount: 0, createdAt: now, updatedAt: now } satisfies FamilyDoc);
    await env.db.set(`emailIndex/${await emailHashOf('nc@example.com')}`, { familyId: 'nc', createdAt: now });
    expect(await sendEmailWithConsent(env, moduleActivatedEmail('nc@example.com', 'x', false))).toBe('blocked_no_consent');
    expect(sent(env)).toHaveLength(0);
  });

  it('a paid order whose purchaser email has no consenting family is held awaiting_claim and NO claim link is emailed', async () => {
    const env = fakeEnv();
    await postOrder(env, 'buyer@example.com');
    const order = await env.db.get<OrderDoc>(orderPath(7001));
    expect(order?.bindingState).toBe('awaiting_claim');
    expect(sent(env)).toHaveLength(0);
  });

  it('a paid order for a consenting family still binds and sends the module-activated email', async () => {
    const env = fakeEnv();
    await login(env, 'buyer@example.com');
    const codesSent = sent(env).length;
    await postOrder(env, 'buyer@example.com');
    expect((await env.db.get<OrderDoc>(orderPath(7001)))?.bindingState).toBe('bound');
    expect(sent(env)).toHaveLength(codesSent + 1);
  });

  it('NO file under backend/ calls env.email.send directly — every send goes through sendEmailWithConsent', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(name)) continue;
        if (full.endsWith(join('src', 'emailGate.ts'))) continue;
        if (/env\.email\.send\(/.test(readFileSync(full, 'utf8'))) offenders.push(full);
      }
    };
    walk('backend');
    expect(offenders).toEqual([]);
  });
});

describe('consent at login — bind unbound paid orders on login when the email matches', () => {
  it('an order that arrived BEFORE the buyer ever logged in is bound (entitlement granted) by their first consenting login, and the activation email follows', async () => {
    const env = fakeEnv();
    await postOrder(env, 'late@example.com');
    expect((await env.db.get<OrderDoc>(orderPath(7001)))?.bindingState).toBe('awaiting_claim');
    expect(sent(env)).toHaveLength(0);

    const { cookie } = await login(env, 'late@example.com');
    const family = await familyByEmail(env, 'late@example.com');
    const order = await env.db.get<OrderDoc>(orderPath(7001));
    expect(order?.bindingState).toBe('bound');
    expect(order?.bindingMethod).toBe('email_match');
    expect(order?.familyId).toBe(family!.id);
    expect((await env.db.get<EntitlementDoc>(entitlementPath(family!.id, 'm1')))?.status).toBe('active');

    const me = await handleMe(new Request('https://backend.example/api/v1/me', { headers: { cookie } }), env);
    expect((await me.json()).entitlements).toEqual([expect.objectContaining({ moduleId: 'm1', status: 'active' })]);

    const toLate = sent(env).filter((m) => m.to === 'late@example.com');
    expect(toLate).toHaveLength(2); // the login code + the activation email, nothing else
    expect(toLate[1]!.subject).not.toMatch(/\d{6}/);

    const claims = await env.db.query<ClaimDoc>('claims', 'orderId', '7001');
    expect(claims.every((c) => c.data.redeemedAt && c.data.familyId === family!.id)).toBe(true);
  });

  it('a login under a DIFFERENT email never binds someone else\'s waiting order', async () => {
    const env = fakeEnv();
    await postOrder(env, 'buyer@example.com');
    await login(env, 'someoneelse@example.com');
    expect((await env.db.get<OrderDoc>(orderPath(7001)))?.bindingState).toBe('awaiting_claim');
  });

  it('logging in again does not re-bind or re-email (idempotent)', async () => {
    const env = fakeEnv();
    await postOrder(env, 'late@example.com');
    await login(env, 'late@example.com');
    const after = sent(env).length;
    await env.db.delete(`loginCodes/${await emailHashOf('late@example.com')}`);
    await login(env, 'late@example.com');
    expect(sent(env).length).toBe(after + 1); // only the new login code
  });
});
