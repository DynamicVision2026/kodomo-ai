/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../backend/src/types';
import type { EntitlementDoc, FamilyDoc, OrderDoc, StaffDoc } from '../backend/src/schema';
import { auditLogCollection, emptyRefundInfo, entitlementPath, familyPath, orderPath, staffPath } from '../backend/src/schema';
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
  await env.db.set(familyPath(familyId), { email, status: 'active', profileCount: 0, createdAt: now, updatedAt: now } satisfies FamilyDoc);
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

    await handleAdminApi(
      new Request('https://admin.example/admin-api/families/fam-7/resend-welcome', {
        method: 'POST', headers: { 'x-goog-iap-jwt-assertion': 'valid-jwt-for-operator@example.com' },
      }),
      env,
      new URL('https://admin.example/admin-api/families/fam-7/resend-welcome'),
    );
    await handleAdminApi(
      new Request('https://admin.example/admin-api/families/fam-7/resend-welcome', {
        method: 'POST', headers: { 'x-goog-iap-jwt-assertion': 'valid-jwt-for-operator@example.com' },
      }),
      env,
      new URL('https://admin.example/admin-api/families/fam-7/resend-welcome'),
    );

    const entries = await env.db.list(auditLogCollection());
    const relevant = entries.filter((e) => (e.data as { targetId: string }).targetId === 'fam-7');
    expect(relevant).toHaveLength(2); // appended, never merged/overwritten
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
