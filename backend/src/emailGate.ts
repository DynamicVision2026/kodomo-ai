import type { Env } from './types.js';
import type { EmailMessage } from './email.js';
import type { EmailIndexDoc, FamilyDoc } from './schema.js';
import { emailIndexPath, familyPath } from './schema.js';
import { emailHashOf, normalizeEmail } from './family.js';

/**
 * Consent at login (PURCHASE-FLOW.md v2): NO email is sent to any address without recorded
 * consent. Every send in the backend goes through `sendEmailWithConsent`; a test
 * (tests/backendEmailConsentGate.test.ts) fails if any other file calls `env.email.send(`.
 *
 * `basis` says how consent is established when it is NOT simply "the recipient address belongs
 * to a family with recorded consent" (the default):
 *  - `login-request`: the caller has just verified that THIS login request carried the current
 *    consent text version (consent is being recorded in the same step), so the login code to a
 *    brand-new address is allowed.
 *  - `family`: the recipient is a new address being verified by an already-consenting, signed-in
 *    family (email change) — that family's recorded consent covers the verification code.
 */
export type ConsentBasis = { kind: 'login-request' } | { kind: 'family'; familyId: string };

export type SendOutcome = 'sent' | 'blocked_no_consent';

function hasConsent(family: FamilyDoc | null): boolean {
  return !!family && family.status === 'active' && !!family.consentAt && !!family.consentTextVersion;
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
  await env.email.send(message);
  return 'sent';
}
