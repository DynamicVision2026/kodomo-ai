/**
 * AD-13 §2 Firestore data model — every document shape and path helper the backend touches.
 * One place to check a path against the spec's own table rather than re-deriving it per handler.
 */
import type { ModuleProgressState } from '../../shared/progressMerge.js';

export type EntitlementStatus = 'active' | 'refunded' | 'revoked';
export type OrderState = 'granted' | 'duplicate' | 'needs_review' | 'refunded';
export type FamilyStatus = 'active' | 'deleted';

export interface FamilyDoc {
  email: string;
  status: FamilyStatus;
  profileCount: number;
  createdAt: string;
  updatedAt: string;
  /** AD-15: "account-first 72-hour family trial" + "shared family trial clock" — set once, at
   *  account creation (the family's first-ever successful `/auth/verify`), never renewed or
   *  reset by a later login. A family with an active entitlement is never gated by this; it
   *  only bounds how long an UNPURCHASED family may keep using the account itself (see
   *  backend/src/trial.ts). */
  trialStartedAt: string;
  trialEndsAt: string;
}

export interface EmailIndexDoc {
  familyId: string;
  createdAt: string;
}

export interface EntitlementDoc {
  status: EntitlementStatus;
  shopifyOrderId: string;
  shopifyCustomerId?: string;
  grantedAt: string;
  revokedAt: string | null;
}

export interface OrderDoc {
  familyId: string | null;
  moduleIds: string[];
  state: OrderState;
  webhookIds: string[];
  processedAt: string;
  /** AD-14: every matched line item's `variant_id`, in match order — persisted (not just
   *  logged) so a real order can be audited later without depending on log retention. */
  variantIds: number[];
}

export interface ProfileDoc {
  avatarId: string;
  nicknameId: string;
  stage: number;
  settingsUpdatedAt: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ProgressDoc extends ModuleProgressState {
  schemaVersion: number;
  rev: number;
  updatedAt: string;
}

export interface SessionDoc {
  familyId: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface LoginCodeDoc {
  codeHmac: string;
  expiresAt: string;
  attempts: number;
  sendsInWindow: number;
  windowStart: string;
  /** Backs the 60-second resend cooldown (AD-13 §4) — separate from `windowStart`, which tracks
   *  the 1-hour/5-send window instead. */
  lastSentAt: string;
}

export interface RateLimitDoc {
  count: number;
  expiresAt: string;
}

export interface ImportDoc {
  familyId: string;
  profileId: string;
  createdAt: string;
}

export const familyPath = (familyId: string) => `families/${familyId}`;
export const emailIndexPath = (emailHash: string) => `emailIndex/${emailHash}`;
export const entitlementsCollection = (familyId: string) => `families/${familyId}/entitlements`;
export const entitlementPath = (familyId: string, moduleId: string) => `families/${familyId}/entitlements/${moduleId}`;
export const orderPath = (shopifyOrderId: string | number) => `orders/${shopifyOrderId}`;
export const profilesCollection = (familyId: string) => `families/${familyId}/profiles`;
export const profilePath = (familyId: string, profileId: string) => `families/${familyId}/profiles/${profileId}`;
export const progressCollection = (familyId: string, profileId: string) =>
  `families/${familyId}/profiles/${profileId}/progress`;
export const progressPath = (familyId: string, profileId: string, moduleId: string) =>
  `families/${familyId}/profiles/${profileId}/progress/${moduleId}`;
export const sessionPath = (tokenHash: string) => `sessions/${tokenHash}`;
export const sessionsCollection = () => 'sessions';
export const loginCodePath = (emailHash: string) => `loginCodes/${emailHash}`;
export const rateLimitPath = (ipHash: string, hourBucket: string) => `rateLimits/${ipHash}_${hourBucket}`;
export const importPath = (importId: string) => `imports/${importId}`;

/** AD-15: lowered from AD-13's original 6 — applies uniformly to every family, trial or paid,
 *  present or future module (AD-15: "future modules use the same Family Account and same
 *  3-profile cap"). */
export const MAX_PROFILES = 3;
export const MAX_ACTIVE_SESSIONS = 5;
