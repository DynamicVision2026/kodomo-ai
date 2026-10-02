import type { Env } from './types.js';
import type { OrderDoc, RefundEligibilitySnapshot, RefundPolicyDoc, UsageDoc } from './schema.js';
import { refundPolicyPath, usagePath } from './schema.js';

/** COPY-02 (Founder, 2 Oct 2026): "The normal refund window is now 3 days after payment, not 10."
 *  Supersedes AD-16 §7's original 10-day placeholder (never finalized — see this doc's own prior
 *  comment history) now that the Lesson 1-free-sample/Lessons 2-7 model has a real, approved
 *  refund policy. Until staff configure `config/refundPolicy` in Firestore, this is the default
 *  every `computeEligibilitySnapshot` call (including the admin dashboard's "refund eligible"
 *  field) uses. The legal TEXT of the policy lives in src/legal/consentText.ts's own COPY-02
 *  exports; this is only the numbers a snapshot computation needs. */
const DEFAULT_POLICY: RefundPolicyDoc = { windowDays: 3, requiresNoPaidUse: true, version: 'copy-02' };

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
