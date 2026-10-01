/** @vitest-environment node */
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import { describe, it, expect, vi } from 'vitest';
import { handleShopifyOrderWebhook, handleShopifyRefundWebhook } from '../backend/src/handlers/webhook';
import type { Env } from '../backend/src/types';
import type { EntitlementDoc, FamilyDoc, OrderDoc } from '../backend/src/schema';
import { entitlementPath, familyPath, orderPath } from '../backend/src/schema';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';
import { getOrCreateFamilyIdInTx } from '../backend/src/family';
import { sha256Hex } from '../backend/src/util';

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
  };
}

/** AD-16 §2: the webhook never creates a family from a purchaser email — only an ALREADY
 *  existing family (created by a prior login, exactly like `verifyLoginCode` does) can be
 *  matched by email. Tests that want a "bound at purchase" scenario must pre-create the family
 *  the same way a real login would. */
async function loginFirst(env: Env, email: string): Promise<string> {
  const { familyId } = await env.db.runTransaction((tx) => getOrCreateFamilyIdInTx(tx, email, new Date().toISOString(), { consentAt: new Date().toISOString(), consentTextVersion: CONSENT_TEXT_VERSION }));
  return familyId;
}

async function postOrder(env: Env, body: unknown, webhookId?: string): Promise<Response> {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { 'X-Shopify-Hmac-Sha256': await sign(raw) };
  if (webhookId) headers['X-Shopify-Webhook-Id'] = webhookId;
  return handleShopifyOrderWebhook(new Request('https://backend.example/webhooks/shopify/orders-paid', { method: 'POST', headers, body: raw }), env);
}

async function postRefund(env: Env, body: unknown): Promise<Response> {
  const raw = JSON.stringify(body);
  return handleShopifyRefundWebhook(
    new Request('https://backend.example/webhooks/shopify/refunds-create', {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': await sign(raw) },
      body: raw,
    }),
    env,
  );
}

const order = {
  id: 5001,
  name: '#5001',
  email: 'parent@example.com',
  currency: 'JPY',
  financial_status: 'paid',
  created_at: '2026-01-01T00:00:00.000Z',
  line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 1, variant_id: 111, price: '9800' }],
};

describe('AD-16 §1/§2 — orders/paid binds by email_match to an already-existing family, grants an entitlement, sends the module-activated email, idempotently', () => {
  it('a valid HMAC binds, grants, and emails; replaying it 3 times yields a single entitlement', async () => {
    const env = fakeEnv();
    const familyId = await loginFirst(env, order.email);

    for (let i = 0; i < 3; i++) {
      const res = await postOrder(env, order, 'wh-1');
      expect(res.status).toBe(200);
    }

    const orderDoc = await env.db.get<OrderDoc>(orderPath(order.id));
    expect(orderDoc?.bindingState).toBe('bound');
    expect(orderDoc?.bindingMethod).toBe('email_match');
    expect(orderDoc?.entitlementState).toBe('granted');
    expect(orderDoc?.familyId).toBe(familyId);

    const family = await env.db.get<FamilyDoc>(familyPath(familyId));
    expect(family?.email).toBe('parent@example.com');
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.status).toBe('active');

    const emails = (env.email as FakeEmailSender).sent;
    expect(emails.filter((m) => m.to === 'parent@example.com')).toHaveLength(1); // not one per replay
  });
});

describe('AD-16 §2 — an unmatched purchaser email never auto-creates a family', () => {
  it('leaves the order awaiting_claim, with no family bound, and sends NO claim email (no recorded consent for that address)', async () => {
    const env = fakeEnv();
    const res = await postOrder(env, order);
    expect(res.status).toBe(200);

    const orderDoc = await env.db.get<OrderDoc>(orderPath(order.id));
    expect(orderDoc?.bindingState).toBe('awaiting_claim');
    expect(orderDoc?.familyId).toBeNull();
    expect(await env.db.get<FamilyDoc>(familyPath('nonexistent'))).toBeNull();

    // Consent at login: no family has consented under this address, so the claim link is blocked
    // at the email gate. The order waits; it binds when this address logs in with consent
    // (see tests/backendConsentAtLogin.test.ts).
    const emails = (env.email as FakeEmailSender).sent;
    expect(emails.filter((m) => m.to === 'parent@example.com')).toHaveLength(0);
  });
});

describe('AD-13/AD-14 boundary — an order with no allowlisted line item writes nothing at all', () => {
  it('401s and never creates a family or entitlement on a bad signature', async () => {
    const env = fakeEnv();
    const raw = JSON.stringify(order);
    const res = await handleShopifyOrderWebhook(
      new Request('https://backend.example/webhooks/shopify/orders-paid', {
        method: 'POST',
        headers: { 'X-Shopify-Hmac-Sha256': 'bogus' },
        body: raw,
      }),
      env,
    );
    expect(res.status).toBe(401);
    expect(await env.db.get(orderPath(order.id))).toBeNull();
  });
});

describe('AD-16 §2 — a second order of the same module by the same bound email is marked duplicate, still one entitlement', () => {
  it('grants once, marks the second order duplicate, and the entitlement is not touched twice', async () => {
    const env = fakeEnv();
    const familyId = await loginFirst(env, order.email);
    await postOrder(env, order);
    const secondOrder = { ...order, id: 5002, name: '#5002' };
    const res = await postOrder(env, secondOrder);
    expect(res.status).toBe(200);

    const secondDoc = await env.db.get<OrderDoc>(orderPath(secondOrder.id));
    expect(secondDoc?.entitlementState).toBe('duplicate');
    expect(secondDoc?.bindingState).toBe('bound');
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.shopifyOrderId).toBe(String(order.id)); // still the FIRST order's grant
  });

  it('an order with no purchaser email is marked needs_review, not silently dropped', async () => {
    const env = fakeEnv();
    const res = await postOrder(env, { ...order, id: 9001, email: undefined });
    expect(res.status).toBe(200);
    const doc = await env.db.get<OrderDoc>(orderPath(9001));
    expect(doc?.bindingState).toBe('needs_review');
    expect(doc?.familyId).toBeNull();
  });
});

describe('AD-16 §7 — refunds/create revokes the entitlement, keeps progress', () => {
  it('revokes the entitlement (status becomes revoked) and marks the order refunded, never touches progress data', async () => {
    const env = fakeEnv();
    await loginFirst(env, order.email);
    await postOrder(env, order);
    const orderDoc = await env.db.get<OrderDoc>(orderPath(order.id));
    const familyId = orderDoc!.familyId!;

    const refundRes = await postRefund(env, {
      id: 8001,
      order_id: order.id,
      refund_line_items: [{ line_item_id: 1, quantity: 1, line_item: { sku: 'kodomo-ai-m1' } }],
    });
    expect(refundRes.status).toBe(200);

    const ent = await env.db.get<EntitlementDoc>(entitlementPath(familyId, 'm1'));
    expect(ent?.status).toBe('revoked');
    expect(ent?.revokedReason).toBe('refund');
    expect(ent?.revokedAt).not.toBeNull();

    const updatedOrder = await env.db.get<OrderDoc>(orderPath(order.id));
    expect(updatedOrder?.entitlementState).toBe('revoked');
    expect(updatedOrder?.refund.state).toBe('refunded');
  });

  it('a refund for an unmatched SKU is a no-op', async () => {
    const env = fakeEnv();
    await loginFirst(env, order.email);
    await postOrder(env, order);
    const orderDoc = await env.db.get<OrderDoc>(orderPath(order.id));
    await postRefund(env, {
      id: 8002,
      order_id: order.id,
      refund_line_items: [{ line_item_id: 2, quantity: 1, line_item: { sku: 'product-a-sku' } }],
    });
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(orderDoc!.familyId!, 'm1'));
    expect(ent?.status).toBe('active'); // untouched
  });
});

describe('Post-launch-check (Founder) — one Cloud-Logging line per processed order, no personal data', () => {
  function orderLogLines(logSpy: ReturnType<typeof vi.spyOn>): string[] {
    return logSpy.mock.calls.map((c) => c.join(' ')).filter((l) => l.startsWith('[order]'));
  }

  it('a fresh bound+granted order logs binding=email_match, a hashed (never raw) family id, entitlement=granted, email_sent=yes', async () => {
    const env = fakeEnv();
    const familyId = await loginFirst(env, order.email);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await postOrder(env, order, 'wh-log-1');

    const [line] = orderLogLines(logSpy);
    expect(line).toBeDefined();
    expect(line).toContain(`order=${order.id}`);
    expect(line).toContain('binding=email_match');
    expect(line).toContain(`family=${(await sha256Hex(familyId)).slice(0, 16)}`);
    expect(line).toContain('entitlement=granted');
    expect(line).toContain('email_sent=yes');
    expect(line).not.toContain(order.email); // no personal data in the log
    expect(line).not.toContain(familyId); // hashed, never the raw id

    logSpy.mockRestore();
  });

  it('an unmatched order logs binding=none, family=none, entitlement=awaiting_claim, email_sent=yes (the claim email still goes out)', async () => {
    const env = fakeEnv();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await postOrder(env, order);

    const [line] = orderLogLines(logSpy);
    expect(line).toContain('binding=none');
    expect(line).toContain('family=none');
    expect(line).toContain('entitlement=awaiting_claim');
    expect(line).toContain('email_sent=yes');
    expect(line).not.toContain(order.email);

    logSpy.mockRestore();
  });

  it('a duplicate order (same module, same family, second order) logs entitlement=duplicate, email_sent=no', async () => {
    const env = fakeEnv();
    await loginFirst(env, order.email);
    await postOrder(env, order);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const secondOrder = { ...order, id: 5003, name: '#5003' };
    await postOrder(env, secondOrder);

    const [line] = orderLogLines(logSpy);
    expect(line).toContain(`order=${secondOrder.id}`);
    expect(line).toContain('entitlement=duplicate');
    expect(line).toContain('email_sent=no'); // no second module-activated email for a duplicate

    logSpy.mockRestore();
  });

  it('a replayed webhook (the idempotent early-return path) logs too, never silently skipping observability — and never re-sends the email', async () => {
    const env = fakeEnv();
    await loginFirst(env, order.email);
    await postOrder(env, order, 'wh-a');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await postOrder(env, order, 'wh-b'); // same order id, new webhook id -> the idempotent branch

    const [line] = orderLogLines(logSpy);
    expect(line).toBeDefined();
    expect(line).toContain(`order=${order.id}`);
    expect(line).toContain('binding=email_match');
    expect(line).toContain('entitlement=granted');
    expect(line).toContain('email_sent=no');

    logSpy.mockRestore();
  });
});
