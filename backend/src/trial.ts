import type { FamilyDoc } from './schema.js';

/** AD-15: "account-first 72-hour family trial." */
export const TRIAL_DURATION_MS = 72 * 60 * 60 * 1000;

export function trialWindow(now: Date): { trialStartedAt: string; trialEndsAt: string } {
  return { trialStartedAt: now.toISOString(), trialEndsAt: new Date(now.getTime() + TRIAL_DURATION_MS).toISOString() };
}

/** True while `family`'s own trial clock hasn't yet elapsed. Never consulted for a family with
 *  an active entitlement (backend/src/family.ts's `familyHasActiveEntitlement` is checked FIRST,
 *  in every caller) — this only ever bounds an unpurchased family's own account access. */
export function isTrialActive(family: Pick<FamilyDoc, 'trialEndsAt'>, now: Date = new Date()): boolean {
  return now.getTime() < new Date(family.trialEndsAt).getTime();
}
