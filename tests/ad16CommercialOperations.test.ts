/** @vitest-environment node */
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import { describe, it, expect } from 'vitest';
import { handleShopifyOrderWebhook, handleShopifyRefundWebhook } from '../backend/src/handlers/webhook';
import { handleCreatePurchaseIntent } from '../backend/src/handlers/purchaseIntents';
import { handleUnitOpen } from '../backend/src/handlers/units';
import { handleGetClaim, handleConfirmClaim } from '../backend/src/handlers/claims';
import { handleGetProgress, handlePutProgress } from '../backend/src/handlers/progress';
import { handleCreateProfile } from '../backend/src/handlers/profiles';
import { handleMe } from '../backend/src/handlers/me';
import type { Env } from '../backend/src/types';
import type { ClaimDoc, EntitlementDoc, OrderDoc, PurchaseIntentDoc, TrialDoc, UsageDoc } from '../backend/src/schema';
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
  const { familyId } = await env.db.runTransaction((tx) => getOrCreateFamilyIdInTx(tx, email, new Date().toISOString(), { consentClickedAt: new Date().toISOString(), consentVerifiedAt: new Date().toISOString(), consentVersion: CONSENT_TEXT_VERSION }));
  const { token } = await createSession(env, familyId, 'test-device');
  return { familyId, token };
}

/** Consent at login blocks the claim email to an unconsented purchaser address, so these tests
 *  can no longer read the token out of an email: they replace the order's claim with one whose
 *  token they know (same hash scheme the real flow uses). */
async function forceClaimToken(env: Env, orderId: number | string, token: string): Promise<void> {
  const claims = await env.db.query<ClaimDoc>('claims', 'orderId', String(orderId));
  const original = claims[0]!;
  await env.db.delete(`claims/${original.id}`);
  await env.db.set(`claims/${await hmacHex(token, env.AUTH_PEPPER)}`, original.data);
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

    // No claim email: claimant@example.com has no recorded consent.
    expect((env.email as FakeEmailSender).sent.filter((m) => m.to === 'claimant@example.com')).toHaveLength(0);
    const claimToken = 'known-claim-token-1';
    await forceClaimToken(env, order.id, claimToken);

    // The parent logs in under a DIFFERENT email than the checkout email (the case the claim
    // flow exists for — same-email logins are bound automatically at login).
    const { familyId, token } = await loginFamily(env, 'parent-account@example.com');

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
    const claimToken = 'known-claim-token-2';
    await forceClaimToken(env, order.id, claimToken);

    const { token: tokenA } = await loginFamily(env, 'parent-account2@example.com');
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
    const paidAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago — still within the 3-day window (COPY-02)
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

  it('a purchase outside the 3-day window (COPY-02) is not objectively eligible, regardless of usage', async () => {
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

  // Item 14c (Founder, 1 Oct 2026): "refunds remove course access ONLY when the ナゼホリ item
  // itself is refunded, never for other products." The store sells other products in the same
  // Shopify shop, so a refund can legitimately touch ONLY a line item this integration never
  // granted anything for — matchRefundedModuleIds (backend/src/shopify.ts) must filter refund
  // line items through the exact same SKU_TO_MODULE_IDS allowlist orders/paid uses, so such a
  // refund is a pure no-op here, never an accidental revoke.
  it('item 14c: refunding a mixed order\'s OTHER-PRODUCT line never revokes the ナゼホリ entitlement', async () => {
    const env = fakeEnv();
    const { familyId } = await loginFamily(env, 'mixedrefund@example.com');
    await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: '6402', grantedAt: new Date().toISOString(), revokedAt: null, revokedReason: null });
    await env.db.set(orderPath(6402), {
      shopifyOrderId: '6402', orderName: '#6402',
      lines: [{ sku: 'kodomo-ai-m1', variantId: 111, moduleId: 'm1', quantity: 1, lineTotal: 9800 }],
      currency: 'JPY', financialStatus: 'paid', shopifyCreatedAt: new Date().toISOString(), paidAt: new Date().toISOString(),
      purchaserEmail: 'mixedrefund@example.com', familyId, bindingMethod: 'email_match', bindingState: 'bound', entitlementState: 'granted',
      trialConverted: false, refund: { requestedAt: null, requestChannel: null, eligibilitySnapshot: null, decision: null, shopifyRefundIds: [], refundedAt: null, refundedAmount: null, state: 'none' },
      webhookIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } satisfies OrderDoc);

    // The refund webhook names the SAME Shopify order, but its own refund_line_items are for the
    // KD-ANNUAL line that was also in the original cart (not recorded in `order.lines` above,
    // exactly as orders/paid itself never records a non-allowlisted line — see the mixed-cart
    // test above) — never the kodomo-ai-m1 line.
    const rawRefund = JSON.stringify({ id: 9002, order_id: 6402, refund_line_items: [{ line_item_id: 2, quantity: 1, line_item: { sku: 'KD-ANNUAL' } }] });
    const refundRes = await handleShopifyRefundWebhook(
      new Request('https://backend.example/webhooks/shopify/refunds-create', { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': await sign(rawRefund) }, body: rawRefund }),
      env,
    );
    expect(refundRes.status).toBe(200);

    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.status).toBe('active'); // untouched — the refund never matched the allowlisted SKU
    const order = await env.db.get<OrderDoc>(orderPath(6402));
    expect(order?.entitlementState).toBe('granted'); // untouched
    expect(order?.refund.state).toBe('none'); // untouched — no refund was ever recorded for THIS order
  });
});

// ---------------------------------------------------------------------------------------------
// WO-C5 §6/follow-up — the 72-hour trial retires and the Playground becomes free ONLY once
// `isBeginnerLaunchEnabled` is true for the family (`env.BEGINNER_LAUNCH === '1'`, or the family's
// own id in `config/course.allowFamilies` — the exact same flag/allowlist pair as the frontend's
// own BEGINNER_LAUNCH check). Every test in THIS block sets the flag on directly, proving the NEW
// behavior; the next describe block below proves the OLD behavior holds byte-for-byte with the
// flag off, which is what a live, non-allowlisted family gets today.
// ---------------------------------------------------------------------------------------------

describe('WO-C5 §6/follow-up — BEGINNER_LAUNCH on: the Playground is free entry regardless of entitlement or any trial history', () => {
  it('a family with NO entitlement at all can open any Playground unit, not just the old free one', async () => {
    const env = fakeEnv();
    env.BEGINNER_LAUNCH = '1';
    const { token } = await loginFamily(env, 'neverpaid@example.com');
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-5/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-5',
    );
    expect(openRes.status).toBe(200);
    // Never paid, so nothing paid to record — refund-eligibility evidence stays empty for them.
    expect(await env.db.get<UsageDoc>(usagePath((await (await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env)).json()).familyId, 'm1'))).toBeNull();
  });

  it('a stale, long-expired trial doc from before this change has no effect on opening at all', async () => {
    const env = fakeEnv();
    env.BEGINNER_LAUNCH = '1';
    const { familyId, token } = await loginFamily(env, 'oldtrialdoc@example.com');
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 500 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 400 * 60 * 60 * 1000).toISOString(), // expired long ago
      convertedAt: null, convertedOrderId: null, lastOpenedAt: null,
    } satisfies TrialDoc);
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-1/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-1',
    );
    expect(openRes.status).toBe(200);
  });

  it('opening a unit no longer starts or touches any trial doc — the clock is retired, not just tolerant', async () => {
    const env = fakeEnv();
    env.BEGINNER_LAUNCH = '1';
    const { familyId, token } = await loginFamily(env, 'notrialstarted@example.com');
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-1/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-1',
    );
    expect(await env.db.get<TrialDoc>(trialPath(familyId, 'm1'))).toBeNull();
  });

  it('login, /me, and purchase-intent creation are all unaffected by a stale expired trial doc', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'stillbuys@example.com');
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
      convertedAt: null, convertedOrderId: null, lastOpenedAt: null,
    } satisfies TrialDoc);

    const meRes = await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env);
    expect(meRes.status).toBe(200);
    const me = await meRes.json();
    expect(me.familyId).toBe(familyId);

    const intentRes = await handleCreatePurchaseIntent(
      authedRequest('/api/v1/purchase-intents', token, { method: 'POST', body: JSON.stringify({ moduleId: 'm1' }) }),
      env,
    );
    expect(intentRes.status).toBe(201);
  });

  it('a section id added to config/playground.lockedSections refuses that one unit only — the future lock hook actually works', async () => {
    const env = fakeEnv();
    env.BEGINNER_LAUNCH = '1';
    const { token } = await loginFamily(env, 'lockedsection@example.com');
    await env.db.set('config/playground.lockedSections', { sectionIds: ['m1-s2-1-7'] });
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const lockedRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-7/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-7',
    );
    expect(lockedRes.status).toBe(403);

    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-6/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-6',
    );
    expect(openRes.status).toBe(200);
  });

  it('the per-family allowlist (config/course.allowFamilies) works too, without the global env flag — and only for THAT family', async () => {
    const env = fakeEnv(); // BEGINNER_LAUNCH unset — this test is entirely about the allowlist path
    const { familyId: allowedFamilyId, token: allowedToken } = await loginFamily(env, 'allowlisted@example.com');
    const { token: otherToken } = await loginFamily(env, 'notallowlisted@example.com');
    await env.db.set('config/course.allowFamilies', { familyIds: [allowedFamilyId] });

    const allowedProfile = await handleCreateProfile(authedRequest('/api/v1/profiles', allowedToken, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: allowedProfileId } = await allowedProfile.json();
    const otherProfile = await handleCreateProfile(authedRequest('/api/v1/profiles', otherToken, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: otherProfileId } = await otherProfile.json();

    // The allowlisted family: a normally-paid unit (m1-s2-1-5) opens free, no entitlement needed.
    const allowedRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-5/open', allowedToken, { method: 'POST', body: JSON.stringify({ profileId: allowedProfileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-5',
    );
    expect(allowedRes.status).toBe(200);

    // A different, non-allowlisted family, same env/flag state: the SAME paid unit is refused —
    // the old entitlement gate, unaffected, since BEGINNER_LAUNCH is off for everyone else.
    const otherRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-5/open', otherToken, { method: 'POST', body: JSON.stringify({ profileId: otherProfileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-5',
    );
    expect(otherRes.status).toBe(403);
    expect((await otherRes.json()).error).toBe('not_entitled');
  });
});

// ---------------------------------------------------------------------------------------------
// WO-C5 follow-up item 1 — the safety check itself: with BEGINNER_LAUNCH OFF (env.BEGINNER_LAUNCH
// unset, family not in config/course.allowFamilies — the exact state every live family is in
// today, since the allowlist doc doesn't exist until staff add a row to it), `checkUnitAccess`/
// `handleUnitOpen` must behave BYTE-FOR-BYTE like the pre-WO-C5 code: same trial start/expiry/
// grace, same refund-eligibility recording. These are the same assertions the original AD-16 §0/
// AD-15 suites made before WO-C5's first pass wrongly made them unconditional — restored here,
// against the CURRENT code, with the flag verifiably off.
// ---------------------------------------------------------------------------------------------

describe('WO-C5 follow-up — BEGINNER_LAUNCH off: production behaves exactly as before (trial intact)', () => {
  it('after the trial has expired, login still succeeds and a purchase intent can still be created', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'stillbuys-flagoff@example.com');
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
      convertedAt: null, convertedOrderId: null, lastOpenedAt: null,
    } satisfies TrialDoc);

    const meRes = await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env);
    expect(meRes.status).toBe(200);
    const me = await meRes.json();
    expect(me.familyId).toBe(familyId);
    expect(me.trials).toEqual([{ moduleId: 'm1', state: 'expired', endsAt: expect.any(String) }]);

    const intentRes = await handleCreatePurchaseIntent(
      authedRequest('/api/v1/purchase-intents', token, { method: 'POST', body: JSON.stringify({ moduleId: 'm1' }) }),
      env,
    );
    expect(intentRes.status).toBe(201);

    // The trial unit itself (1-1) is now refused — exactly the pre-WO-C5 behavior.
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-1/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-1',
    );
    expect(openRes.status).toBe(403);
    expect((await openRes.json()).error).toBe('trial_expired');
  });

  it('an unentitled family opening a PAID (non-free) unit is refused not_entitled — the Playground is NOT free with the flag off', async () => {
    const env = fakeEnv();
    const { token } = await loginFamily(env, 'notentitled-flagoff@example.com');
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-5/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-5',
    );
    expect(openRes.status).toBe(403);
    expect((await openRes.json()).error).toBe('not_entitled');
  });

  async function openTrialUnit(env: Env, token: string, profileId: string) {
    return handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-1/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-1',
    );
  }

  it('a trial that expired moments ago is refused — even with a recent open on record, even well inside the 2-hour window', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'reopen-just-expired-flagoff@example.com');
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

  it('a genuinely fresh 72-hour trial (never opened before) records its own first open time, no grace needed', async () => {
    const env = fakeEnv();
    const { token } = await loginFamily(env, 'freshtrial-flagoff@example.com');
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
    const { familyId, token } = await loginFamily(env, 'refunded-flagoff@example.com');
    const originalStartedAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const originalEndsAt = new Date(Date.now() + 62 * 60 * 60 * 1000).toISOString(); // still active
    await env.db.set(trialPath(familyId, 'm1'), {
      startedAt: originalStartedAt, endsAt: originalEndsAt,
      convertedAt: null, convertedOrderId: null, lastOpenedAt: null,
    } satisfies TrialDoc);
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

  it('opening a paid unit (1-2) of an ENTITLED family still records first-paid-use exactly as before', async () => {
    const env = fakeEnv();
    const { familyId, token } = await loginFamily(env, 'paiduse-flagoff@example.com');
    await env.db.set(entitlementPath(familyId, 'm1'), { status: 'active', shopifyOrderId: 'o1', grantedAt: new Date().toISOString(), revokedAt: null, revokedReason: null });
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    const res = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-2/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-2',
    );
    expect(res.status).toBe(200);
    const usage = await env.db.get<UsageDoc>(usagePath(familyId, 'm1'));
    expect(usage?.firstPaidUnitId).toBe('m1-s2-1-2');
  });
});

// ---------------------------------------------------------------------------------------------
// WO-C5 preview follow-up — COURSE_PREVIEW_EMAILS: a server-side-only staff preview allowlist by
// verified login email (never a familyId row in config/course.allowFamilies), because the Founder
// asked for this specifically to avoid touching Firestore. Same effect as the allowlist
// (courseAllowed + isBeginnerLaunchEnabled), case/whitespace-insensitive exact match only, and a
// no-op for every other family — with BEGINNER_LAUNCH still off.
// ---------------------------------------------------------------------------------------------

describe('WO-C5 preview follow-up — COURSE_PREVIEW_EMAILS: staff preview access by login email', () => {
  it('a family whose login email is on the list is courseAllowed via /me — no allowFamilies row needed', async () => {
    const env = fakeEnv();
    env.COURSE_PREVIEW_EMAILS = 'info@domo-ai.com';
    const { token } = await loginFamily(env, 'info@domo-ai.com');
    const meRes = await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env);
    const me = await meRes.json();
    expect(me.courseAllowed).toBe(true);
  });

  it('matching is case- and whitespace-insensitive, exact match only', async () => {
    const env = fakeEnv();
    env.COURSE_PREVIEW_EMAILS = ' Info@Domo-AI.com ,other@example.com';
    const { token } = await loginFamily(env, 'INFO@DOMO-AI.COM');
    const meRes = await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env);
    expect((await meRes.json()).courseAllowed).toBe(true);
  });

  it('a different family (any other email) is unaffected, even with the list configured', async () => {
    const env = fakeEnv();
    env.COURSE_PREVIEW_EMAILS = 'info@domo-ai.com';
    const { token } = await loginFamily(env, 'someoneelse@example.com');
    const meRes = await handleMe(authedRequest('/api/v1/me', token, { method: 'GET' }), env);
    expect((await meRes.json()).courseAllowed).toBe(false);
  });

  it('the preview family also gets the free Playground (isBeginnerLaunchEnabled), same as an allowFamilies row would', async () => {
    const env = fakeEnv();
    env.COURSE_PREVIEW_EMAILS = 'info@domo-ai.com';
    const { token } = await loginFamily(env, 'info@domo-ai.com');
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();

    // A normally-paid, unentitled unit opens free — the same WO-C5 §6 behavior an allowFamilies
    // row already produces.
    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-5/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-5',
    );
    expect(openRes.status).toBe(200);
  });

  it('flag-off production is unchanged for everyone when COURSE_PREVIEW_EMAILS is unset (the real deploy default until this ships)', async () => {
    const env = fakeEnv(); // no COURSE_PREVIEW_EMAILS set, same as every other test in this file
    const { token } = await loginFamily(env, 'ordinaryfamily@example.com');
    const createRes = await handleCreateProfile(authedRequest('/api/v1/profiles', token, { method: 'POST', body: JSON.stringify({ avatarId: 'a1', nicknameId: 'n1', stage: 2 }) }), env);
    const { id: profileId } = await createRes.json();
    const openRes = await handleUnitOpen(
      authedRequest('/api/v1/units/m1-s2-1-5/open', token, { method: 'POST', body: JSON.stringify({ profileId, moduleId: 'm1' }) }),
      env, 'm1-s2-1-5',
    );
    expect(openRes.status).toBe(403);
    expect((await openRes.json()).error).toBe('not_entitled');
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
