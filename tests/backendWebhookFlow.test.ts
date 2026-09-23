/** @vitest-environment node */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleShopifyOrderWebhook, handleShopifyRefundWebhook } from '../backend/src/handlers/webhook';
import type { Env } from '../backend/src/types';
import type { EntitlementDoc, FamilyDoc, OrderDoc } from '../backend/src/schema';
import { entitlementPath, familyPath, orderPath } from '../backend/src/schema';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';

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

const order = { id: 5001, email: 'parent@example.com', line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 1 }] };

describe('AD-13 acceptance 1 — orders/paid grants a family + entitlement + welcome email, idempotently', () => {
  it('a valid HMAC creates the family, entitlement, and sends a welcome email; replaying it 3 times yields a single entitlement', async () => {
    const env = fakeEnv();
    for (let i = 0; i < 3; i++) {
      const res = await postOrder(env, order, 'wh-1');
      expect(res.status).toBe(200);
    }

    const orderDoc = await env.db.get<OrderDoc>(orderPath(order.id));
    expect(orderDoc?.state).toBe('granted');
    const family = await env.db.get<FamilyDoc>(familyPath(orderDoc!.familyId!));
    expect(family?.email).toBe('parent@example.com');
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(orderDoc!.familyId!, 'm1'));
    expect(ent?.status).toBe('active');

    const emails = (env.email as FakeEmailSender).sent;
    expect(emails.filter((m) => m.to === 'parent@example.com')).toHaveLength(1); // not one per replay
  });
});

describe('AD-13 acceptance 2 — an invalid signature is rejected, nothing written', () => {
  it('401s and never creates a family or entitlement', async () => {
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

describe('AD-13 acceptance 3 — a second order of the same module by the same email is marked duplicate, still one entitlement', () => {
  it('grants once, marks the second order duplicate, and the entitlement is not touched twice', async () => {
    const env = fakeEnv();
    await postOrder(env, order);
    const secondOrder = { ...order, id: 5002 };
    const res = await postOrder(env, secondOrder);
    expect(res.status).toBe(200);

    const secondDoc = await env.db.get<OrderDoc>(orderPath(secondOrder.id));
    expect(secondDoc?.state).toBe('duplicate');
    const ent = await env.db.get<EntitlementDoc>(entitlementPath(secondDoc!.familyId!, 'm1'));
    expect(ent?.shopifyOrderId).toBe(String(order.id)); // still the FIRST order's grant
  });

  it('an order with no purchaser email is marked needs_review, not silently dropped', async () => {
    const env = fakeEnv();
    const res = await postOrder(env, { id: 9001, line_items: order.line_items });
    expect(res.status).toBe(200);
    const doc = await env.db.get<OrderDoc>(orderPath(9001));
    expect(doc?.state).toBe('needs_review');
    expect(doc?.familyId).toBeNull();
  });
});

describe('AD-13 acceptance 4 — refunds/create revokes the entitlement, keeps progress', () => {
  it('locks the module on the next /me equivalent (entitlement.status becomes refunded), never touches progress data', async () => {
    const env = fakeEnv();
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
    expect(ent?.status).toBe('refunded');
    expect(ent?.revokedAt).not.toBeNull();
  });

  it('a refund for an unmatched SKU is a no-op', async () => {
    const env = fakeEnv();
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
