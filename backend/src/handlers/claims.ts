import type { Env } from '../types.js';
import type { ClaimDoc, EntitlementDoc, OrderDoc, TrialDoc } from '../schema.js';
import { claimPath, entitlementPath, orderPath, trialPath } from '../schema.js';
import { resolveSession } from '../session.js';
import { passesCsrfCheck } from '../csrf.js';
import { hmacHex } from '../util.js';
import { writeAuditLog } from '../audit.js';
import { moduleActivatedEmail } from '../email.js';
import { getFamily } from '../family.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function loginUrl(env: Env): string {
  return `${env.APP_ORIGIN ?? ''}/login`;
}

async function loadValidClaim(env: Env, token: string): Promise<{ hash: string; claim: ClaimDoc; order: OrderDoc } | null> {
  const hash = await hmacHex(token, env.AUTH_PEPPER);
  const claim = await env.db.get<ClaimDoc>(claimPath(hash));
  if (!claim || claim.redeemedAt || new Date(claim.expiresAt).getTime() <= Date.now()) return null;
  const order = await env.db.get<OrderDoc>(orderPath(claim.orderId));
  if (!order) return null;
  return { hash, claim, order };
}

/** GET /api/v1/claims/{token} — AD-16 §2: the /claim screen's own data (order number, product),
 *  requires a logged-in session (the page itself explains why: "log in as the account your child
 *  uses"). Never reveals anything about an invalid/expired/already-redeemed token beyond 404. */
export async function handleGetClaim(request: Request, env: Env, token: string): Promise<Response> {
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });

  const valid = await loadValidClaim(env, token);
  if (!valid) return new Response('not found', { status: 404 });

  return jsonResponse({ orderName: valid.order.orderName, moduleIds: valid.order.lines.map((l) => l.moduleId) });
}

/**
 * POST /api/v1/claims/{token} — AD-16 §2 step "one confirm tap binds the order." Binds to the
 * CALLER's own session family — never a family id the client supplies — mirroring exactly how
 * the webhook's own token/email_match binding works (see backend/src/handlers/webhook.ts).
 */
export async function handleConfirmClaim(request: Request, env: Env, token: string): Promise<Response> {
  if (!passesCsrfCheck(request, env)) return new Response('forbidden', { status: 403 });
  const resolved = await resolveSession(env, request);
  if (!resolved) return new Response('unauthorized', { status: 401 });
  const familyId = resolved.session.familyId;

  const hash = await hmacHex(token, env.AUTH_PEPPER);
  const now = new Date().toISOString();

  const result = await env.db.runTransaction(async (tx) => {
    const claim = await tx.get<ClaimDoc>(claimPath(hash));
    if (!claim || claim.redeemedAt || new Date(claim.expiresAt).getTime() <= Date.now()) return { ok: false as const };
    const order = await tx.get<OrderDoc>(orderPath(claim.orderId));
    if (!order || order.bindingState !== 'awaiting_claim') return { ok: false as const };

    tx.set(claimPath(hash), { ...claim, redeemedAt: now, familyId });

    let entitlementState: OrderDoc['entitlementState'] = 'none';
    let trialConverted = false;
    for (const line of order.lines) {
      const entPath = entitlementPath(familyId, line.moduleId);
      const existingEnt = await tx.get<EntitlementDoc>(entPath);
      if (existingEnt && existingEnt.status === 'active') {
        entitlementState = 'duplicate';
        continue;
      }
      const ent: EntitlementDoc = { status: 'active', shopifyOrderId: order.shopifyOrderId, grantedAt: now, revokedAt: null, revokedReason: null };
      tx.set(entPath, ent);
      entitlementState = entitlementState === 'duplicate' ? 'duplicate' : 'granted';

      const trialDocPath = trialPath(familyId, line.moduleId);
      const trial = await tx.get<TrialDoc>(trialDocPath);
      if (trial && !trial.convertedAt) {
        tx.set(trialDocPath, { ...trial, convertedAt: now, convertedOrderId: order.shopifyOrderId });
        trialConverted = true;
      }
    }

    const updatedOrder: OrderDoc = {
      ...order, familyId, bindingMethod: 'claim', bindingState: 'bound', entitlementState, trialConverted, updatedAt: now,
    };
    tx.set(orderPath(order.shopifyOrderId), updatedOrder);
    return { ok: true as const, order: updatedOrder };
  });

  if (!result.ok) return new Response(JSON.stringify({ error: 'invalid_or_expired' }), { status: 410, headers: { 'content-type': 'application/json' } });

  await writeAuditLog(env, {
    actor: 'system:api', action: 'order_claimed', targetType: 'order', targetId: result.order.shopifyOrderId,
    before: null, after: result.order, reason: null,
  });

  if (result.order.entitlementState === 'granted') {
    const family = await getFamily(env, familyId);
    if (family) await env.email.send(moduleActivatedEmail(family.email, loginUrl(env)));
  }

  return jsonResponse({ ok: true, orderName: result.order.orderName });
}
