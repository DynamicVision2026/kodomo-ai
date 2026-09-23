import type { Env } from '../types.js';
import type { PurchaseIntentDoc } from '../schema.js';
import { purchaseIntentPath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { hmacHex, randomToken } from '../util.js';
import { SKU_TO_MODULE_IDS } from '../shopify.js';

const PURCHASE_INTENT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // AD-16 §1: "+14 days"

const KNOWN_MODULE_IDS = new Set(Object.values(SKU_TO_MODULE_IDS).flat());

/**
 * POST /api/v1/purchase-intents — AD-16 §1 step 1-2. Session required (the intent is bound to
 * THIS family, server-side, right now — never to a `family_id` the client could assert later).
 * The token itself is 256 bits of `crypto.getRandomValues` randomness; only its HMAC (keyed by
 * AUTH_PEPPER, same construction as every other bearer-token hash in this codebase — see
 * backend/src/session.ts) is ever stored, at `purchaseIntents/{hash}`. Returns a Shopify cart
 * permalink carrying the raw token as a cart attribute — deliberately no `family_id` and no email
 * prefill in that URL (AD-16 §1: "whoever pays types their own email... purchaser contact
 * information only").
 */
export async function handleCreatePurchaseIntent(request: Request, env: Env): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  let body: { moduleId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  if (typeof body.moduleId !== 'string' || !KNOWN_MODULE_IDS.has(body.moduleId)) {
    return new Response('moduleId must be a known module', { status: 400 });
  }
  const moduleId = body.moduleId;

  const variantId = env.SHOPIFY_VARIANT_IDS?.[moduleId];
  if (!env.SHOPIFY_SHOP_DOMAIN || !variantId) {
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const token = randomToken(32);
  const tokenHash = await hmacHex(token, env.AUTH_PEPPER);
  const now = new Date();
  const doc: PurchaseIntentDoc = {
    familyId: resolved.session.familyId,
    moduleId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PURCHASE_INTENT_TTL_MS).toISOString(),
    redeemedAt: null,
    orderId: null,
  };
  await env.db.set(purchaseIntentPath(tokenHash), doc);

  const url = `https://${env.SHOPIFY_SHOP_DOMAIN}/cart/${variantId}:1?attributes%5Bdomo_pt%5D=${encodeURIComponent(token)}`;
  return new Response(JSON.stringify({ url, expiresAt: doc.expiresAt }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}
