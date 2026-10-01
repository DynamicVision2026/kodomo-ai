/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import * as emailModule from '../backend/src/email';

/**
 * Item 8 (Founder, 1 Oct 2026): consent recorded at login may never be used as the basis for a
 * marketing or newsletter email — only for the transactional sends text C v3 itself names (the
 * login code, and "お知らせ" meaning the module-activated/claim-your-purchase notices).
 *
 * This backend has exactly five outbound email templates (backend/src/email.ts), all transactional
 * and all gated by `sendEmailWithConsent` (backend/src/emailGate.ts) — see that test file's own
 * "no file under backend/ calls env.email.send directly" check (tests/backendConsentAtLogin.test.ts)
 * for the companion guarantee that there is no OTHER path to the real sender. Pinning the exact
 * template set here means a newly-added marketing/newsletter template can't quietly start reusing
 * this same consent-gated path — adding one fails this test until a human looks at it and decides
 * whether it belongs here at all (per item 8, it should not).
 */
const KNOWN_TRANSACTIONAL_TEMPLATES = [
  'loginCodeEmail', 'moduleActivatedEmail', 'claimYourPurchaseEmail', 'deviceEvictedEmail', 'emailChangedEmail',
].sort();

const MARKETING_NAME_HINTS = ['newsletter', 'marketing', 'promo', 'campaign', 'digest', 'announcement'];

describe('item 8 — no marketing/newsletter template exists in this backend\'s email module', () => {
  it('backend/src/email.ts exports exactly the known transactional templates, nothing more', () => {
    // `EmailSender` implementations (FakeEmailSender, LoggingEmailSender) are also exported
    // functions (classes), but they're transport, not templates — every *Email-named export is a
    // template, and that's the set this test pins.
    const exportedTemplateNames = Object.keys(emailModule)
      .filter((key) => typeof (emailModule as Record<string, unknown>)[key] === 'function' && key.endsWith('Email'))
      .sort();
    expect(exportedTemplateNames).toEqual(KNOWN_TRANSACTIONAL_TEMPLATES);
  });

  it('none of the known templates\' names suggest a marketing/newsletter purpose', () => {
    for (const name of KNOWN_TRANSACTIONAL_TEMPLATES) {
      for (const hint of MARKETING_NAME_HINTS) {
        expect(name.toLowerCase(), `${name} looks marketing-flavored (matched "${hint}")`).not.toContain(hint);
      }
    }
  });
});
