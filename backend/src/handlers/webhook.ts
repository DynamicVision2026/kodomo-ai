import type { Env } from '../types.js';
import type {
  BindingMethod, BindingState, ClaimDoc, EntitlementDoc, EntitlementState, OrderDoc, OrderLine,
  PurchaseIntentDoc, TrialDoc,
} from '../schema.js';
import type { EmailIndexDoc } from '../schema.js';
import { claimPath, emailIndexPath, emptyRefundInfo, entitlementPath, orderPath, purchaseIntentPath, trialPath } from '../schema.js';
import {
  matchLineItems,
  matchRefundedModuleIds,
  purchaserEmail,
  purchaseIntentToken,
  verifyShopifyWebhook,
  type ShopifyOrderPayload,
  type ShopifyRefundPayload,
} from '../shopify.js';
import { emailHashOf, getFamily, normalizeEmail } from '../family.js';
import { claimYourPurchaseEmail, moduleActivatedEmail } from '../email.js';
import { writeAuditLog } from '../audit.js';
import { hmacHex, randomToken } from '../util.js';

const CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // AD-16 §2: "valid 30 days"

function loginUrl(env: Env): string {
  return `${env.APP_ORIGIN ?? ''}/login`;
}
function claimUrl(env: Env, token: string): string {
  return `${env.APP_ORIGIN ?? ''}/claim?token=${encodeURIComponent(token)}`;
}

/**
 * POST /webhooks/shopify/orders-paid — AD-16 §1-§4. AD-14 boundary: an order with no allowlisted
 * (`kodomo-ai-m1`) line item is a pure 200 with NOTHING written — no order, no family, no email —
 * so `KD-ANNUAL`/`KD-BUYOUT`/`SOULID-*` orders never touch this backend at all.
 *
 * Resolution order (AD-16 §1/§2): a valid purchase-intent token binds first; otherwise a
 * purchaser email matching an EXISTING family binds by email; otherwise the order is NEVER
 * auto-bound — the family is not created, and the purchaser gets a claim email instead (or, with
 * no email at all to send one to, the order is simply flagged `needs_review` for staff).
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
    // Every non-NazeHori product (KD-*, SOULID-*, anything else) lands here every time — no
    // order record, no family, no email, ever.
    return new Response('ok (no matched line items)', { status: 200 });
  }

  const webhookId = request.headers.get('X-Shopify-Webhook-Id') ?? '';
  const orderId = String(order.id);
  const now = new Date();
  const nowIso = now.toISOString();

  // AD-14: "log variant_id for audit" — independent of whatever this webhook decides below.
  for (const item of matched) {
    console.log(`[webhook] orders/paid audit: order=${orderId} sku=${item.sku} variant_id=${item.variantId ?? 'null'} moduleIds=${item.moduleIds.join(',')}`);
  }

  const existingOrder = await env.db.get<OrderDoc>(orderPath(orderId));
  if (existingOrder) {
    if (webhookId && !existingOrder.webhookIds.includes(webhookId)) {
      await env.db.set(orderPath(orderId), { ...existingOrder, webhookIds: [...existingOrder.webhookIds, webhookId] });
    }
    return new Response(JSON.stringify({ ok: true, bindingState: existingOrder.bindingState }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }

  const email = purchaserEmail(order);
  const moduleIds = [...new Set(matched.flatMap((m) => m.moduleIds))];
  const lines: OrderLine[] = matched.map((m) => ({
    sku: m.sku, variantId: m.variantId, moduleId: m.moduleIds[0]!, quantity: m.quantity, lineTotal: m.lineTotal,
  }));
  const totalQuantity = matched.reduce((sum, m) => sum + m.quantity, 0);
  const token = purchaseIntentToken(order);
  const tokenHash = token ? await hmacHex(token, env.AUTH_PEPPER) : null;
  const emailHash = email ? await emailHashOf(email) : null;

  const result = await env.db.runTransaction(async (tx) => {
    let familyId: string | null = null;
    let bindingMethod: BindingMethod | null = null;

    if (tokenHash) {
      const intentPath = purchaseIntentPath(tokenHash);
      const intent = await tx.get<PurchaseIntentDoc>(intentPath);
      if (intent && !intent.redeemedAt && new Date(intent.expiresAt).getTime() > now.getTime() && moduleIds.includes(intent.moduleId)) {
        tx.set(intentPath, { ...intent, redeemedAt: nowIso, orderId });
        familyId = intent.familyId;
        bindingMethod = 'token';
      }
    }

    if (!familyId && emailHash) {
      const indexEntry = await tx.get<EmailIndexDoc>(emailIndexPath(emailHash));
      if (indexEntry) {
        familyId = indexEntry.familyId;
        bindingMethod = 'email_match';
      }
    }

    let bindingState: BindingState;
    let claim: { token: string; hash: string } | null = null;
    if (familyId) {
      bindingState = 'bound';
    } else if (email) {
      bindingState = 'awaiting_claim';
      const claimToken = randomToken(32);
      const claimHash = await hmacHex(claimToken, env.AUTH_PEPPER);
      claim = { token: claimToken, hash: claimHash };
      tx.set(claimPath(claimHash), {
        orderId, createdAt: nowIso, expiresAt: new Date(now.getTime() + CLAIM_TTL_MS).toISOString(),
        redeemedAt: null, familyId: null,
      } satisfies ClaimDoc);
    } else {
      // AD-16 §2: "order email missing -> awaiting_claim cannot be emailed -> needs_review."
      bindingState = 'needs_review';
    }

    // AD-16 §2: "quantity above 1 -> one entitlement, order flagged needs_review" — a bound
    // order still grants normally below; the flag is purely for staff attention.
    if (totalQuantity > matched.length) bindingState = 'needs_review';

    let entitlementState: EntitlementState = 'none';
    let trialConverted = false;
    if (familyId) {
      for (const moduleId of moduleIds) {
        const entPath = entitlementPath(familyId, moduleId);
        const existingEnt = await tx.get<EntitlementDoc>(entPath);
        if (existingEnt && existingEnt.status === 'active') {
          entitlementState = 'duplicate';
          continue;
        }
        const ent: EntitlementDoc = { status: 'active', shopifyOrderId: orderId, grantedAt: nowIso, revokedAt: null, revokedReason: null };
        tx.set(entPath, ent);
        entitlementState = entitlementState === 'duplicate' ? 'duplicate' : 'granted';

        const trialDocPath = trialPath(familyId, moduleId);
        const trial = await tx.get<TrialDoc>(trialDocPath);
        if (trial && !trial.convertedAt) {
          tx.set(trialDocPath, { ...trial, convertedAt: nowIso, convertedOrderId: orderId });
          trialConverted = true;
        }
      }
    }

    const doc: OrderDoc = {
      shopifyOrderId: orderId,
      orderName: order.name,
      lines,
      currency: order.currency,
      financialStatus: order.financial_status,
      shopifyCreatedAt: order.created_at,
      paidAt: nowIso,
      purchaserEmail: email ? normalizeEmail(email) : null,
      familyId,
      bindingMethod,
      bindingState,
      entitlementState,
      trialConverted,
      refund: emptyRefundInfo(),
      webhookIds: webhookId ? [webhookId] : [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    tx.set(orderPath(orderId), doc);

    return { doc, claim };
  });

  await writeAuditLog(env, {
    actor: 'system:webhook', action: `order_${result.doc.bindingState}`, targetType: 'order', targetId: orderId,
    before: null, after: result.doc, reason: null,
  });

  if (result.doc.bindingState === 'bound' && result.doc.entitlementState === 'granted' && result.doc.familyId) {
    const family = await getFamily(env, result.doc.familyId);
    if (family) await env.email.send(moduleActivatedEmail(family.email, loginUrl(env)));
  } else if (result.claim && email) {
    await env.email.send(claimYourPurchaseEmail(email, result.doc.orderName, claimUrl(env, result.claim.token)));
  }

  return new Response(JSON.stringify({ ok: true, bindingState: result.doc.bindingState }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * POST /webhooks/shopify/refunds-create — AD-16 §7: updates the order's refund state, revokes
 * the matching entitlement (`reason: 'refund'`), keeps the account/progress untouched, and
 * writes an audit entry. A refund on an order this Worker never attributed to a family
 * (`awaiting_claim`/`needs_review`) is a no-op here too — nothing to revoke yet.
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
  const before = order;
  const after = await env.db.runTransaction(async (tx) => {
    for (const moduleId of moduleIds) {
      const entPath = entitlementPath(order.familyId!, moduleId);
      const ent = await tx.get<EntitlementDoc>(entPath);
      if (ent && ent.status === 'active') {
        tx.set(entPath, { ...ent, status: 'revoked', revokedAt: now, revokedReason: 'refund' });
      }
    }
    const updated: OrderDoc = {
      ...order,
      entitlementState: 'revoked',
      refund: { ...order.refund, state: 'refunded', refundedAt: now, shopifyRefundIds: [...order.refund.shopifyRefundIds, String(refund.id)] },
      updatedAt: now,
    };
    tx.set(orderPath(orderId), updated);
    return updated;
  });

  await writeAuditLog(env, {
    actor: 'system:webhook', action: 'order_refunded', targetType: 'order', targetId: orderId, before, after, reason: null,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}
