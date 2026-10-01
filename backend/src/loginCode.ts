import type { Env } from './types.js';
import type { LoginCodeDoc } from './schema.js';
import { loginCodePath } from './schema.js';
import { emailHashOf, getOrCreateFamilyIdInTx, normalizeEmail } from './family.js';
import { loginCodeEmail } from './email.js';
import { addressHasConsent, sendEmailWithConsent } from './emailGate.js';
import { CONSENT_TEXT_VERSION } from '../../shared/consent.js';
import { hmacHex, randomOtp, timingSafeEqual } from './util.js';
import { appBaseUrl } from './links.js';

const CODE_TTL_MS = 10 * 60 * 1000; // AD-13 §4: "valid for 10 minutes"
const RESEND_COOLDOWN_MS = 60 * 1000; // "re-send cooldown 60 seconds"
const SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export type RequestOutcome = 'code_sent' | 'rate_limited' | 'consent_required';

/**
 * AD-13 §4/§5 step 1, AD-15 "account-first": every well-formed email gets a real code now —
 * there is no separate "does this email have a purchase" gate on SENDING one (that gate moved
 * to `verifyLoginCode`'s trial/entitlement check below, which is what actually decides whether
 * the family gets IN, not whether it gets a code at all). No enumeration was already free from
 * this function's own logic (rate-limit bookkeeping is identical either way); it's even more
 * trivially true now that the branch it used to protect no longer exists.
 */
export async function requestLoginCode(
  env: Env,
  rawEmail: string,
  consentTextVersion?: string,
): Promise<RequestOutcome> {
  const email = normalizeEmail(rawEmail);
  const emailHash = await emailHashOf(email);
  const now = new Date();

  // Consent tied to verification: the login screen shows the consent text BEFORE the code is
  // requested, and the request carries the version it showed — this CLICK is what's being
  // checked here, and on its own it only ever allows the one login-code email below (never a
  // non-login email; see emailGate.ts). No click in this request and no prior VERIFIED consent
  // on record for this address = no code (and so no email) at all.
  const consentClickedNow = consentTextVersion === CONSENT_TEXT_VERSION;
  if (!consentClickedNow && !(await addressHasConsent(env, email))) return 'consent_required';

  const path = loginCodePath(emailHash);
  const existing = await env.db.get<LoginCodeDoc>(path);

  if (existing && now.getTime() - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS) return 'rate_limited';

  const windowStillOpen = existing && now.getTime() - new Date(existing.windowStart).getTime() < 60 * 60 * 1000;
  const sendsInWindow = windowStillOpen ? existing!.sendsInWindow + 1 : 1;
  if (sendsInWindow > SENDS_PER_HOUR) return 'rate_limited';
  const windowStart = windowStillOpen ? existing!.windowStart : now.toISOString();

  const code = randomOtp();
  const codeHmac = await hmacHex(code, env.AUTH_PEPPER);
  await env.db.set(path, {
    codeHmac,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sendsInWindow,
    windowStart,
    lastSentAt: now.toISOString(),
    ...(consentClickedNow ? { consentClickedAt: now.toISOString(), consentVersion: CONSENT_TEXT_VERSION } : {}),
  } satisfies LoginCodeDoc);
  await sendEmailWithConsent(env, loginCodeEmail(email, code, appBaseUrl(env)), consentClickedNow ? { kind: 'login-request' } : undefined);
  return 'code_sent';
}

export type VerifyOutcome = 'ok' | 'invalid' | 'expired' | 'locked';

export interface VerifyResult {
  outcome: VerifyOutcome;
  familyId?: string;
}

/** The code-validity check alone, with no requirement that the email already maps to a family —
 *  `verifyLoginCode` below is this plus account-first creation/trial gating; `handleAccountEmail`'s
 *  "OTP to the new address" step needs exactly this half, since the whole point of that flow is
 *  confirming an address that does NOT have a family yet. */
export async function verifyRawCode(env: Env, rawEmail: string, rawCode: string): Promise<VerifyOutcome> {
  return (await verifyRawCodeWithDoc(env, rawEmail, rawCode)).outcome;
}

async function verifyRawCodeWithDoc(
  env: Env,
  rawEmail: string,
  rawCode: string,
): Promise<{ outcome: VerifyOutcome; doc?: LoginCodeDoc }> {
  const email = normalizeEmail(rawEmail);
  const emailHash = await emailHashOf(email);
  const path = loginCodePath(emailHash);
  const doc = await env.db.get<LoginCodeDoc>(path);
  if (!doc || !doc.codeHmac) return { outcome: 'invalid' };
  if (new Date(doc.expiresAt).getTime() <= Date.now()) return { outcome: 'expired' };
  if (doc.attempts >= MAX_ATTEMPTS) return { outcome: 'locked' };

  const candidateHmac = await hmacHex(rawCode.trim(), env.AUTH_PEPPER);
  if (!timingSafeEqual(candidateHmac, doc.codeHmac)) {
    const attempts = doc.attempts + 1;
    await env.db.set(path, { ...doc, attempts });
    return { outcome: attempts >= MAX_ATTEMPTS ? 'locked' : 'invalid' };
  }

  await env.db.delete(path);
  return { outcome: 'ok', doc };
}

/**
 * AD-13 §4: 10-minute expiry, single use, 5 wrong attempts kill the code, constant-time compare.
 * AD-15 "account-first": a correct code for an email with NO existing family creates one right
 * here (inside a transaction, alongside the emailIndex entry — see `getOrCreateFamilyIdInTx`) and
 * starts its trial clock; this is the one and only place a Family Account is ever created purely
 * from a login, no purchase required.
 *
 * AD-16 §0 fix: login itself is NEVER gated by trial or entitlement state — a family's `status`
 * (`active`/`deleted`) is the only thing that could ever refuse it, and `getOrCreateFamilyIdInTx`
 * never returns a deleted family's id (account deletion removes the family doc outright). The
 * trial clock only ever governs `access.m1` (the AD-15 gate on the trial UNIT itself, now behind
 * `POST /units/{unitId}/open` — see backend/src/access.ts), never whether a family can sign in,
 * see `/me`, manage profiles/progress, or purchase. AD-13's old "trial_expired blocks login" was
 * a real bug this ticket exists to fix, not a design this file should re-introduce.
 */
export async function verifyLoginCode(env: Env, rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const { outcome, doc } = await verifyRawCodeWithDoc(env, rawEmail, rawCode);
  if (outcome !== 'ok') return { outcome };

  const now = new Date();
  const consent = doc?.consentClickedAt && doc.consentVersion
    ? { consentClickedAt: doc.consentClickedAt, consentVerifiedAt: now.toISOString(), consentVersion: doc.consentVersion }
    : undefined;
  const { familyId } = await env.db.runTransaction((tx) => getOrCreateFamilyIdInTx(tx, rawEmail, now.toISOString(), consent));
  return { outcome: 'ok', familyId };
}

/** AD-13 §3 `POST /account/email` step 1 and `DELETE /account`'s own "fresh code" requirement:
 *  sends an ordinary 6-digit code to `email`, with no entitlement/family gating at all (unlike
 *  `requestLoginCode`) — the caller is already an authenticated session confirming an action,
 *  not an anonymous visitor whose knowledge of a purchase needs verifying. */
export async function sendVerificationCode(env: Env, rawEmail: string, familyId: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const emailHash = await emailHashOf(email);
  const now = new Date();
  const code = randomOtp();
  const codeHmac = await hmacHex(code, env.AUTH_PEPPER);
  await env.db.set(loginCodePath(emailHash), {
    codeHmac,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sendsInWindow: 1,
    windowStart: now.toISOString(),
    lastSentAt: now.toISOString(),
  });
  await sendEmailWithConsent(env, loginCodeEmail(email, code, appBaseUrl(env)), { kind: 'family', familyId });
}
