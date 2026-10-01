import { sendEmailWithConsent } from '../emailGate.js';
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
import { hmacHex, randomToken, sha256Hex } from '../util.js';
import { loginUrl, claimUrl } from '../links.js';

const CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // AD-16 §2: "valid 30 days"

type OrderOutcome = 'granted' | 'duplicate' | 'revoked' | 'awaiting_claim' | 'needs_review' | 'none';

function orderOutcome(doc: OrderDoc): OrderOutcome {
  // `revoked` (refunds/create) isn't one of this webhook's own outcomes, but an orders/paid
  // replay for an order that's SINCE been refunded still reads an existing doc in that state —
  // reporting it accurately here beats a silent `none` that would look like nothing happened.
  if (doc.bindingState === 'bound') return doc.entitlementState === 'none' ? 'none' : doc.entitlementState;
  if (doc.bindingState === 'awaiting_claim' || doc.bindingState === 'needs_review') return doc.bindingState;
  return 'none';
}

/**
 * Post-launch-check (Founder): one Cloud-Logging line per webhook call that reaches a decision
 * on an order, greppable by order id (`~/nz order <id>` from Cloud Shell — no Firestore console
 * needed). Fires from BOTH the fresh-order path below and the idempotent-replay early return, so
 * `binding` can legitimately show any of the schema's four `BindingMethod` values — a replay can
 * land after staff have since bound the same order by claim or admin action, not only by this
 * webhook's own token/email_match logic. No personal data: never the email, never the raw family
 * id (only its SHA-256, truncated — enough to correlate repeated log lines for the same family
 * without being a usable identifier on its own).
 */
async function logOrderProcessed(orderId: string, doc: OrderDoc, emailSent: boolean): Promise<void> {
  const familyHash = doc.familyId ? (await sha256Hex(doc.familyId)).slice(0, 16) : 'none';
  console.log(
    `[order] order=${orderId} binding=${doc.bindingMethod ?? 'none'} family=${familyHash} entitlement=${orderOutcome(doc)} email_sent=${emailSent ? 'yes' : 'no'}`,
  );
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
    // A replay never re-sends an email (whatever went out, went out on the original call).
    await logOrderProcessed(orderId, existingOrder, false);
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
    // ---- READS (every one of them, before any write — real Firestore transactions require
    // this exact ordering; MemoryDb's own runTransaction now enforces it too, see its comment). ----
    const intentPath = tokenHash ? purchaseIntentPath(tokenHash) : null;
    const intent = intentPath ? await tx.get<PurchaseIntentDoc>(intentPath) : null;
    const tokenBindingValid =
      !!intent && !intent.redeemedAt && new Date(intent.expiresAt).getTime() > now.getTime() && moduleIds.includes(intent.moduleId);

    let familyId: string | null = tokenBindingValid ? intent!.familyId : null;
    let bindingMethod: BindingMethod | null = tokenBindingValid ? 'token' : null;

    const indexEntry = !familyId && emailHash ? await tx.get<EmailIndexDoc>(emailIndexPath(emailHash)) : null;
    if (!familyId && indexEntry) {
      familyId = indexEntry.familyId;
      bindingMethod = 'email_match';
    }

    // Reading these unconditionally (never gated on whether the moduleId turns out to need a
    // write) is what keeps this loop's reads separate from — and entirely before — its writes,
    // even though only SOME of them end up used below.
    const existingEntitlements = new Map<string, EntitlementDoc | null>();
    const existingTrials = new Map<string, TrialDoc | null>();
    if (familyId) {
      for (const moduleId of moduleIds) {
        existingEntitlements.set(moduleId, await tx.get<EntitlementDoc>(entitlementPath(familyId, moduleId)));
        existingTrials.set(moduleId, await tx.get<TrialDoc>(trialPath(familyId, moduleId)));
      }
    }

    // ---- DECIDE (pure computation from the reads above — no further reads or writes yet). ----
    let bindingState: BindingState;
    let claim: { token: string; hash: string } | null = null;
    let claimDoc: ClaimDoc | null = null;
    if (familyId) {
      bindingState = 'bound';
    } else if (email) {
      bindingState = 'awaiting_claim';
      const claimToken = randomToken(32);
      const claimHash = await hmacHex(claimToken, env.AUTH_PEPPER);
      claim = { token: claimToken, hash: claimHash };
      claimDoc = {
        orderId, createdAt: nowIso, expiresAt: new Date(now.getTime() + CLAIM_TTL_MS).toISOString(),
        redeemedAt: null, familyId: null,
      };
    } else {
      // AD-16 §2: "order email missing -> awaiting_claim cannot be emailed -> needs_review."
      bindingState = 'needs_review';
    }

    // AD-16 §2: "quantity above 1 -> one entitlement, order flagged needs_review" — a bound
    // order still grants normally below; the flag is purely for staff attention.
    if (totalQuantity > matched.length) bindingState = 'needs_review';

    let entitlementState: EntitlementState = 'none';
    let trialConverted = false;
    const entitlementWrites: { path: string; doc: EntitlementDoc }[] = [];
    const trialWrites: { path: string; doc: TrialDoc }[] = [];
    if (familyId) {
      for (const moduleId of moduleIds) {
        const existingEnt = existingEntitlements.get(moduleId) ?? null;
        if (existingEnt && existingEnt.status === 'active') {
          entitlementState = 'duplicate';
          continue;
        }
        const ent: EntitlementDoc = { status: 'active', shopifyOrderId: orderId, grantedAt: nowIso, revokedAt: null, revokedReason: null };
        entitlementWrites.push({ path: entitlementPath(familyId, moduleId), doc: ent });
        entitlementState = entitlementState === 'duplicate' ? 'duplicate' : 'granted';

        const trial = existingTrials.get(moduleId) ?? null;
        if (trial && !trial.convertedAt) {
          trialWrites.push({ path: trialPath(familyId, moduleId), doc: { ...trial, convertedAt: nowIso, convertedOrderId: orderId } });
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

    // ---- WRITES (every read above has already happened). ----
    if (tokenBindingValid) tx.set(intentPath!, { ...intent!, redeemedAt: nowIso, orderId });
    if (claimDoc) tx.set(claimPath(claim!.hash), claimDoc);
    for (const w of entitlementWrites) tx.set(w.path, w.doc);
    for (const w of trialWrites) tx.set(w.path, w.doc);
    tx.set(orderPath(orderId), doc);

    return { doc, claim };
  });

  await writeAuditLog(env, {
    actor: 'system:webhook', action: `order_${result.doc.bindingState}`, targetType: 'order', targetId: orderId,
    before: null, after: result.doc, reason: null,
  });

  let emailSent = false;
  if (result.doc.bindingState === 'bound' && result.doc.entitlementState === 'granted' && result.doc.familyId) {
    const family = await getFamily(env, result.doc.familyId);
    if (family) {
      await sendEmailWithConsent(env, moduleActivatedEmail(family.email, loginUrl(env), env.BEGINNER_LAUNCH === '1'));
      emailSent = true;
    }
  } else if (result.claim && email) {
    await sendEmailWithConsent(env, claimYourPurchaseEmail(email, result.doc.orderName, claimUrl(env, result.claim.token), env.BEGINNER_LAUNCH === '1'));
    emailSent = true;
  }
  await logOrderProcessed(orderId, result.doc, emailSent);

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
    // Reads first — a multi-module order (more than one `moduleId` here) would otherwise read
    // module 2's entitlement AFTER module 1's write, the same class of bug the orders/paid
    // transaction above had.
    const existingEntitlements = new Map<string, EntitlementDoc | null>();
    for (const moduleId of moduleIds) {
      existingEntitlements.set(moduleId, await tx.get<EntitlementDoc>(entitlementPath(order.familyId!, moduleId)));
    }

    for (const moduleId of moduleIds) {
      const ent = existingEntitlements.get(moduleId) ?? null;
      if (ent && ent.status === 'active') {
        tx.set(entitlementPath(order.familyId!, moduleId), { ...ent, status: 'revoked', revokedAt: now, revokedReason: 'refund' });
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
