import type { Env } from './types.js';
import type { EmailIndexDoc, EntitlementDoc, FamilyDoc } from './schema.js';
import { emailIndexPath, entitlementsCollection, familyPath } from './schema.js';
import { randomToken, sha256Hex } from './util.js';
import { trialWindow } from './trial.js';

/** Case/whitespace-insensitive — the same address typed differently must hash to the same
 *  `emailIndex` doc (AD-13 §2's own uniqueness guard would otherwise silently not guard). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function emailHashOf(email: string): Promise<string> {
  return sha256Hex(normalizeEmail(email));
}

export async function findFamilyIdByEmail(env: Env, emailHash: string): Promise<string | null> {
  const entry = await env.db.get<EmailIndexDoc>(emailIndexPath(emailHash));
  return entry?.familyId ?? null;
}

export async function getFamily(env: Env, familyId: string): Promise<FamilyDoc | null> {
  return env.db.get<FamilyDoc>(familyPath(familyId));
}

/**
 * AD-13 §2 `emailIndex` doc: "created in a transaction; one email maps to one family." Two
 * callers, both server-authenticated in their own way and never the browser directly: the
 * Shopify webhook (email comes from an HMAC-verified order) and, since AD-15's "account-first"
 * trial, `verifyLoginCode` (email comes from an already-verified OTP, not a client-asserted
 * value). Idempotent: a second call for an email that already has a family just returns its
 * existing id, inside the same transaction the caller is already running — and, critically,
 * never touches that family's own `trialStartedAt`/`trialEndsAt` once set (AD-15: "shared family
 * trial clock" — one clock, ever, not renewed by a later purchase or a later trial-path login).
 */
export async function getOrCreateFamilyIdInTx(
  tx: { get<T>(path: string): Promise<T | null>; set<T>(path: string, data: T): void },
  email: string,
  now: string,
): Promise<{ familyId: string; created: boolean }> {
  const normalized = normalizeEmail(email);
  const emailHash = await sha256Hex(normalized);
  const existing = await tx.get<EmailIndexDoc>(emailIndexPath(emailHash));
  if (existing) return { familyId: existing.familyId, created: false };

  const familyId = randomToken(16);
  const family: FamilyDoc = {
    email: normalized, status: 'active', profileCount: 0, createdAt: now, updatedAt: now,
    ...trialWindow(new Date(now)),
  };
  tx.set(familyPath(familyId), family);
  tx.set(emailIndexPath(emailHash), { familyId, createdAt: now } satisfies EmailIndexDoc);
  return { familyId, created: true };
}

export async function listEntitlements(env: Env, familyId: string) {
  return env.db.list<EntitlementDoc>(entitlementsCollection(familyId));
}

/** AD-15: the one check that matters for login now — an active entitlement always overrides
 *  the trial clock (backend/src/trial.ts); a family with none is gated by
 *  `isTrialActive` instead. (AD-13's original "refunded => treated as unknown" rule is
 *  superseded: AD-15's account-first model means every email can hold a Family Account, so a
 *  refunded/never-purchased family still logs in — it just falls back to the trial gate.) */
export async function familyHasActiveEntitlement(env: Env, familyId: string): Promise<boolean> {
  const entitlements = await listEntitlements(env, familyId);
  return entitlements.some((e) => e.data.status === 'active');
}
