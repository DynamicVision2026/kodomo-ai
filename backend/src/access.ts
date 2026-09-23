import type { Env } from './types.js';
import type { TrialDoc, UsageDoc } from './schema.js';
import { trialPath, usagePath } from './schema.js';
import { isModuleEntitled } from './family.js';
import { isFreeMission } from '../../shared/freeMissions.js';
import { trialState, trialWindow } from './trial.js';

export type AccessRefusalReason = 'trial_expired' | 'not_entitled';
export type AccessResult = { allowed: true } | { allowed: false; reason: AccessRefusalReason };

/**
 * AD-16 §6's own "the AD-15 gate": whether `familyId` may open `unitId` (a mission id) inside
 * `moduleId` right now. An actively entitled module always passes. Otherwise, only the module's
 * own free/trial unit(s) (shared/freeMissions.ts) can ever pass, and only while that module's
 * trial hasn't elapsed — `not_started` counts as passing (the caller starts it via
 * `ensureTrialStarted`), `expired` is the ONE thing that closes it (AD-16 §0: this is the only
 * place trial expiry ever refuses anything — never login, `/me`, profiles, progress sync, or
 * purchase).
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
  if (trialState(trial, now) === 'expired') return { allowed: false, reason: 'trial_expired' };
  return { allowed: true };
}

/** Idempotent, race-safe (transactional): the first call for a family+module actually starts the
 *  clock; every later call is a no-op returning the SAME doc (AD-16 §5: "not started -> active",
 *  never restarted). */
export async function ensureTrialStarted(env: Env, familyId: string, moduleId: string, now: Date = new Date()): Promise<TrialDoc> {
  const path = trialPath(familyId, moduleId);
  return env.db.runTransaction(async (tx) => {
    const existing = await tx.get<TrialDoc>(path);
    if (existing) return existing;
    const doc: TrialDoc = { ...trialWindow(now), convertedAt: null, convertedOrderId: null };
    tx.set(path, doc);
    return doc;
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
