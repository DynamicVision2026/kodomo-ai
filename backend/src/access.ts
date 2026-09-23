import type { Env } from './types.js';
import type { TrialDoc, UsageDoc } from './schema.js';
import { trialPath, usagePath } from './schema.js';
import { isModuleEntitled } from './family.js';
import { isFreeMission } from '../../shared/freeMissions.js';
import { trialState, trialWindow, TRIAL_GRACE_MS } from './trial.js';

export type AccessRefusalReason = 'trial_expired' | 'not_entitled';
export type AccessResult = { allowed: true } | { allowed: false; reason: AccessRefusalReason };

/**
 * AD-16 §6's own "the AD-15 gate": whether `familyId` may open `unitId` (a mission id) inside
 * `moduleId` right now. An actively entitled module always passes (also covers "refunded/revoked
 * M1: access falls back to the existing trial state/dates" — a revoked entitlement just makes
 * this check fall through to the SAME trial doc below, exactly as if it had never been entitled;
 * nothing here or in `ensureTrialStarted` ever resets/recreates a trial doc that already exists).
 * Otherwise, only the module's own free/trial unit(s) (shared/freeMissions.ts) can ever pass, and
 * only while that module's trial hasn't elapsed — `not_started` counts as passing (the caller
 * starts it via `ensureTrialStarted`), `expired` closes it UNLESS the family had this exact unit
 * open within the last `TRIAL_GRACE_MS` (AD-15: "existing in-progress lesson retains the
 * approved 2-hour grace" — never a brand-new open past expiry, only one recently already
 * underway; `TrialDoc.lastOpenedAt`, written by `recordTrialUnitOpened` below). AD-16 §0: trial
 * expiry is the only place any of this ever refuses anything — never login, `/me`, profiles,
 * progress sync, or purchase.
 */
export async function checkUnitAccess(
  env: Env,
  familyId: string,
  moduleId: string,
  unitId: string,
  now: Date = new Date(),
): Promise<AccessResult> {
  if (await isModuleEntitled(env, familyId, moduleId)) return { allowed: true };
  if (!isFreeMission(moduleId, unitId)) return { allowed: false, reason: 'not_entitled' };

  const trial = await env.db.get<TrialDoc>(trialPath(familyId, moduleId));
  if (trialState(trial, now) !== 'expired') return { allowed: true };

  const lastOpenedAt = trial?.lastOpenedAt ? new Date(trial.lastOpenedAt).getTime() : null;
  if (lastOpenedAt !== null && now.getTime() - lastOpenedAt <= TRIAL_GRACE_MS) return { allowed: true };
  return { allowed: false, reason: 'trial_expired' };
}

/** Idempotent, race-safe (transactional): the first call for a family+module actually starts the
 *  clock; every later call is a no-op returning the SAME doc (AD-16 §5: "not started -> active",
 *  never restarted — this is also what makes the "refunded/revoked: no new trial created" rule
 *  hold: a family with an existing trial doc from before their purchase/refund gets that SAME
 *  doc back, dates untouched). */
export async function ensureTrialStarted(env: Env, familyId: string, moduleId: string, now: Date = new Date()): Promise<TrialDoc> {
  const path = trialPath(familyId, moduleId);
  return env.db.runTransaction(async (tx) => {
    const existing = await tx.get<TrialDoc>(path);
    if (existing) return existing;
    const doc: TrialDoc = { ...trialWindow(now), convertedAt: null, convertedOrderId: null, lastOpenedAt: null };
    tx.set(path, doc);
    return doc;
  });
}

/** AD-15's own 2-hour-grace rule (see `checkUnitAccess` above): stamps "the trial unit was just
 *  opened" on every server-accepted open of it, whatever the trial's own state — so a lesson
 *  that was genuinely underway right at the 72-hour boundary can still be finished, while a
 *  family that hasn't touched it in the last `TRIAL_GRACE_MS` gets the ordinary expired refusal.
 *  Always called together with `ensureTrialStarted` (backend/src/handlers/units.ts) so a trial
 *  doc always exists by the time this runs; a missing doc (shouldn't happen) is a silent no-op
 *  rather than fabricating one out of order. */
export async function recordTrialUnitOpened(env: Env, familyId: string, moduleId: string, now: Date = new Date()): Promise<void> {
  const path = trialPath(familyId, moduleId);
  await env.db.runTransaction(async (tx) => {
    const existing = await tx.get<TrialDoc>(path);
    if (!existing) return;
    tx.set(path, { ...existing, lastOpenedAt: now.toISOString() });
  });
}

/** AD-16 §6: "the first server-accepted open of any non-trial unit... if not already set." Never
 *  overwrites an existing record — first use is first use, permanently. */
export async function recordFirstPaidUse(
  env: Env,
  familyId: string,
  moduleId: string,
  unitId: string,
  profileId: string,
  now: Date = new Date(),
): Promise<void> {
  const path = usagePath(familyId, moduleId);
  await env.db.runTransaction(async (tx) => {
    const existing = await tx.get<UsageDoc>(path);
    if (existing) return;
    const doc: UsageDoc = { firstPaidUseAt: now.toISOString(), firstPaidUnitId: unitId, firstPaidProfileId: profileId };
    tx.set(path, doc);
  });
}
