/** @vitest-environment node */
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../backend/src/types';
import type { EntitlementDoc, FamilyDoc, OrderDoc, SessionDoc, StaffDoc } from '../backend/src/schema';
import { auditLogCollection, emptyRefundInfo, entitlementPath, familyPath, orderPath, sessionPath, staffPath } from '../backend/src/schema';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';

// AD-16 §8: the admin API's only auth path is a verified IAP JWT + the `staff/` Firestore
// allowlist — never another auth scheme. `verifyIapJwt` itself is real ES256/JWK crypto (see
// backend/src/iap.ts) that this suite has no business re-testing; it stubs ONLY that boundary so
// these tests exercise the actual authorization/audit logic sitting behind it.
vi.mock('../backend/src/iap', () => ({
  verifyIapJwt: vi.fn(async (jwt: string) => {
    if (jwt === 'valid-jwt-for-operator@example.com') return { email: 'operator@example.com' };
    if (jwt === 'valid-jwt-for-viewer@example.com') return { email: 'viewer@example.com' };
    if (jwt === 'valid-jwt-for-unlisted@example.com') return { email: 'unlisted@example.com' };
    return null;
  }),
}));

const { handleAdminApi } = await import('../backend/src/adminRouter');

function fakeEnv(): Env {
  return {
    db: new MemoryDb(),
    email: new FakeEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: 'test-webhook',
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
    APP_ORIGIN: 'https://app.example.com',
    IAP_AUDIENCE: '/projects/123/apps/kodomo-ai-admin',
  };
}

function adminRequest(path: string, jwt: string | null, init: RequestInit = {}): { request: Request; url: URL } {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string> ?? {}) };
  if (jwt) headers['x-goog-iap-jwt-assertion'] = jwt;
  const request = new Request(`https://admin.example${path}`, { ...init, headers });
  return { request, url: new URL(request.url) };
}

async function seedStaff(env: Env, email: string, role: 'viewer' | 'operator'): Promise<void> {
  await env.db.set(staffPath(email), { role } satisfies StaffDoc);
}

async function seedFamily(env: Env, familyId: string, email: string): Promise<void> {
  const now = new Date().toISOString();
  await env.db.set(familyPath(familyId), { email, status: 'active', profileCount: 0, createdAt: now, updatedAt: now, consentClickedAt: now, consentVerifiedAt: now, consentVersion: CONSENT_TEXT_VERSION } satisfies FamilyDoc);
}

describe('AD-16 §8 — admin authentication: IAP JWT + staff/ allowlist, never another scheme', () => {
  it('no IAP JWT header at all is refused, even with IAP_AUDIENCE configured', async () => {
    const env = fakeEnv();
    const { request, url } = adminRequest('/admin-api/search?q=x', null);
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(401);
  });

  it('a JWT that fails IAP verification is refused', async () => {
    const env = fakeEnv();
    const { request, url } = adminRequest('/admin-api/search?q=x', 'garbage-not-a-real-jwt');
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(401);
  });

  it('a verified Google identity with NO staff/ allowlist entry is still refused — IAP alone is not enough', async () => {
    const env = fakeEnv();
    const { request, url } = adminRequest('/admin-api/search?q=x', 'valid-jwt-for-unlisted@example.com');
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(401);
  });

  it('IAP_AUDIENCE unset (IAP not yet enabled for this deployment) refuses everything, never falling back to any other auth', async () => {
    const env = fakeEnv();
    env.IAP_AUDIENCE = undefined;
    await seedStaff(env, 'operator@example.com', 'operator');
    const { request, url } = adminRequest('/admin-api/search?q=x', 'valid-jwt-for-operator@example.com');
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(401);
  });
});

describe('AD-16 §8 — GET /admin-api/me: the dashboard\'s own "who am I" check', () => {
  it('reports the verified email and allowlisted role, nothing else', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    const { request, url } = adminRequest('/admin-api/me', 'valid-jwt-for-operator@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'operator@example.com', role: 'operator' });
  });

  it('reports viewer role for a viewer, distinctly from operator', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    const { request, url } = adminRequest('/admin-api/me', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    expect((await res.json()).role).toBe('viewer');
  });
});

describe('AD-16 §8 — role-based authorization: viewer reads, only operator writes', () => {
  it('a viewer can read a family\'s detail page', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedFamily(env, 'fam-1', 'parent@example.com');
    const { request, url } = adminRequest('/admin-api/families/fam-1', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).not.toBe('parent@example.com'); // viewer sees the masked email, not the raw one
    expect(body.email).toMatch(/\*/);
  });

  it('a viewer is refused a mutating action (403), not silently downgraded to a no-op', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedFamily(env, 'fam-2', 'parent2@example.com');
    const { request, url } = adminRequest('/admin-api/families/fam-2/resend-welcome', 'valid-jwt-for-viewer@example.com', { method: 'POST' });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(403);
  });

  it('an operator sees the raw (unmasked) email on a family\'s detail page', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedFamily(env, 'fam-4', 'parent4@example.com');

    const { request, url } = adminRequest('/admin-api/families/fam-4', 'valid-jwt-for-operator@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body = await res.json();
    expect(body.email).toBe('parent4@example.com');
  });
});

describe('AD-16 §8 — audit log: append-only, every staff write requires a reason', () => {
  it('a staff write without a reason is refused before anything is written', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedFamily(env, 'fam-5', 'parent5@example.com');

    const { request, url } = adminRequest('/admin-api/families/fam-5/email', 'valid-jwt-for-operator@example.com', {
      method: 'POST', body: JSON.stringify({ newEmail: 'changed@example.com' }),
    });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(400);
    const family = await env.db.get<FamilyDoc>(familyPath('fam-5'));
    expect(family?.email).toBe('parent5@example.com'); // untouched
  });

  it('a reasoned staff write succeeds and appends exactly one audit entry carrying the reason', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedFamily(env, 'fam-6', 'parent6@example.com');

    const { request, url } = adminRequest('/admin-api/families/fam-6/email', 'valid-jwt-for-operator@example.com', {
      method: 'POST', body: JSON.stringify({ newEmail: 'changed6@example.com', reason: 'parent requested email change via support ticket #42' }),
    });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(200);

    const entries = await env.db.list(auditLogCollection());
    const relevant = entries.filter((e) => (e.data as { targetId: string }).targetId === 'fam-6');
    expect(relevant).toHaveLength(1);
    expect((relevant[0]!.data as { reason: string | null }).reason).toBe('parent requested email change via support ticket #42');
    expect((relevant[0]!.data as { actor: string }).actor).toBe('operator@example.com');
  });

  it('two sequential staff writes to the same family append TWO audit entries — no entry is ever mutated in place', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedFamily(env, 'fam-7', 'parent7@example.com');

    for (let i = 0; i < 2; i++) {
      const res = await handleAdminApi(
        new Request('https://admin.example/admin-api/families/fam-7/resend-welcome', {
          method: 'POST',
          headers: { 'x-goog-iap-jwt-assertion': 'valid-jwt-for-operator@example.com', 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'parent lost the original email' }),
        }),
        env,
        new URL('https://admin.example/admin-api/families/fam-7/resend-welcome'),
      );
      expect(res.status).toBe(202);
    }

    const entries = await env.db.list(auditLogCollection());
    const relevant = entries.filter((e) => (e.data as { targetId: string }).targetId === 'fam-7');
    expect(relevant).toHaveLength(2); // appended, never merged/overwritten
  });
});

describe('Work order — every one of the five operator actions requires a written reason (resend included)', () => {
  it('resend-welcome without a reason is refused, and sends no email', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedFamily(env, 'fam-8', 'parent8@example.com');

    const { request, url } = adminRequest('/admin-api/families/fam-8/resend-welcome', 'valid-jwt-for-operator@example.com', {
      method: 'POST', body: JSON.stringify({}),
    });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(400);
    expect((env.email as FakeEmailSender).sent).toHaveLength(0);
  });

  it('resend-claim without a reason is refused, and sends no email', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    const now = new Date().toISOString();
    await env.db.set(orderPath('order-8'), {
      shopifyOrderId: 'order-8', orderName: '#8', lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 }],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: now, paidAt: now, purchaserEmail: 'purchaser8@example.com',
      familyId: null, bindingMethod: null, bindingState: 'awaiting_claim', entitlementState: 'none', trialConverted: false,
      refund: emptyRefundInfo(), webhookIds: [], createdAt: now, updatedAt: now,
    } satisfies OrderDoc);

    const { request, url } = adminRequest('/admin-api/orders/order-8/resend-claim', 'valid-jwt-for-operator@example.com', {
      method: 'POST', body: JSON.stringify({}),
    });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(400);
    expect((env.email as FakeEmailSender).sent).toHaveLength(0);
  });

  it('resend-claim WITH a reason succeeds and the audit entry carries it', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    const now = new Date().toISOString();
    await env.db.set(orderPath('order-9'), {
      shopifyOrderId: 'order-9', orderName: '#9', lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 }],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: now, paidAt: now, purchaserEmail: 'purchaser9@example.com',
      familyId: null, bindingMethod: null, bindingState: 'awaiting_claim', entitlementState: 'none', trialConverted: false,
      refund: emptyRefundInfo(), webhookIds: [], createdAt: now, updatedAt: now,
    } satisfies OrderDoc);

    const { request, url } = adminRequest('/admin-api/orders/order-9/resend-claim', 'valid-jwt-for-operator@example.com', {
      method: 'POST', body: JSON.stringify({ reason: 'purchaser says the original claim email never arrived' }),
    });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ emailSent: false, reason: 'no_consent' }); // the operator is told
    // Consent at login: purchaser9@example.com has no family with recorded consent, so even an
    // operator-triggered claim email is blocked at the gate — never sent.
    expect((env.email as FakeEmailSender).sent).toHaveLength(0);

    const entries = await env.db.list(auditLogCollection());
    const relevant = entries.filter((e) => (e.data as { targetId: string }).targetId === 'order-9');
    expect(relevant).toHaveLength(1);
    expect((relevant[0]!.data as { reason: string }).reason).toBe('purchaser says the original claim email never arrived');
  });
});

describe('Work order — family page: entitlement granted date, and per-module firstPaidUseAt (yes/no, time, lesson)', () => {
  it('GET /families/{id} reports grantedAt on each entitlement and a family-level usage entry per module', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedFamily(env, 'fam-9', 'parent9@example.com');
    const grantedAt = '2026-09-24T00:00:00.000Z';
    await env.db.set(entitlementPath('fam-9', 'm1'), {
      status: 'active', shopifyOrderId: 'order-9', grantedAt, revokedAt: null, revokedReason: null,
    } satisfies EntitlementDoc);
    await env.db.set('families/fam-9/usage/m1', { firstPaidUseAt: '2026-09-25T00:00:00.000Z', firstPaidUnitId: 'm1-s2-1-2', firstPaidProfileId: 'p1' });

    const { request, url } = adminRequest('/admin-api/families/fam-9', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body = await res.json();

    expect(body.entitlements).toEqual([{ moduleId: 'm1', status: 'active', shopifyOrderId: 'order-9', grantedAt, revokedAt: null, revokedReason: null }]);
    expect(body.usage).toEqual([{ moduleId: 'm1', used: true, firstPaidUseAt: '2026-09-25T00:00:00.000Z', firstPaidUnitId: 'm1-s2-1-2' }]);
  });

  it('a module never opened for paid use reports used=false, not a missing entry', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedFamily(env, 'fam-10', 'parent10@example.com');
    await env.db.set(entitlementPath('fam-10', 'm1'), {
      status: 'active', shopifyOrderId: 'order-10', grantedAt: new Date().toISOString(), revokedAt: null, revokedReason: null,
    } satisfies EntitlementDoc);

    const { request, url } = adminRequest('/admin-api/families/fam-10', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body = await res.json();

    expect(body.usage).toEqual([{ moduleId: 'm1', used: false, firstPaidUseAt: null, firstPaidUnitId: null }]);
  });
});

describe('Work order — order page: amount total and a direct Shopify admin link', () => {
  it('GET /orders/{id} sums line totals into amountTotal and builds the Shopify admin URL from SHOPIFY_SHOP_DOMAIN', async () => {
    const env = fakeEnv();
    env.SHOPIFY_SHOP_DOMAIN = 'soul-id-2.myshopify.com';
    await seedStaff(env, 'viewer@example.com', 'viewer');
    const now = new Date().toISOString();
    await env.db.set(orderPath('7215074017528'), {
      shopifyOrderId: '7215074017528', orderName: '#1006',
      lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 }],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: now, paidAt: now, purchaserEmail: 'p@example.com',
      familyId: 'fam-1', bindingMethod: 'token', bindingState: 'bound', entitlementState: 'granted', trialConverted: false,
      refund: emptyRefundInfo(), webhookIds: [], createdAt: now, updatedAt: now,
    } satisfies OrderDoc);

    const { request, url } = adminRequest('/admin-api/orders/7215074017528', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body = await res.json();

    expect(body.amountTotal).toBe(4980);
    expect(body.shopifyAdminUrl).toBe('https://soul-id-2.myshopify.com/admin/orders/7215074017528');
  });

  it('shopifyAdminUrl is null, not a broken link, when SHOPIFY_SHOP_DOMAIN is unset', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    const now = new Date().toISOString();
    await env.db.set(orderPath('order-11'), {
      shopifyOrderId: 'order-11', orderName: '#11', lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 }],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: now, paidAt: now, purchaserEmail: 'p@example.com',
      familyId: null, bindingMethod: null, bindingState: 'needs_review', entitlementState: 'none', trialConverted: false,
      refund: emptyRefundInfo(), webhookIds: [], createdAt: now, updatedAt: now,
    } satisfies OrderDoc);

    const { request, url } = adminRequest('/admin-api/orders/order-11', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body = await res.json();

    expect(body.shopifyAdminUrl).toBeNull();
  });
});

describe('Work order (2 Oct 2026) — order page: "logged in since payment: yes or no, date"', () => {
  async function seedOrder(env: Env, shopifyOrderId: string, familyId: string | null, paidAt: string): Promise<void> {
    const now = new Date().toISOString();
    await env.db.set(orderPath(shopifyOrderId), {
      shopifyOrderId, orderName: `#${shopifyOrderId}`,
      lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 }],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: paidAt, paidAt, purchaserEmail: 'p@example.com',
      familyId, bindingMethod: familyId ? 'token' : null, bindingState: familyId ? 'bound' : 'needs_review',
      entitlementState: familyId ? 'granted' : 'none', trialConverted: false,
      refund: emptyRefundInfo(), webhookIds: [], createdAt: now, updatedAt: now,
    } satisfies OrderDoc);
  }

  async function seedSession(env: Env, id: string, familyId: string, createdAt: string): Promise<void> {
    await env.db.set(sessionPath(id), {
      familyId, label: 'device', createdAt, lastSeenAt: createdAt,
      expiresAt: new Date(Date.now() + 86400_000).toISOString(), revokedAt: null,
    } satisfies SessionDoc);
  }

  it('a family that logged in again after paidAt: yes, with the earliest such login\'s own timestamp', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedOrder(env, 'order-20', 'fam-20', '2026-09-01T00:00:00.000Z');
    // A login BEFORE payment (e.g. an earlier browse) must not count; the earliest login AFTER
    // payment is the one reported, even when a later login also exists.
    await seedSession(env, 's-before', 'fam-20', '2026-08-01T00:00:00.000Z');
    await seedSession(env, 's-after-later', 'fam-20', '2026-09-05T00:00:00.000Z');
    await seedSession(env, 's-after-earliest', 'fam-20', '2026-09-02T00:00:00.000Z');

    const { request, url } = adminRequest('/admin-api/orders/order-20', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const body = await (await handleAdminApi(request, env, url)).json();

    expect(body.loggedInSincePayment).toBe(true);
    expect(body.firstLoginSincePaymentAt).toBe('2026-09-02T00:00:00.000Z');
  });

  it('a family that has never logged in since paidAt (only a before-payment session, or none at all): no, with a null date', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedOrder(env, 'order-21', 'fam-21', '2026-09-01T00:00:00.000Z');
    await seedSession(env, 's-only-before', 'fam-21', '2026-08-01T00:00:00.000Z');

    const { request, url } = adminRequest('/admin-api/orders/order-21', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const body = await (await handleAdminApi(request, env, url)).json();

    expect(body.loggedInSincePayment).toBe(false);
    expect(body.firstLoginSincePaymentAt).toBeNull();
  });

  it('a revoked/expired session still counts as "yes, they logged in" — this is never an active-sessions-only check', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedOrder(env, 'order-22', 'fam-22', '2026-09-01T00:00:00.000Z');
    await env.db.set(sessionPath('s-revoked'), {
      familyId: 'fam-22', label: 'device', createdAt: '2026-09-03T00:00:00.000Z', lastSeenAt: '2026-09-03T00:00:00.000Z',
      expiresAt: new Date(Date.now() + 86400_000).toISOString(), revokedAt: '2026-09-04T00:00:00.000Z',
    } satisfies SessionDoc);

    const { request, url } = adminRequest('/admin-api/orders/order-22', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const body = await (await handleAdminApi(request, env, url)).json();

    expect(body.loggedInSincePayment).toBe(true);
  });

  it('an order with no bound family at all: no, with a null date — there is no family to check', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await seedOrder(env, 'order-23', null, '2026-09-01T00:00:00.000Z');

    const { request, url } = adminRequest('/admin-api/orders/order-23', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const body = await (await handleAdminApi(request, env, url)).json();

    expect(body.loggedInSincePayment).toBe(false);
    expect(body.firstLoginSincePaymentAt).toBeNull();
  });
});

describe('Work order — audit log: filterable by order, family, or staff', () => {
  it('GET /admin-api/audit?targetId= returns only entries for that family', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedFamily(env, 'fam-12', 'parent12@example.com');
    await seedFamily(env, 'fam-13', 'parent13@example.com');

    for (const familyId of ['fam-12', 'fam-13']) {
      const { request, url } = adminRequest(`/admin-api/families/${familyId}/resend-welcome`, 'valid-jwt-for-operator@example.com', {
        method: 'POST', body: JSON.stringify({ reason: 'test resend' }),
      });
      expect((await handleAdminApi(request, env, url)).status).toBe(202);
    }

    const { request, url } = adminRequest('/admin-api/audit?targetId=fam-12', 'valid-jwt-for-operator@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].targetId).toBe('fam-12');
  });

  it('GET /admin-api/audit?actor= returns every entry that staff member wrote, across different targets', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedStaff(env, 'other-operator@example.com', 'operator');
    await seedFamily(env, 'fam-14', 'parent14@example.com');
    await seedFamily(env, 'fam-15', 'parent15@example.com');

    const acts = [
      { jwt: 'valid-jwt-for-operator@example.com', familyId: 'fam-14' },
      { jwt: 'valid-jwt-for-operator@example.com', familyId: 'fam-15' },
    ];
    for (const { jwt, familyId } of acts) {
      const { request, url } = adminRequest(`/admin-api/families/${familyId}/resend-welcome`, jwt, {
        method: 'POST', body: JSON.stringify({ reason: 'test resend' }),
      });
      expect((await handleAdminApi(request, env, url)).status).toBe(202);
    }
    // A different staff member's action must not show up in operator@example.com's list.
    const other = adminRequest('/admin-api/families/fam-14/resend-welcome', 'valid-jwt-for-unlisted@example.com', {
      method: 'POST', body: JSON.stringify({ reason: 'should not count' }),
    });
    await seedStaff(env, 'unlisted@example.com', 'operator');
    expect((await handleAdminApi(other.request, env, other.url)).status).toBe(202);

    const { request, url } = adminRequest('/admin-api/audit?actor=operator@example.com', 'valid-jwt-for-operator@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.every((e: { actor: string }) => e.actor === 'operator@example.com')).toBe(true);
    expect(new Set(body.map((e: { targetId: string }) => e.targetId))).toEqual(new Set(['fam-14', 'fam-15']));
  });

  it('GET /admin-api/audit with neither targetId nor actor is refused', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    const { request, url } = adminRequest('/admin-api/audit', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    expect(res.status).toBe(400);
  });
});

describe('AD-16 §8 — the operator queues (equality-filtered, not a full-collection scan)', () => {
  function fakeOrder(overrides: Partial<OrderDoc>): OrderDoc {
    const now = new Date().toISOString();
    return {
      shopifyOrderId: '1', orderName: '#1', lines: [], currency: 'JPY', financialStatus: 'paid',
      shopifyCreatedAt: now, paidAt: now, purchaserEmail: null, familyId: null, bindingMethod: null,
      bindingState: 'needs_review', entitlementState: 'none', trialConverted: false, refund: emptyRefundInfo(),
      webhookIds: [], createdAt: now, updatedAt: now, ...overrides,
    };
  }

  it('the awaiting_claim queue returns only orders in that binding state', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await env.db.set(orderPath('101'), fakeOrder({ shopifyOrderId: '101', orderName: '#101', bindingState: 'awaiting_claim' }));
    await env.db.set(orderPath('102'), fakeOrder({ shopifyOrderId: '102', orderName: '#102', bindingState: 'bound' }));

    const { request, url } = adminRequest('/admin-api/queues/awaiting_claim', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body: OrderDoc[] = await res.json();
    expect(body.map((o) => o.shopifyOrderId)).toEqual(['101']);
  });

  it('the refund_requests queue filters on the NESTED refund.state field correctly', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'viewer@example.com', 'viewer');
    await env.db.set(orderPath('201'), fakeOrder({ shopifyOrderId: '201', orderName: '#201', refund: { ...emptyRefundInfo(), state: 'requested' } }));
    await env.db.set(orderPath('202'), fakeOrder({ shopifyOrderId: '202', orderName: '#202', refund: emptyRefundInfo() }));

    const { request, url } = adminRequest('/admin-api/queues/refund_requests', 'valid-jwt-for-viewer@example.com', { method: 'GET' });
    const res = await handleAdminApi(request, env, url);
    const body: OrderDoc[] = await res.json();
    expect(body.map((o) => o.shopifyOrderId)).toEqual(['201']);
  });
});

describe('AD-16 §8 — admin bind: reads-before-writes regression (production incident, 2026-09)', () => {
  /** A live `orders/paid` order for `kodomo-ai-m1` only ever has one line — this multi-line order
   *  is synthetic, standing in for the second module a real order would carry once one exists.
   *  Admin-bind's own transaction reads each line's entitlement in a loop, exactly like the
   *  webhook's own orders/paid transaction did — a single-line order can never exercise the
   *  "read module 2 AFTER module 1's write" ordering bug, only a multi-line one can. */
  it('binds a multi-line order without hitting "Firestore transactions require all reads to be executed before all writes"', async () => {
    const env = fakeEnv();
    await seedStaff(env, 'operator@example.com', 'operator');
    await seedFamily(env, 'fam-multi', 'parent-multi@example.com');
    const now = new Date().toISOString();
    const order: OrderDoc = {
      shopifyOrderId: '9001', orderName: '#9001',
      lines: [
        { sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 4980 },
        { sku: 'kodomo-ai-m2', variantId: 2, moduleId: 'm2', quantity: 1, lineTotal: 4980 },
      ],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: now, paidAt: now,
      purchaserEmail: 'parent-multi@example.com', familyId: null, bindingMethod: null,
      bindingState: 'needs_review', entitlementState: 'none', trialConverted: false,
      refund: emptyRefundInfo(), webhookIds: [], createdAt: now, updatedAt: now,
    };
    await env.db.set(orderPath('9001'), order);

    const { request, url } = adminRequest('/admin-api/orders/9001/bind', 'valid-jwt-for-operator@example.com', {
      method: 'POST', body: JSON.stringify({ familyId: 'fam-multi', reason: 'manual support fix' }),
    });
    const res = await handleAdminApi(request, env, url);

    expect(res.status).toBe(200);
    const body: OrderDoc = await res.json();
    expect(body.entitlementState).toBe('granted');
    const entM1 = await env.db.get<EntitlementDoc>(entitlementPath('fam-multi', 'm1'));
    const entM2 = await env.db.get<EntitlementDoc>(entitlementPath('fam-multi', 'm2'));
    expect(entM1?.status).toBe('active');
    expect(entM2?.status).toBe('active');
  });
});
