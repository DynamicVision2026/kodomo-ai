import type { Env, IssuedCode } from '../types';
import { generateFamilyCode } from '../codes';
import { matchLineItems, verifyShopifyWebhook, type ShopifyOrderPayload } from '../shopify';
import { addCodeToOrderIndex, getCodesForOrder, putIssuedCode } from '../store';
import { attachCodesToOrderMetafield } from '../shopifyAdmin';

const MAX_DEVICES = 5;

/**
 * POST /webhooks/shopify/orders-paid — the only entry point that ever issues a code from a
 * real purchase. Spec v0.5 §7: "Shopify order -> email with a family code."
 *
 * Always returns 2xx for a well-formed, correctly-signed request — even one with zero matched
 * line items (an order for products A-D only) — so Shopify never retry-storms this endpoint
 * over a delivery that never needed action. Only a bad signature is rejected outright.
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
    // Worker does nothing further — no KV write, no Admin API call, no email trigger.
    return new Response('ok (no matched line items)', { status: 200 });
  }

  // Idempotency: Shopify redelivers webhooks. If this exact order already has issued codes,
  // this is a redelivery (or a retry) — never mint a second code for the same purchase.
  const alreadyIssued = await getCodesForOrder(env, order.id);
  if (alreadyIssued.length > 0) {
    return new Response('ok (already processed)', { status: 200 });
  }

  const issuedCodes: string[] = [];
  for (const item of matched) {
    // One code per unit purchased, never one code silently shared across a quantity > 1.
    for (let i = 0; i < item.quantity; i++) {
      const code = generateFamilyCode();
      const record: IssuedCode = {
        code,
        moduleIds: item.moduleIds,
        founder: false,
        devices: [],
        maxDevices: MAX_DEVICES,
        issuedAt: new Date().toISOString(),
        shopifyOrderId: String(order.id),
      };
      await putIssuedCode(env, record);
      await addCodeToOrderIndex(env, order.id, code);
      issuedCodes.push(code);
    }
  }

  // Best-effort only — see shopifyAdmin.ts for why a failure here doesn't fail this request.
  await attachCodesToOrderMetafield(env, order.id, issuedCodes);

  return new Response(JSON.stringify({ ok: true, issued: issuedCodes.length }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
