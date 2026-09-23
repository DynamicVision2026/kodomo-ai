/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleShopifyOrderWebhook, handleShopifyRefundWebhook } from '../backend/src/handlers/webhook';
import { handleCreatePurchaseIntent } from '../backend/src/handlers/purchaseIntents';
import { handleUnitOpen } from '../backend/src/handlers/units';
import { handleGetClaim, handleConfirmClaim } from '../backend/src/handlers/claims';
import { handleGetProgress, handlePutProgress } from '../backend/src/handlers/progress';
import { handleCreateProfile } from '../backend/src/handlers/profiles';
import { handleMe } from '../backend/src/handlers/me';
import type { Env } from '../backend/src/types';
import type { EntitlementDoc, OrderDoc, PurchaseIntentDoc, TrialDoc, UsageDoc } from '../backend/src/schema';
import { entitlementPath, familyPath, orderPath, purchaseIntentPath, trialPath, usagePath } from '../backend/src/schema';
import { createSession, SESSION_COOKIE_NAME } from '../backend/src/session';
import { getOrCreateFamilyIdInTx, emailHashOf } from '../backend/src/family';
import { hmacHex } from '../backend/src/util';
import { computeEligibilitySnapshot } from '../backend/src/refund';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';
import { emptyModuleProgress, type ModuleProgressState } from '../shared/progressMerge';

const SECRET = 'test-webhook-secret';

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function fakeEnv(): Env {
  return {
    db: new MemoryDb(),
    email: new FakeEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: SECRET,
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
    APP_ORIGIN: 'https://app.example.com',
    SHOPIFY_SHOP_DOMAIN: 'kodomo-ai.myshopify.com',
    SHOPIFY_VARIANT_IDS: { m1: '111222333' },
  };
}

function authedRequest(path: string, token: string, init: RequestInit = {}): Request {
  return new Request(`https://backend.example${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example.com',
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function postOrder(env: Env, body: unknown, webhookId?: string): Promise<Response> {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { 'X-Shopify-Hmac-Sha256': await sign(raw) };
  if (webhookId) headers['X-Shopify-Webhook-Id'] = webhookId;
  return handleShopifyOrderWebhook(new Request('https://backend.example/webhooks/shopify/orders-paid', { method: 'POST', headers, body: raw }), env);
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 6001,
    name: '#6001',
    currency: 'JPY',
    financial_status: 'paid',
    created_at: '2026-01-01T00:00:00.000Z',
    line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 1, variant_id: 111, price: '9800' }],
    ...overrides,
  };
}

async function loginFamily(env: Env, email: string): Promise<{ familyId: string; token: string }> {
  const { familyId } = await env.db.runTransaction((tx) => getOrCreateFamilyIdInTx(tx, email, new Date().toISOString()));
  const { token } = await createSession(env, familyId, 'test-device');
  return { familyId, token };
}

// ---------------------------------------------------------------------------------------------
// AD-16 §1/§2 — purchase-intent tokens: the "mother buys, father's card" scenario
// ---------------------------------------------------------------------------------------------

describe('AD-16 §1 — purchase-intent token binding (token beats email, on purpose)', () => {
  it('mother logs in and creates a purchase intent; father completes checkout with his own email/card — the order still binds to mother\'s family via the token', async () => {
    const env = fakeEnv();
    const { familyId: mothersFamilyId, token } = await loginFamily(env, 'mother@example.com');

    const intentRes = await handleCreatePurchaseIntent(
      authedRequest('/api/v1/purchase-intents', token, { method: 'POST', body: JSON.stringify({ moduleId: 'm1' }) }),
      env,
    );
    expect(intentRes.status).toBe(201);
    const { url } = await intentRes.json();
    const cartToken = new URL(url).searchParams.get('attributes[domo_pt]')!;
    expect(cartToken).toBeTruthy();

    // Father's own email is the purchaser — never mother's — but the cart carries the token.
    const order = baseOrder({
      email: 'father@example.com',
      note_attributes: [{ name: 'domo_pt', value: cartToken }],
    });
    const res = await postOrder(env, order);
    expect(res.status).toBe(200);

    const orderDoc = await env.db.get<OrderDoc>(orderPath(order.id));
    expect(orderDoc?.bindingMethod).toBe('token');
    expect(orderDoc?.bindingState).toBe('bound');
    expect(orderDoc?.familyId).toBe(mothersFamilyId);
    expect(orderDoc?.purchaserEmail).toBe('father@example.com'); // recorded, but never used for binding

    const ent = await env.db.get<EntitlementDoc>(entitlementPath(mothersFamilyId, 'm1'));
    expect(ent?.status).toBe('active');

    // Father's email never got its own family created.
    expect(await env.db.get(`emailIndex/${await emailHashOf('father@example.com')}`)).toBeNull();
  });

  it('a replayed/already-redeemed token is not honored a second time — falls through to email_match/claim instead', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'once@example.com');
    const intentRes = await handleCreatePurchaseIntent(
      authedRequest('/api/v1/purchase-intents', token, { method: 'POST', body: JSON.stringify({ moduleId: 'm1' }) }),
      env,
    );
    const { url } = await intentRes.json();
    const cartToken = new URL(url).searchParams.get('attributes[domo_pt]')!;

    const firstOrder = baseOrder({ id: 6101, name: '#6101', email: 'buyer1@example.com', note_attributes: [{ name: 'domo_pt', value: cartToken }] });
    await postOrder(env, firstOrder);

    // A second, unrelated order somehow carries the SAME (already-redeemed) token.
    const secondOrder = baseOrder({ id: 6102, name: '#6102', email: 'buyer2@example.com', note_attributes: [{ name: 'domo_pt', value: cartToken }] });
    const res = await postOrder(env, secondOrder);
    expect(res.status).toBe(200);
    const secondDoc = await env.db.get<OrderDoc>(orderPath(6102));
    expect(secondDoc?.bindingMethod).not.toBe('token');
    expect(secondDoc?.familyId).not.toBe(familyId);
  });

  it('an expired token is not honored — falls through to email_match/claim instead', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'expiredtoken@example.com');
    const intentRes = await handleCreatePurchaseIntent(
      authedRequest('/api/v1/purchase-intents', token, { method: 'POST', body: JSON.stringify({ moduleId: 'm1' }) }),
      env,
    );
    const { url } = await intentRes.json();
    const cartToken = new URL(url).searchParams.get('attributes[domo_pt]')!;
    const tokenHash = await hmacHex(cartToken, env.AUTH_PEPPER);
    const intent = await env.db.get<PurchaseIntentDoc>(purchaseIntentPath(tokenHash));
    await env.db.set(purchaseIntentPath(tokenHash), { ...intent!, expiresAt: new Date(Date.now() - 1000).toISOString() });

    const order = baseOrder({ id: 6103, name: '#6103', email: 'someoneelse@example.com', note_attributes: [{ name: 'domo_pt', value: cartToken }] });
    const res = await postOrder(env, order);
    expect(res.status).toBe(200);
    const doc = await env.db.get<OrderDoc>(orderPath(6103));
    expect(doc?.bindingMethod).not.toBe('token');
    expect(doc?.familyId).not.toBe(familyId);
  });
});

// ---------------------------------------------------------------------------------------------
// AD-16 §2 — claim flow for an unmatched purchaser email
// ---------------------------------------------------------------------------------------------

describe('AD-16 §2 — claim flow: an order nobody could bind by token or email_match is claimed by a logged-in parent', () => {
  it('the purchaser (never having logged in before) later logs in and confirms the claim, binding + granting entitlement', async () => {
    const env = fakeEnv();
    const order = baseOrder({ email: 'claimant@example.com' });
    await postOrder(env, order);

    const orderDoc = await env.db.get<OrderDoc>(orderPath(order.id));
    expect(orderDoc?.bindingState).toBe('awaiting_claim');

    const emails = (env.email as FakeEmailSender).sent.filter((m) => m.to === 'claimant@example.com');
    expect(emails).toHaveLength(1);
    const claimToken = emails[0]!.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    expect(claimToken).toBeTruthy();

    // The claimant logs in for the first time (account-first, per AD-15/16).
    const { familyId, token } = await loginFamily(env, 'claimant@example.com');

    const getRes = await handleGetClaim(authedRequest(`/api/v1/claims/${claimToken}`, token, { method: 'GET' }), env, claimToken!);
    expect(getRes.status).toBe(200);
    const claimBody = await getRes.json();
    expect(claimBody.moduleIds).toEqual(['m1']);

    const confirmRes = await handleConfirmClaim(authedRequest(`/api/v1/claims/${claimToken}`, token, { method: 'POST', body: '{}' }), env, claimToken!);
    expect(confirmRes.status).toBe(200);

    const boundOrder = await env.db.get<OrderDoc>(orderPath(order.id));
    expect(boundOrder?.bindingState).toBe('bound');
    expect(boundOrder?.bindingMethod).toBe('claim');
    expect(boundOrder?.familyId).toBe(familyId);
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.status).toBe('active');
  });

  it('a claim token cannot be redeemed twice', async () => {
    const env = fakeEnv();
    const order = baseOrder({ id: 6201, name: '#6201', email: 'claimant2@example.com' });
    await postOrder(env, order);
    const claimEmail = (env.email as FakeEmailSender).sent.find((m) => m.to === 'claimant2@example.com')!;
    const claimToken = claimEmail.text.match(/token=([A-Za-z0-9_-]+)/)![1]!;

    const { token: tokenA } = await loginFamily(env, 'claimant2@example.com');
    await handleConfirmClaim(authedRequest(`/api/v1/claims/${claimToken}`, tokenA, { method: 'POST', body: '{}' }), env, claimToken);

    const { token: tokenB } = await loginFamily(env, 'someoneelse2@example.com');
    const secondAttempt = await handleConfirmClaim(authedRequest(`/api/v1/claims/${claimToken}`, tokenB, { method: 'POST', body: '{}' }), env, claimToken);
    expect(secondAttempt.status).toBe(410);
  });
});

// ---------------------------------------------------------------------------------------------
// AD-14 boundary + quantity/duplicate edge cases (AD-16 §2/§4)
// ---------------------------------------------------------------------------------------------

describe('AD-14/AD-16 §4 — non-NazeHori and mixed-cart orders', () => {
  it('an order made up entirely of KD-*/SOULID-* line items writes nothing at all', async () => {
    const env = fakeEnv();
    const order = baseOrder({
      id: 6301, name: '#6301',
      line_items: [
        { id: 1, sku: 'KD-ANNUAL', quantity: 1, variant_id: 1, price: '5000' },
        { id: 2, sku: 'SOULID-BASIC', quantity: 1, variant_id: 2, price: '3000' },
      ],
    });
    const res = await postOrder(env, order);
    expect(res.status).toBe(200);
    expect(await env.db.get(orderPath(6301))).toBeNull();
  });

  it('a mixed cart records ONLY the allowlisted line, ignoring KD-*/SOULID-* lines entirely', async () => {
    const env = fakeEnv();
    const order = baseOrder({
      id: 6302, name: '#6302',
      email: 'mixed@example.com',
      line_items: [
        { id: 1, sku: 'kodomo-ai-m1', quantity: 1, variant_id: 111, price: '9800' },
        { id: 2, sku: 'KD-ANNUAL', quantity: 1, variant_id: 3, price: '5000' },
      ],
    });
    const res = await postOrder(env, order);
    expect(res.status).toBe(200);
    const doc = await env.db.get<OrderDoc>(orderPath(6302));
    expect(doc?.lines).toHaveLength(1);
    expect(doc?.lines[0]!.sku).toBe('kodomo-ai-m1');
  });

  it('quantity 2 of the same SKU still grants one entitlement, but flags the order needs_review for staff', async () => {
    const env = fakeEnv();
    const { familyId } = await loginFamily(env, 'twounits@example.com');
    const order = baseOrder({
      id: 6303, name: '#6303', email: 'twounits@example.com',
      line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 2, variant_id: 111, price: '9800' }],
    });
    const res = await postOrder(env, order);
    expect(res.status).toBe(200);
    const doc = await env.db.get<OrderDoc>(orderPath(6303));
    expect(doc?.bindingState).toBe('needs_review');
    expect(doc?.entitlementState).toBe('granted');
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------------------------
// AD-16 §6 — first-paid-use evidence
// ---------------------------------------------------------------------------------------------

describe('AD-16 §6 — paid-content usage evidence', () => {
  async function seedFamilyWithEntitledProfile(env: Env, email: string): Promise<{ familyId: string; token: string; profileId: string }> {
    const { familyId, token } = await loginFamily(env, email);
    await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: 'o1', grantedAt: new Date().toISOString(), revokedAt: null, revokedReason: null });
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    return { familyId, token, profileId };
  }

  it('opening the free/trial unit (1-1) never records first-paid-use', async () => {
    const env = fakeEnv();
    const { familyId, token, profileId } = await seedFamilyWithEntitledProfile(env, 'trialonly@example.com');
    const res = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-1/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-1',
    );
    expect(res.status).toBe(200);
    expect(await env.db.get<UsageDoc>(usagePath(familyId, 'm1'))).toBeNull();
  });

  it('opening a paid unit (1-2) records the first-paid-use evidence exactly once, idempotently', async () => {
    const env = fakeEnv();
    const { familyId, token, profileId } = await seedFamilyWithEntitledProfile(env, 'paiduse@example.com');

    const first = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-2/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-2',
    );
    expect(first.status).toBe(200);
    const usage = await env.db.get<UsageDoc>(usagePath(familyId, 'm1'));
    expect(usage?.firstPaidUnitId).toBe('m1-s2-1-2');
    const firstAt = usage!.firstPaidUseAt;

    // Opening a SECOND paid unit never overwrites the first-ever evidence.
    await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-3/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-3',
    );
    const usageAfter = await env.db.get<UsageDoc>(usagePath(familyId, 'm1'));
    expect(usageAfter?.firstPaidUnitId).toBe('m1-s2-1-2');
    expect(usageAfter?.firstPaidUseAt).toBe(firstAt);
  });

  it('a direct PUT /progress claiming a paid mission complete, bypassing /units/open, still records first-paid-use defensively', async () => {
    const env = fakeEnv();
    const { familyId, token, profileId } = await seedFamilyWithEntitledProfile(env, 'directwrite@example.com');
    const state: ModuleProgressState = { ...emptyModuleProgress(), missions: { 'm1-s2-1-2': { done: true, stamps: 1, coop: false } } };
    await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'PUT', body: JSON.stringify(state) }), env, profileId, 'm1');
    const usage = await env.db.get<UsageDoc>(usagePath(familyId, 'm1'));
    expect(usage?.firstPaidUnitId).toBe('m1-s2-1-2');
  });

  it('login, profile creation, and map browsing alone never record first-paid-use', async () => {
    const env = fakeEnv();
    const { familyId } = await seedFamilyWithEntitledProfile(env, 'browseonly@example.com');
    expect(await env.db.get<UsageDoc>(usagePath(familyId, 'm1'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// AD-16 §7 — refund-support: frozen eligibility snapshot
// ---------------------------------------------------------------------------------------------

describe('AD-16 §7 — refund eligibility snapshot is frozen at request time, never recomputed', () => {
  it('a snapshot computed before paid use shows paidContentUsed=false even after paid use happens later', async () => {
    const env = fakeEnv();
    const familyId = 'f-refund';
    const paidAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const order: Pick<OrderDoc, 'paidAt' | 'lines' | 'familyId'> = {
      paidAt: paidAt.toISOString(),
      lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 9800 }],
      familyId,
    };
    const requestedAt = new Date();
    const snapshot = await computeEligibilitySnapshot(env, order, requestedAt);
    expect(snapshot.paidContentUsed).toBe(false);
    expect(snapshot.withinWindow).toBe(true);
    expect(snapshot.objectivelyEligible).toBe(true);

    // Paid use happens AFTER the snapshot was frozen — the snapshot itself never changes.
    await env.db.set(usagePath(familyId, 'm1'), { firstPaidUseAt: new Date().toISOString(), firstPaidUnitId: 'm1-s2-1-2', firstPaidProfileId: 'p1' });
    expect(snapshot.paidContentUsed).toBe(false); // frozen object, unaffected by the write above
  });

  it('a purchase outside the 10-day window is not objectively eligible, regardless of usage', async () => {
    const env = fakeEnv();
    const order: Pick<OrderDoc, 'paidAt' | 'lines' | 'familyId'> = {
      paidAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 9800 }],
      familyId: null,
    };
    const snapshot = await computeEligibilitySnapshot(env, order, new Date());
    expect(snapshot.withinWindow).toBe(false);
    expect(snapshot.objectivelyEligible).toBe(false);
  });
});

describe('AD-16 §7 — refunds/create revokes the entitlement, never touches progress or the account', () => {
  it('progress written before a refund is untouched after the refund revokes the entitlement', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'refundme@example.com');
    await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: '6401', grantedAt: new Date().toISOString(), revokedAt: null, revokedReason: null });
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    const state: ModuleProgressState = { ...emptyModuleProgress(), missions: { 'm1-s2-1-2': { done: true, stamps: 3, coop: false } } };
    await handlePutProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'PUT', body: JSON.stringify(state) }), env, profileId, 'm1');

    await env.db.set(orderPath(6401), {
      shopifyOrderId: '6401', orderName: '#6401', lines: [{ sku: 'kodomo-ai-m1', variantId: 1, moduleId: 'm1', quantity: 1, lineTotal: 9800 }],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: new Date().toISOString(), paidAt: new Date().toISOString(),
      purchaserEmail: 'refundme@example.com', familyId, bindingMethod: 'email_match', bindingState: 'bound', entitlementState: 'granted',
      trialConverted: false, refund: { requestedAt: null, requestChannel: null, eligibilitySnapshot: null, decision: null, shopifyRefundIds: [], refundedAt: null, refundedAmount: null, state: 'none' },
      webhookIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } satisfies OrderDoc);

    const rawRefund = JSON.stringify({ id: 9001, order_id: 6401, refund_line_items: [{ line_item_id: 1, quantity: 1, line_item: { sku: 'kodomo-ai-m1' } }] });
    const refundRes = await handleShopifyRefundWebhook(
      new Request('https://backend.example/webhooks/shopify/refunds-create', { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': await sign(rawRefund) }, body: rawRefund }),
      env,
    );
    expect(refundRes.status).toBe(200);

    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.status).toBe('revoked');

    // Progress and the account/family are completely untouched.
    const getRes = await handleGetProgress(authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'GET' }), env, profileId, 'm1');
    const progressBody = await getRes.json();
    expect(progressBody.missions['m1-s2-1-2'].done).toBe(true);
    const family = await env.db.get(familyPath(familyId));
    expect(family).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// AD-16 §0 — login/me/purchase all keep working after a module's trial has expired
// ---------------------------------------------------------------------------------------------

describe('AD-16 §0 — trial expiry closes Lesson 1-1 only, never the account/login/purchase', () => {
  it('after the trial has expired, login still succeeds and a purchase intent can still be created', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'stillbuys@example.com');
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
      convertedAt: null, convertedOrderId: null, lastOpenedAt: null,
    } satisfies TrialDoc);

    // /me still works, and still reports the module's own expired trial without refusing the request.
    const meRes = await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env);
    expect(meRes.status).toBe(200);
    const me = await meRes.json();
    expect(me.familyId).toBe(familyId);
    expect(me.trials).toEqual([{ moduleId: 'm1', state: 'expired', endsAt: expect.any(String) }]);

    // A purchase intent can still be created — purchase is never trial-gated.
    const intentRes = await handleCreatePurchaseIntent(
      authedRequest('/api/v1/purchase-intents', token, { method: 'POST', body: JSON.stringify({ moduleId: 'm1' }) }),
      env,
    );
    expect(intentRes.status).toBe(201);

    // The trial unit itself (1-1) is now refused...
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-1/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-1',
    );
    expect(openRes.status).toBe(403);
    expect((await openRes.json()).error).toBe('trial_expired');
  });
});

// ---------------------------------------------------------------------------------------------
// AD-15's own approved rule, precisely scoped by the Founder's own iPhone-incident follow-up:
// "after endsAt, a new open or re-open of 1-1 is refused even within 2h, and only progress
// writes for a lesson opened before endsAt are accepted until endsAt + 2h." Two DIFFERENT
// operations, two DIFFERENT rules — backend/src/access.ts's `checkUnitAccess` (unit open, NO
// grace, ever) vs `isProgressWriteAllowed` (progress save, the actual 2-hour grace).
// ---------------------------------------------------------------------------------------------

describe('AD-15 — unit-open has NO grace: a new open or re-open of 1-1 is refused the instant the trial expires', () => {
  async function openTrialUnit(env: Env, token: string, profileId: string) {
    return handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-1/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-1',
    );
  }

  it('a trial that expired moments ago is refused — even with a recent open on record, even well inside the 2-hour window', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'reopen-just-expired@example.com');
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 74 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // expired 5 minutes ago
      convertedAt: null, convertedOrderId: null,
      lastOpenedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // opened 10 minutes ago — irrelevant to opening
    } satisfies TrialDoc);
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const openRes = await openTrialUnit(env, token, profileId);
    expect(openRes.status).toBe(403);
    expect((await openRes.json()).error).toBe('trial_expired');
  });

  it('the same refusal holds one second before the 2-hour mark, one second after it, and every point between — grace never applies to opening at all', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 're-open-sweep@example.com');
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    for (const minutesPastExpiry of [1, 60, 119, 120, 121, 600]) {
      await env.db.set(trialPath(familyId, 'm1'), {
        startedAt: new Date(Date.now() - 74 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() - minutesPastExpiry * 60 * 1000).toISOString(),
        convertedAt: null, convertedOrderId: null,
        lastOpenedAt: new Date(Date.now() - (minutesPastExpiry + 1) * 60 * 1000).toISOString(), // opened before endsAt
      } satisfies TrialDoc);
      const openRes = await openTrialUnit(env, token, profileId);
      expect(openRes.status).toBe(403);
      expect((await openRes.json()).error).toBe('trial_expired');
    }
  });

  it("a trial expired well past the grace window is blocked too, obviously — grace was never a second trial", async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'gracedout@example.com');
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // expired 5 hours ago
      convertedAt: null, convertedOrderId: null,
      lastOpenedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    } satisfies TrialDoc);
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const openRes = await openTrialUnit(env, token, profileId);
    expect(openRes.status).toBe(403);
    expect((await openRes.json()).error).toBe('trial_expired');
  });

  it('a genuinely fresh 72-hour trial (never opened before) records its own first open time, no grace needed', async () => {
    const env = fakeEnv();
    const { token } = await loginFamily(env, 'freshtrial@example.com');
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const before = Date.now();
    const openRes = await openTrialUnit(env, token, profileId);
    expect(openRes.status).toBe(200);

    const { familyId } = await (async () => {
      const me = await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env);
      return me.json();
    })();
    const trial = await env.db.get<TrialDoc>(trialPath(familyId, 'm1'));
    expect(trial?.lastOpenedAt).not.toBeNull();
    expect(new Date(trial!.lastOpenedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("refunded M1 falls back to the SAME existing trial (dates unchanged) — no new trial is ever created", async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'refunded@example.com');
    const originalStartedAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const originalEndsAt = new Date(Date.now() + 62 * 60 * 60 * 1000).toISOString(); // still active
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: originalStartedAt, endsAt: originalEndsAt,
      convertedAt: null, convertedOrderId: null, lastOpenedAt: null,
    } satisfies TrialDoc);
    // A module entitlement that gets revoked (mirrors AD-16 §7's own refund handler outcome) —
    // set directly here since this test's own point is `checkUnitAccess`'s fallback, not the
    // webhook path already covered elsewhere in this file.
    await env.db.set(entitlementPath(familyId, 'm1'), {
      status: 'revoked', shopifyOrderId: 'order-1', grantedAt: originalStartedAt,
      revokedAt: new Date().toISOString(), revokedReason: 'refund',
    } satisfies EntitlementDoc);

    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    const openRes = await openTrialUnit(env, token, profileId);
    expect(openRes.status).toBe(200); // falls back to the still-active original trial — allowed

    const trial = await env.db.get<TrialDoc>(trialPath(familyId, 'm1'));
    expect(trial?.startedAt).toBe(originalStartedAt);
    expect(trial?.endsAt).toBe(originalEndsAt); // untouched — no new trial was created
  });
});

describe('AD-15 — progress-write grace: a lesson opened before endsAt keeps saving until endsAt + 2h', () => {
  function putProgress(env: Env, token: string, profileId: string, missions: ModuleProgressState['missions']) {
    const state: ModuleProgressState = { ...emptyModuleProgress(), missions };
    return handlePutProgress(
      authedRequest(`/api/v1/profiles/${profileId}/progress/m1`, token, { method: 'PUT', body: JSON.stringify(state) }),
      env, profileId, 'm1',
    );
  }

  async function seed(email: string, endsAtOffsetMs: number, lastOpenedAtOffsetMs: number | null) {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, email);
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 74 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + endsAtOffsetMs).toISOString(),
      convertedAt: null, convertedOrderId: null,
      lastOpenedAt: lastOpenedAtOffsetMs === null ? null : new Date(Date.now() + lastOpenedAtOffsetMs).toISOString(),
    } satisfies TrialDoc);
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    return { env, familyId, token, profileId };
  }

  it('a lesson opened well before endsAt keeps saving progress 90 minutes after endsAt — inside the 2-hour grace', async () => {
    const { env, token, profileId } = await seed('grace-save-inside@example.com', -90 * 60 * 1000, -74 * 60 * 60 * 1000);
    const res = await putProgress(env, token, profileId, { 'm1-s2-1-1': { done: true, stamps: 1, coop: false } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.missions['m1-s2-1-1']).toBeDefined(); // accepted, not silently dropped
  });

  it('the SAME lesson is refused past endsAt + 2h — the grace has a hard edge, not a renewable one', async () => {
    const { env, token, profileId } = await seed('grace-save-outside@example.com', -121 * 60 * 1000, -74 * 60 * 60 * 1000);
    const res = await putProgress(env, token, profileId, { 'm1-s2-1-1': { done: true, stamps: 1, coop: false } });
    expect(res.status).toBe(200); // the request itself still succeeds (AD-13 idempotency philosophy)...
    const body = await res.json();
    expect(body.missions['m1-s2-1-1']).toBeUndefined(); // ...but the disallowed mission is silently dropped
  });

  it('a lesson NEVER actually opened (no lastOpenedAt) gets no grace at all once expired, even seconds past endsAt', async () => {
    const { env, token, profileId } = await seed('grace-never-opened@example.com', -60 * 1000, null);
    const res = await putProgress(env, token, profileId, { 'm1-s2-1-1': { done: true, stamps: 1, coop: false } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.missions['m1-s2-1-1']).toBeUndefined();
  });

  it('a still-active trial (not yet expired at all) writes normally — the grace machinery never engages early', async () => {
    const { env, token, profileId } = await seed('grace-still-active@example.com', 60 * 60 * 1000, -30 * 60 * 1000);
    const res = await putProgress(env, token, profileId, { 'm1-s2-1-1': { done: true, stamps: 1, coop: false } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.missions['m1-s2-1-1']).toBeDefined();
  });

  it('a paid (non-free) mission id is dropped regardless of trial/grace state — the free tier is 1-1 only, never widened by grace', async () => {
    const { env, token, profileId } = await seed('grace-paid-mission@example.com', -90 * 60 * 1000, -74 * 60 * 60 * 1000);
    const res = await putProgress(env, token, profileId, { 'm1-s2-1-2': { done: true, stamps: 1, coop: false } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.missions['m1-s2-1-2']).toBeUndefined();
  });
});
