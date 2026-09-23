import type { Env } from './types.js';
import type { EmailIndexDoc, EntitlementDoc, FamilyDoc } from './schema.js';
import { emailIndexPath, entitlementsCollection, familyPath } from './schema.js';
import { randomToken, sha256Hex } from './util.js';

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
 * AD-13 §2 `emailIndex` doc: "created in a transaction; one email maps to one family." Called
 * only from the webhook (the one place a family is ever created — there is no separate sign-up
 * form, AD-13 §5 step 2). Idempotent: a second call for an email that already has a family just
 * returns its existing id, inside the same transaction the caller is already running.
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
  const family: FamilyDoc = { email: normalized, status: 'active', profileCount: 0, createdAt: now, updatedAt: now };
  tx.set(familyPath(familyId), family);
  tx.set(emailIndexPath(emailHash), { familyId, createdAt: now } satisfies EmailIndexDoc);
  return { familyId, created: true };
}

export async function listEntitlements(env: Env, familyId: string) {
  return env.db.list<EntitlementDoc>(entitlementsCollection(familyId));
}

/** AD-13 §4: "an email with a refunded or revoked entitlement is treated as unknown" — a family
 *  that once bought and fully refunded has no login path back in via `/auth/request` alone
 *  (recovery goes through `/admin`, same as a lost mailbox — AD-13 §5 step 6). */
export async function familyHasActiveEntitlement(env: Env, familyId: string): Promise<boolean> {
  const entitlements = await listEntitlements(env, familyId);
  return entitlements.some((e) => e.data.status === 'active');
}
