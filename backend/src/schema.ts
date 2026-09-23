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

export const MAX_PROFILES = 6;
export const MAX_ACTIVE_SESSIONS = 5;
