import type { Env } from './types.js';
import type { LoginCodeDoc } from './schema.js';
import { loginCodePath } from './schema.js';
import { emailHashOf, familyHasActiveEntitlement, findFamilyIdByEmail, normalizeEmail } from './family.js';
import { loginCodeEmail, noPurchaseFoundEmail } from './email.js';
import { hmacHex, randomOtp, timingSafeEqual } from './util.js';

const CODE_TTL_MS = 10 * 60 * 1000; // AD-13 §4: "valid for 10 minutes"
const RESEND_COOLDOWN_MS = 60 * 1000; // "re-send cooldown 60 seconds"
const SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export type RequestOutcome = 'code_sent' | 'no_purchase_found' | 'rate_limited';

/**
 * AD-13 §4/§5 step 1. The HTTP handler always answers the SAME generic 200 regardless of this
 * function's outcome (no enumeration) — this return value exists only so the handler/tests can
 * tell what actually happened internally. Rate-limit bookkeeping (`loginCodes` doc) is written
 * identically whether or not the email matches a real, still-entitled family, so a known vs.
 * unknown address is indistinguishable by response timing or by how many resends it takes to get
 * throttled — only the emailed CONTENT differs.
 */
export async function requestLoginCode(env: Env, rawEmail: string, storeUrl: string): Promise<RequestOutcome> {
  const email = normalizeEmail(rawEmail);
  const emailHash = await emailHashOf(email);
  const now = new Date();
  const path = loginCodePath(emailHash);
  const existing = await env.db.get<LoginCodeDoc>(path);

  if (existing) {
    if (now.getTime() - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS) return 'rate_limited';
  }

  const windowStillOpen = existing && now.getTime() - new Date(existing.windowStart).getTime() < 60 * 60 * 1000;
  const sendsInWindow = windowStillOpen ? existing!.sendsInWindow + 1 : 1;
  if (sendsInWindow > SENDS_PER_HOUR) return 'rate_limited';
  const windowStart = windowStillOpen ? existing!.windowStart : now.toISOString();

  const familyId = await findFamilyIdByEmail(env, emailHash);
  const entitled = familyId ? await familyHasActiveEntitlement(env, familyId) : false;

  if (!entitled) {
    // Still recorded — an attacker probing for valid addresses gets the same cooldown/backoff
    // shape either way, and a genuinely refunded/revoked family can't use this to re-derive a
    // live code (AD-13 §4: "treated as unknown").
    await env.db.set(path, {
      codeHmac: '',
      expiresAt: now.toISOString(), // already-expired placeholder: nothing valid to verify against
      attempts: 0,
      sendsInWindow,
      windowStart,
      lastSentAt: now.toISOString(),
    });
    await env.email.send(noPurchaseFoundEmail(email, storeUrl));
    return 'no_purchase_found';
  }

  const code = randomOtp();
  const codeHmac = await hmacHex(code, env.AUTH_PEPPER);
  await env.db.set(path, {
    codeHmac,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sendsInWindow,
    windowStart,
    lastSentAt: now.toISOString(),
  });
  await env.email.send(loginCodeEmail(email, code));
  return 'code_sent';
}

export type VerifyOutcome = 'ok' | 'invalid' | 'expired' | 'locked';

export interface VerifyResult {
  outcome: VerifyOutcome;
  familyId?: string;
}

/** The code-validity check alone, with no requirement that the email already maps to a family —
 *  `verifyLoginCode` below is this plus that lookup (ordinary login always needs an existing
 *  family); `handleAccountEmail`'s "OTP to the new address" step needs exactly this half, since
 *  the whole point of that flow is confirming an address that does NOT have a family yet. */
export async function verifyRawCode(env: Env, rawEmail: string, rawCode: string): Promise<VerifyOutcome> {
  const email = normalizeEmail(rawEmail);
  const emailHash = await emailHashOf(email);
  const path = loginCodePath(emailHash);
  const doc = await env.db.get<LoginCodeDoc>(path);
  if (!doc || !doc.codeHmac) return 'invalid';
  if (new Date(doc.expiresAt).getTime() <= Date.now()) return 'expired';
  if (doc.attempts >= MAX_ATTEMPTS) return 'locked';

  const candidateHmac = await hmacHex(rawCode.trim(), env.AUTH_PEPPER);
  if (!timingSafeEqual(candidateHmac, doc.codeHmac)) {
    const attempts = doc.attempts + 1;
    await env.db.set(path, { ...doc, attempts });
    return attempts >= MAX_ATTEMPTS ? 'locked' : 'invalid';
  }

  await env.db.delete(path);
  return 'ok';
}

/** AD-13 §4: 10-minute expiry, single use (the doc is deleted on success), 5 wrong attempts kill
 *  the code outright, comparison is constant-time. */
export async function verifyLoginCode(env: Env, rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const outcome = await verifyRawCode(env, rawEmail, rawCode);
  if (outcome !== 'ok') return { outcome };
  const familyId = await findFamilyIdByEmail(env, await emailHashOf(rawEmail));
  if (!familyId) return { outcome: 'invalid' };
  return { outcome: 'ok', familyId };
}

/** AD-13 §3 `POST /account/email` step 1 and `DELETE /account`'s own "fresh code" requirement:
 *  sends an ordinary 6-digit code to `email`, with no entitlement/family gating at all (unlike
 *  `requestLoginCode`) — the caller is already an authenticated session confirming an action,
 *  not an anonymous visitor whose knowledge of a purchase needs verifying. */
export async function sendVerificationCode(env: Env, rawEmail: string): Promise<void> {
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
  await env.email.send(loginCodeEmail(email, code));
}
