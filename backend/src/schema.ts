/**
 * AD-13 §2 / AD-16 §9 Firestore data model — every document shape and path helper the backend
 * touches. One place to check a path against the spec's own table rather than re-deriving it
 * per handler.
 */
import type { ModuleProgressState } from '../../shared/progressMerge.js';

export type FamilyStatus = 'active' | 'deleted';

/**
 * AD-16 §0: a family's `status` is the ONLY thing that ever gates login/`/me`/profiles/progress/
 * `/account`/purchase — trial and entitlement state never appear on this doc at all anymore
 * (AD-15's `trialStartedAt`/`trialEndsAt` fields are retired; trial state now lives per-module in
 * the `trials/{moduleId}` subcollection below, exactly because a family with zero trial history
 * — e.g. one created directly by a purchase, never having opened the trial unit — must still log
 * in normally).
 */
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

export type EntitlementStatus = 'active' | 'revoked';
export type EntitlementRevokeReason = 'refund' | 'admin';

export interface EntitlementDoc {
  status: EntitlementStatus;
  shopifyOrderId: string;
  grantedAt: string;
  revokedAt: string | null;
  revokedReason: EntitlementRevokeReason | null;
}

/**
 * AD-16 §5: not started (no doc) -> active (`startedAt`/`endsAt`) -> expired (derived from
 * `endsAt`, never itself stored) or converted (`convertedAt`/`convertedOrderId`). Started lazily,
 * by the first `POST /units/{unitId}/open` for the module's own trial unit — never by account
 * creation/login (that was AD-15's design; AD-16 §0 corrects it: login must work identically
 * whether or not a trial has ever been touched).
 */
export interface TrialDoc {
  startedAt: string;
  endsAt: string;
  convertedAt: string | null;
  convertedOrderId: string | null;
  /** AD-15's own "an already-open trial lesson retains a 2-hour grace past expiry" rule
   *  (backend/src/access.ts's own `checkUnitAccess`/`TRIAL_GRACE_MS`) — the timestamp of the
   *  most recent server-accepted open of the module's free/trial unit, updated on every such
   *  open regardless of trial state (never only the first). `null` until the trial unit has
   *  ever actually been opened once — a trial doc can exist (from `ensureTrialStarted`) with
   *  this still `null` for the brief window between the two writes in the same request. */
  lastOpenedAt: string | null;
}

/** AD-16 §6: the first server-accepted open of any NON-trial unit for this module — never set by
 *  login, profile creation, map browsing, or trial-unit (1-1) play. */
export interface UsageDoc {
  firstPaidUseAt: string;
  firstPaidUnitId: string;
  firstPaidProfileId: string;
}

// --- AD-16 §1/§4: purchase -> family binding -------------------------------------------------

export type BindingMethod = 'token' | 'email_match' | 'claim' | 'admin';
export type BindingState = 'bound' | 'awaiting_claim' | 'needs_review';
export type EntitlementState = 'granted' | 'duplicate' | 'revoked' | 'none';
export type RefundState = 'none' | 'requested' | 'refunded' | 'partial' | 'declined';

/** AD-16 §1: `purchaseIntents/{sha256(token)}` — only the HASH of the 256-bit token is ever
 *  stored, same pattern as every other bearer credential in this schema (session tokens, login
 *  codes). `expiresAt` is +14 days so konbini/bank-transfer orders (which can take days to
 *  actually pay) are still covered. */
export interface PurchaseIntentDoc {
  familyId: string;
  moduleId: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  orderId: string | null;
}

/** AD-16 §2: `claims/{sha256(token)}` — sent to the purchaser's email when an order can't be
 *  bound any other way; opens `/claim`, valid 30 days, single-use. */
export interface ClaimDoc {
  orderId: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  familyId: string | null;
}

export interface OrderLine {
  sku: string;
  variantId: number | null;
  moduleId: string;
  quantity: number;
  /** JPY integer, after line discounts, tax included (AD-16 §4). */
  lineTotal: number;
}

/** AD-16 §7: frozen at the moment staff record a refund request — never recomputed afterward,
 *  even if `usage.firstPaidUseAt` changes later (AD-16: "anything used after `requestedAt` is
 *  visible in the dashboard, and the snapshot stays unchanged"). */
export interface RefundEligibilitySnapshot {
  purchaseAgeDays: number;
  withinWindow: boolean;
  paidContentUsed: boolean;
  firstPaidUseAt: string | null;
  objectivelyEligible: boolean;
  policyVersion: string;
  frozenAt: string;
}

export interface RefundInfo {
  requestedAt: string | null;
  requestChannel: string | null;
  eligibilitySnapshot: RefundEligibilitySnapshot | null;
  decision: 'approved' | 'declined' | null;
  shopifyRefundIds: string[];
  refundedAt: string | null;
  refundedAmount: number | null;
  state: RefundState;
}

export function emptyRefundInfo(): RefundInfo {
  return {
    requestedAt: null, requestChannel: null, eligibilitySnapshot: null, decision: null,
    shopifyRefundIds: [], refundedAt: null, refundedAmount: null, state: 'none',
  };
}

/**
 * AD-16 §4: the full order record. Shopify is authoritative for money (amounts, tax, payment
 * status, refund execution); DomoAI is authoritative for binding, entitlement, trial and refund
 * DECISIONS. Never stores card/payment credentials, addresses, phone numbers, purchaser names,
 * or line items for any other product.
 */
export interface OrderDoc {
  shopifyOrderId: string;
  orderName: string;
  lines: OrderLine[];
  currency: string;
  financialStatus: string;
  shopifyCreatedAt: string;
  paidAt: string;
  purchaserEmail: string | null;
  familyId: string | null;
  bindingMethod: BindingMethod | null;
  bindingState: BindingState;
  entitlementState: EntitlementState;
  trialConverted: boolean;
  refund: RefundInfo;
  webhookIds: string[];
  createdAt: string;
  updatedAt: string;
}

// --- AD-16 §8: admin -------------------------------------------------------------------------

export type StaffRole = 'viewer' | 'operator';
export interface StaffDoc {
  role: StaffRole;
}

export interface RefundPolicyDoc {
  windowDays: number;
  requiresNoPaidUse: boolean;
  version: string;
}

/**
 * WO-C1: the formal course's own family allowlist, edited by hand in the Firestore console
 * exactly like `config/refundPolicy` above (no admin-dashboard UI for either — WO-C1 §4
 * explicitly asks for none). Membership alone decides visibility; there is no separate role —
 * a listed family sees the course, including any not-yet-fully-reviewed lesson content (behind
 * its own 「レビュー中」 badge — see `isCourseContentApprovedForProduction` in
 * shared/courseContent.ts), and staff/the Founder preview by adding their own test family's id
 * here, the same way any allowlisted family would be added.
 */
export interface CourseAllowFamiliesDoc {
  familyIds: string[];
}

/** Append-only; no endpoint ever updates or deletes an entry (AD-16 §8). */
export interface AuditLogDoc {
  at: string;
  /** A staff email, or `system:webhook` / `system:api`. */
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  /** Required for every STAFF write; null for a system-originated entry. */
  reason: string | null;
}

// --- existing (AD-13/AD-15) -------------------------------------------------------------------

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

/**
 * WO-C1: per-lesson progress signals for the formal course, one doc per (profile, courseId) —
 * deliberately its own subcollection (`courseProgress/`, not `progress/`) rather than an
 * extension of `ModuleProgressState`/`ProgressDoc` above. The Playground's progress shape
 * (missions/moveProgress/milestones/memories/…) has no field that means anything for a
 * listen→exercises→make→teach-back lesson, and bolting course-only fields onto the shared merge
 * function every Playground sync call touches would be exactly the kind of non-additive risk
 * WO-C1 rules out ("only additive changes to shared code; all existing tests stay green").
 * Percent-complete is deliberately NOT stored — it's derived from these raw signals every read
 * (`shared/courseProgress.ts`'s `computeLessonPercent`), the same "don't persist a derived number
 * that can drift from the authoritative flags" principle `ProgressDoc` itself already follows
 * (compare: `unitsCompleted` is computed from `missions[].done` on read, never stored).
 */
export interface CourseLessonProgress {
  listenDone: boolean;
  /** Exercise ids whose best-option feedback has been shown (WO-C1 §4: "item is done once the
   *  child has seen the best option's feedback") — a set, represented as a sorted-unique array
   *  for Firestore (no native Set type), unioned on merge. */
  exercisesDone: string[];
  /** Set only once, on the make step's 「いって みた！」 button (WO-C1 §3/§4). */
  makeDone: boolean;
  /** Set only once, on teach-back's 「いえた！」 button. */
  teachBackDone: boolean;
  /** WO-C1 §4: "★ is separate and never needed for 100%. It can be set only after the make
   *  step." — a count, not a boolean, since the family-inquiry screen's optional 「おうちで
   *  しらべた ★」 button can be pressed more than once across visits. */
  stars: number;
  /** ISO timestamp of the most recent recorded step in this lesson — the parent screen's own
   *  "date of the last step" per lesson (WO-C1 §3 screen 8). */
  lastStepAt: string;
}

export interface CourseProgressDoc {
  schemaVersion: number;
  rev: number;
  updatedAt: string;
  lessons: Record<string, CourseLessonProgress>;
  /** Part ids (lesson or "playground") a parent has opened early from the parent screen (WO-C1
   *  §4: "A parent can open the next part early... Replaying never lowers progress" — an early
   *  unlock is itself monotonic: once granted it is never revoked by a later merge). */
  earlyUnlockedParts: string[];
  /** Lesson ids where the "きょうは ここまで で OK" 60%-checkpoint notice has already been shown
   *  once (WO-C1 §4: "show... once") — tracked per lesson so it can correctly re-arm for the
   *  next lesson. */
  sixtyPercentNoticeShown: string[];
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
export const trialsCollection = (familyId: string) => `families/${familyId}/trials`;
export const trialPath = (familyId: string, moduleId: string) => `families/${familyId}/trials/${moduleId}`;
export const usagePath = (familyId: string, moduleId: string) => `families/${familyId}/usage/${moduleId}`;
export const orderPath = (shopifyOrderId: string | number) => `orders/${shopifyOrderId}`;
export const ordersCollection = () => 'orders';
export const purchaseIntentPath = (tokenHash: string) => `purchaseIntents/${tokenHash}`;
export const claimPath = (tokenHash: string) => `claims/${tokenHash}`;
export const staffPath = (email: string) => `staff/${email}`;
export const refundPolicyPath = () => 'config/refundPolicy';
export const courseAllowFamiliesPath = () => 'config/course.allowFamilies';
export const auditLogCollection = () => 'auditLog';
export const auditLogPath = (id: string) => `auditLog/${id}`;
export const profilesCollection = (familyId: string) => `families/${familyId}/profiles`;
export const profilePath = (familyId: string, profileId: string) => `families/${familyId}/profiles/${profileId}`;
export const progressCollection = (familyId: string, profileId: string) =>
  `families/${familyId}/profiles/${profileId}/progress`;
export const progressPath = (familyId: string, profileId: string, moduleId: string) =>
  `families/${familyId}/profiles/${profileId}/progress/${moduleId}`;
export const courseProgressCollection = (familyId: string, profileId: string) =>
  `families/${familyId}/profiles/${profileId}/courseProgress`;
export const courseProgressPath = (familyId: string, profileId: string, courseId: string) =>
  `families/${familyId}/profiles/${profileId}/courseProgress/${courseId}`;
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
