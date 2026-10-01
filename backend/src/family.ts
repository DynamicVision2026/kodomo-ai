import type { Env } from './types.js';
import type { EmailIndexDoc, EntitlementDoc, FamilyDoc } from './schema.js';
import { emailIndexPath, entitlementPath, entitlementsCollection, familyPath } from './schema.js';
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
 * AD-13 §2 `emailIndex` doc: "created in a transaction; one email maps to one family." The ONLY
 * caller is `verifyLoginCode` — since AD-15's "account-first" trial, a correct OTP is the one and
 * only way a Family Account is ever created (email comes from an already-verified code, not a
 * client-asserted value). AD-16 §2 explicitly REMOVES the Shopify webhook's own former use of
 * this function ("never auto-create a Family from an unmatched Shopify purchaser email") — the
 * webhook only ever looks an email up (`findFamilyIdByEmail`), never creates one; an order with no
 * token and no matching existing family goes to the claim flow instead (backend/src/handlers/
 * webhook.ts). Idempotent: a second call for an email that already has a family just returns its
 * existing id, inside the same transaction the caller is already running. Never sets any trial
 * state (AD-16 §0/§5: trial starts lazily at the trial unit's own first open, never at account
 * creation).
 */
export interface ConsentRecord {
  consentAt: string;
  consentTextVersion: string;
}

export async function getOrCreateFamilyIdInTx(
  tx: { get<T>(path: string): Promise<T | null>; set<T>(path: string, data: T): void },
  email: string,
  now: string,
  consent?: ConsentRecord,
): Promise<{ familyId: string; created: boolean }> {
  const normalized = normalizeEmail(email);
  const emailHash = await sha256Hex(normalized);
  const existing = await tx.get<EmailIndexDoc>(emailIndexPath(emailHash));
  if (existing) {
    // Consent at login: a login that carried consent records it on the family — unless the
    // family already agreed to this exact wording (keep the original agreement time).
    if (consent) {
      const family = await tx.get<FamilyDoc>(familyPath(existing.familyId));
      if (family && family.consentTextVersion !== consent.consentTextVersion) {
        tx.set(familyPath(existing.familyId), { ...family, ...consent, updatedAt: now } satisfies FamilyDoc);
      }
    }
    return { familyId: existing.familyId, created: false };
  }

  const familyId = randomToken(16);
  const family: FamilyDoc = { email: normalized, status: 'active', profileCount: 0, createdAt: now, updatedAt: now, ...(consent ?? {}) };
  tx.set(familyPath(familyId), family);
  tx.set(emailIndexPath(emailHash), { familyId, createdAt: now } satisfies EmailIndexDoc);
  return { familyId, created: true };
}

export async function listEntitlements(env: Env, familyId: string) {
  return env.db.list<EntitlementDoc>(entitlementsCollection(familyId));
}

/** Whether ANY module is actively entitled for this family — used by the content-access gate
 *  (backend/src/access.ts) and account-page checks. Never used to gate login/`/me` itself
 *  (AD-16 §0): a refunded or never-purchased family always logs in; only `access.m1` for a
 *  specific module depends on this. */
export async function familyHasActiveEntitlement(env: Env, familyId: string): Promise<boolean> {
  const entitlements = await listEntitlements(env, familyId);
  return entitlements.some((e) => e.data.status === 'active');
}

/** The module-scoped equivalent — whether `moduleId` specifically is actively entitled, not
 *  "any module." Multi-module aware (AD-16 §5: "future modules use the same Family Account"). */
export async function isModuleEntitled(env: Env, familyId: string, moduleId: string): Promise<boolean> {
  const entitlement = await env.db.get<EntitlementDoc>(entitlementPath(familyId, moduleId));
  return entitlement?.status === 'active';
}
