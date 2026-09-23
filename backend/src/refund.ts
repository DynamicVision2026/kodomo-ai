import type { Env } from './types.js';
import type { OrderDoc, RefundEligibilitySnapshot, RefundPolicyDoc, UsageDoc } from './schema.js';
import { refundPolicyPath, usagePath } from './schema.js';

/** AD-16 §7: `config/refundPolicy` — until staff actually configure it in Firestore, this is the
 *  policy AD-16 itself specifies (10 days, usage-contingent). The legal TEXT of the policy lives
 *  elsewhere (AD-16 §12); this is only the numbers a snapshot computation needs. */
const DEFAULT_POLICY: RefundPolicyDoc = { windowDays: 10, requiresNoPaidUse: true, version: 'ad16-default' };

export async function getRefundPolicy(env: Env): Promise<RefundPolicyDoc> {
  return (await env.db.get<RefundPolicyDoc>(refundPolicyPath())) ?? DEFAULT_POLICY;
}

/**
 * AD-16 §7: "the backend then FREEZES an eligibilitySnapshot" — computed once, at the moment
 * staff record the request (`requestedAt`), never recomputed afterward even if usage changes
 * later. `objectivelyEligible` is evidence for staff, never an automatic approval — approval/
 * decline is always a separate, explicit staff action (backend/src/handlers/admin/refunds.ts).
 */
export async function computeEligibilitySnapshot(
  env: Env,
  order: Pick<OrderDoc, 'paidAt' | 'lines' | 'familyId'>,
  requestedAt: Date,
): Promise<RefundEligibilitySnapshot> {
  const policy = await getRefundPolicy(env);
  const purchaseAgeMs = requestedAt.getTime() - new Date(order.paidAt).getTime();
  const purchaseAgeDays = Math.floor(purchaseAgeMs / (24 * 60 * 60 * 1000));
  const withinWindow = purchaseAgeDays <= policy.windowDays;

  let firstPaidUseAt: string | null = null;
  if (order.familyId) {
    for (const line of order.lines) {
      const usage = await env.db.get<UsageDoc>(usagePath(order.familyId, line.moduleId));
      if (usage && (!firstPaidUseAt || usage.firstPaidUseAt < firstPaidUseAt)) firstPaidUseAt = usage.firstPaidUseAt;
    }
  }
  const paidContentUsed = !!firstPaidUseAt && new Date(firstPaidUseAt).getTime() < requestedAt.getTime();
  const objectivelyEligible = withinWindow && (!policy.requiresNoPaidUse || !paidContentUsed);

  return {
    purchaseAgeDays, withinWindow, paidContentUsed, firstPaidUseAt, objectivelyEligible,
    policyVersion: policy.version, frozenAt: requestedAt.toISOString(),
  };
}
