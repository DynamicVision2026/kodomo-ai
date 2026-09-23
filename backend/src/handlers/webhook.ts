import type { Env } from '../types.js';
import type { EntitlementDoc, OrderDoc, OrderState } from '../schema.js';
import { entitlementPath, orderPath } from '../schema.js';
import {
  matchLineItems,
  matchRefundedModuleIds,
  purchaserEmail,
  verifyShopifyWebhook,
  type ShopifyOrderPayload,
  type ShopifyRefundPayload,
} from '../shopify.js';
import { getOrCreateFamilyIdInTx } from '../family.js';
import { welcomeEmail } from '../email.js';

function loginUrl(env: Env, email: string): string {
  const base = env.APP_ORIGIN ?? '';
  return `${base}/login?email=${encodeURIComponent(email)}`;
}

/**
 * POST /webhooks/shopify/orders-paid — AD-13 §3/§5 step 1: "creates or finds the family and
 * grants one entitlement per purchased module." Always answers 2xx for a well-formed,
 * correctly-signed request — even one with zero matched line items or a missing email — so
 * Shopify never retry-storms this over a delivery that never needed action or that this Worker
 * has already flagged for manual review. AD-14: routing is exact-SKU only (matchLineItems),
 * every unrelated line item is ignored, and each matched item's `variant_id` is both logged and
 * persisted on the OrderDoc for audit.
 */
export async function handleShopifyOrderWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('X-Shopify-Hmac-Sha256') ?? '';
  const verified = await verifyShopifyWebhook(rawBody, signature, env.SHOPIFY_WEBHOOK_SECRET);
  if (!verified) return new Response('invalid signature', { status: 401 });

  let order: ShopifyOrderPayload;
  try {
    order = JSON.parse(rawBody) as ShopifyOrderPayload;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const matched = matchLineItems(order);
  if (matched.length === 0) {
    // Products A-D (or anything else not in SKU_TO_MODULE_IDS) land here every time and this
    // handler does nothing further — no family created, no entitlement, no email.
    return new Response('ok (no matched line items)', { status: 200 });
  }

  const moduleIds = [...new Set(matched.flatMap((m) => m.moduleIds))];
  const variantIds = matched.map((m) => m.variantId).filter((id): id is number => id !== null);
  const email = purchaserEmail(order);
  const webhookId = request.headers.get('X-Shopify-Webhook-Id') ?? '';
  const orderId = String(order.id);
  const now = new Date().toISOString();

  // AD-14: "log variant_id for audit" — one line per matched line item, independent of whatever
  // the transaction below decides (granted/duplicate/needs_review/already-processed) so the
  // audit trail exists even for a redelivery.
  for (const item of matched) {
    console.log(`[webhook] orders/paid audit: order=${orderId} sku=${item.sku} variant_id=${item.variantId ?? 'null'} moduleIds=${item.moduleIds.join(',')}`);
  }

  const result = await env.db.runTransaction(async (tx) => {
    const existing = await tx.get<OrderDoc>(orderPath(orderId));
    if (existing) {
      // Redelivery/retry of an order this Worker already processed — the entitlement (or its
      // absence, for `needs_review`) is never re-derived a second time from the same order id.
      if (webhookId && !existing.webhookIds.includes(webhookId)) {
        tx.set(orderPath(orderId), { ...existing, webhookIds: [...existing.webhookIds, webhookId] });
      }
      return { alreadyProcessed: true as const, state: existing.state, familyId: existing.familyId };
    }

    if (!email) {
      const doc: OrderDoc = { familyId: null, moduleIds, state: 'needs_review', webhookIds: webhookId ? [webhookId] : [], processedAt: now, variantIds };
      tx.set(orderPath(orderId), doc);
      return { alreadyProcessed: false as const, state: 'needs_review' as OrderState, familyId: null };
    }

    const { familyId } = await getOrCreateFamilyIdInTx(tx, email, now);
    let anyDuplicate = false;
    for (const moduleId of moduleIds) {
      const entPath = entitlementPath(familyId, moduleId);
      const existingEnt = await tx.get<EntitlementDoc>(entPath);
      if (existingEnt && existingEnt.status === 'active') {
        anyDuplicate = true; // this family already has this module active — never re-grant
        continue;
      }
      const ent: EntitlementDoc = { status: 'active', shopifyOrderId: orderId, grantedAt: now, revokedAt: null };
      tx.set(entPath, ent);
    }

    const state: OrderState = anyDuplicate ? 'duplicate' : 'granted';
    const doc: OrderDoc = { familyId, moduleIds, state, webhookIds: webhookId ? [webhookId] : [], processedAt: now, variantIds };
    tx.set(orderPath(orderId), doc);
    return { alreadyProcessed: false as const, state, familyId };
  });

  if (!result.alreadyProcessed && result.state === 'granted' && email) {
    await env.email.send(welcomeEmail(email, loginUrl(env, email)));
  }

  return new Response(JSON.stringify({ ok: true, state: result.state }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * POST /webhooks/shopify/refunds-create — AD-13 §3 "new subscription": revokes the matching
 * entitlement when a refunded line item carries the module's variant/SKU. A refund on an order
 * this Worker never attributed to a family (missing email at purchase time -> `needs_review`)
 * is a no-op here too — there is nothing to revoke, and support handles that order manually.
 */
export async function handleShopifyRefundWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('X-Shopify-Hmac-Sha256') ?? '';
  const verified = await verifyShopifyWebhook(rawBody, signature, env.SHOPIFY_WEBHOOK_SECRET);
  if (!verified) return new Response('invalid signature', { status: 401 });

  let refund: ShopifyRefundPayload;
  try {
    refund = JSON.parse(rawBody) as ShopifyRefundPayload;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const moduleIds = matchRefundedModuleIds(refund);
  if (moduleIds.length === 0) return new Response('ok (no matched line items)', { status: 200 });

  const orderId = String(refund.order_id);
  const order = await env.db.get<OrderDoc>(orderPath(orderId));
  if (!order || !order.familyId) return new Response('ok (order not attributed to a family)', { status: 200 });

  const now = new Date().toISOString();
  await env.db.runTransaction(async (tx) => {
    for (const moduleId of moduleIds) {
      const entPath = entitlementPath(order.familyId!, moduleId);
      const ent = await tx.get<EntitlementDoc>(entPath);
      if (ent && ent.status === 'active') {
        tx.set(entPath, { ...ent, status: 'refunded', revokedAt: now });
      }
    }
    tx.set(orderPath(orderId), { ...order, state: 'refunded' });
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}
