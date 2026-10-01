import type { Env } from './types.js';
import type { ClaimDoc, EntitlementDoc, OrderDoc, TrialDoc } from './schema.js';
import { claimPath, entitlementPath, orderPath, ordersCollection, trialPath } from './schema.js';
import { normalizeEmail } from './family.js';
import { writeAuditLog } from './audit.js';
import { moduleActivatedEmail } from './email.js';
import { sendEmailWithConsent } from './emailGate.js';
import { activationLoginUrl } from './links.js';

/**
 * Consent at login (PURCHASE-FLOW.md v2): when a family logs in with a VERIFIED email, any paid
 * order still waiting for an owner (`awaiting_claim`) whose purchaser email matches that address
 * is bound to the family right then — same entitlement/trial-conversion rules as a claim
 * confirm (handlers/claims.ts), recorded as `email_match` (the purchaser email IS the verified
 * login email). Returns the orders that were bound. Never throws into the login path.
 */
export async function bindUnboundOrdersOnLogin(env: Env, familyId: string, rawEmail: string): Promise<OrderDoc[]> {
  const email = normalizeEmail(rawEmail);
  const waiting = await env.db.query<OrderDoc>(ordersCollection(), 'bindingState', 'awaiting_claim');
  const mine = waiting.filter((o) => o.data.purchaserEmail && normalizeEmail(o.data.purchaserEmail) === email);
  const bound: OrderDoc[] = [];

  for (const { id } of mine) {
    const claims = await env.db.query<ClaimDoc>('claims', 'orderId', id);
    const now = new Date().toISOString();
    const result = await env.db.runTransaction(async (tx) => {
      const order = await tx.get<OrderDoc>(orderPath(id));
      if (!order || order.bindingState !== 'awaiting_claim') return null;
      const claimDocs = await Promise.all(claims.map((c) => tx.get<ClaimDoc>(claimPath(c.id))));
      const ents = new Map<string, EntitlementDoc | null>();
      const trials = new Map<string, TrialDoc | null>();
      for (const line of order.lines) {
        ents.set(line.moduleId, await tx.get<EntitlementDoc>(entitlementPath(familyId, line.moduleId)));
        trials.set(line.moduleId, await tx.get<TrialDoc>(trialPath(familyId, line.moduleId)));
      }

      let entitlementState: OrderDoc['entitlementState'] = 'none';
      let trialConverted = false;
      const writes: (() => void)[] = [];
      for (const line of order.lines) {
        const existing = ents.get(line.moduleId) ?? null;
        if (existing && existing.status === 'active') { entitlementState = 'duplicate'; continue; }
        const ent: EntitlementDoc = { status: 'active', shopifyOrderId: order.shopifyOrderId, grantedAt: now, revokedAt: null, revokedReason: null };
        writes.push(() => tx.set(entitlementPath(familyId, line.moduleId), ent));
        entitlementState = entitlementState === 'duplicate' ? 'duplicate' : 'granted';
        const trial = trials.get(line.moduleId) ?? null;
        if (trial && !trial.convertedAt) {
          writes.push(() => tx.set(trialPath(familyId, line.moduleId), { ...trial, convertedAt: now, convertedOrderId: order.shopifyOrderId }));
          trialConverted = true;
        }
      }
      const updated: OrderDoc = { ...order, familyId, bindingMethod: 'email_match', bindingState: 'bound', entitlementState, trialConverted, updatedAt: now };
      for (const w of writes) w();
      tx.set(orderPath(id), updated);
      claims.forEach((c, i) => {
        const doc = claimDocs[i];
        if (doc && !doc.redeemedAt) tx.set(claimPath(c.id), { ...doc, redeemedAt: now, familyId });
      });
      return updated;
    });
    if (!result) continue;
    bound.push(result);
    await writeAuditLog(env, {
      actor: 'system:login', action: 'order_bound_on_login', targetType: 'order', targetId: result.shopifyOrderId,
      before: null, after: result, reason: null,
    });
  }

  if (bound.some((o) => o.entitlementState === 'granted')) {
    await sendEmailWithConsent(env, moduleActivatedEmail(email, activationLoginUrl(env, email), env.BEGINNER_LAUNCH === '1'));
  }
  return bound;
}
