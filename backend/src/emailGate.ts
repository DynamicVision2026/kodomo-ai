import type { Env } from './types.js';
import type { EmailMessage } from './email.js';
import type { EmailIndexDoc, FamilyDoc } from './schema.js';
import { emailIndexPath, familyPath } from './schema.js';
import { emailHashOf, normalizeEmail } from './family.js';

/**
 * Consent tied to verification (Founder decision, 1 Oct 2026): NO email is sent to any address
 * without VERIFIED consent — a click alone only ever permits the one login-code send it came
 * with, never anything else. Every send in the backend goes through `sendEmailWithConsent`; a
 * test (tests/backendConsentAtLogin.test.ts) fails if any other file calls `env.email.send(`.
 *
 * `basis` says how consent is established when it is NOT simply "the recipient address belongs
 * to a family with recorded VERIFIED consent" (the default):
 *  - `login-request`: the caller has just confirmed THIS specific request carried a fresh click
 *    of the current consent text version — allows ONLY the login-code email this one request is
 *    sending, never a non-login email (the login handler never passes this basis for anything
 *    else). Verification of the code, not the click, is what the family's own durable record
 *    requires — see `ConsentRecord` in backend/src/family.ts.
 *  - `family`: the recipient is a new address being verified by an already-consenting (verified),
 *    signed-in family (email change) — that family's own recorded VERIFIED consent covers the
 *    verification code sent to the new address.
 */
export type ConsentBasis = { kind: 'login-request' } | { kind: 'family'; familyId: string };

/**
 * Item 8 (Founder, 1 Oct 2026): "this consent may never be used as the basis for a marketing or
 * newsletter email." Text C v3's own record note promises exactly that
 * (src/legal/consentText.ts's `CONSENT_NO_MARKETING_NOTE`), so it must stay true in code, not just
 * in the parent-facing wording. The only outbound templates this backend has are the five
 * transactional ones in backend/src/email.ts (login code, module-activated, claim-your-purchase,
 * device-evicted, email-changed) — none is a marketing/newsletter send, and
 * tests/emailGateNoMarketing.test.ts pins that set so a future marketing template can't quietly
 * start flowing through this same gate without a human noticing and updating that test.
 */

/**
 * Item 11 (Founder, 1 Oct 2026) test scenario "failed email delivery -> no crash, retry works":
 * before this fix, a thrown `env.email.send` (a real Postmark failure) propagated UNCAUGHT out of
 * every call site — crashing the request (the Shopify webhook handler, an admin resend, etc.) with
 * an uncaught exception AFTER the order/entitlement write had already committed. Worse, a Shopify
 * webhook retry after that 500 hits this backend's OWN idempotent-replay branch (the order already
 * exists), which deliberately never re-sends email — so the one email that failed was gone for
 * good, with no distinction in the response from "blocked, never should have sent" that an operator
 * could notice and act on. `'send_failed'` fixes both: the caller gets a value back, not an
 * exception, so the commercial operation that already succeeded is never reported as failed; and
 * the admin dashboard's own resend buttons (resend-welcome, resend-claim) are what "retry works"
 * means — see `backend/src/adminRouter.ts`'s own `reason` field, now distinguishing the two cases.
 */
export type SendOutcome = 'sent' | 'blocked_no_consent' | 'send_failed';

function hasConsent(family: FamilyDoc | null): boolean {
  return !!family && family.status === 'active' && !!family.consentVerifiedAt && !!family.consentVersion;
}

export async function addressHasConsent(env: Env, rawEmail: string): Promise<boolean> {
  const index = await env.db.get<EmailIndexDoc>(emailIndexPath(await emailHashOf(normalizeEmail(rawEmail))));
  if (!index) return false;
  return hasConsent(await env.db.get<FamilyDoc>(familyPath(index.familyId)));
}

export async function sendEmailWithConsent(env: Env, message: EmailMessage, basis?: ConsentBasis): Promise<SendOutcome> {
  let allowed = false;
  if (basis?.kind === 'login-request') {
    allowed = true;
  } else if (basis?.kind === 'family') {
    allowed = hasConsent(await env.db.get<FamilyDoc>(familyPath(basis.familyId)));
  } else {
    allowed = await addressHasConsent(env, message.to);
  }
  if (!allowed) {
    console.warn(`[email] blocked_no_consent subject="${message.subject.slice(0, 30)}"`);
    return 'blocked_no_consent';
  }
  try {
    await env.email.send(message);
    return 'sent';
  } catch (err) {
    console.error(`[email] send_failed subject="${message.subject.slice(0, 30)}": ${err instanceof Error ? err.message : String(err)}`);
    return 'send_failed';
  }
}
