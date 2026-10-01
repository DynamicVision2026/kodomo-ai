import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import {
  CONSENT_BUTTON_LABEL, CONSENT_CONTACT_EMAIL, CONSENT_DECLINE_NOTE, CONSENT_LEAD, CONSENT_LINKS,
  CONSENT_RECORD_NOTE,
} from '../src/legal/consentText';

/** Every released wording of the consent text, keyed by its version. A stored consent says which
 *  version the family agreed to, so editing the wording WITHOUT bumping `CONSENT_TEXT_VERSION`
 *  (and adding the new hash here) must fail. Never edit or delete an existing entry. */
const KNOWN_VERSIONS: Record<string, string> = {
  'v2-C-2026-10-01': 'c643e18e6c332a91a0d7a8d40e8ccfb0ccfd476b68d430893c12385a672ae7ad',
  // Addendum: added CONSENT_RECORD_NOTE ("the button-press time is saved as the consent record").
  'v2-C-2026-10-01b': '7a6db1e29127925584a2b7b9c63bc23c2fb3ddda880aa0e6173554b0ac51ca5b',
};

function hashOfCurrentText(): string {
  return createHash('sha256')
    .update(JSON.stringify({
      lead: CONSENT_LEAD, links: CONSENT_LINKS, button: CONSENT_BUTTON_LABEL,
      record: CONSENT_RECORD_NOTE, decline: CONSENT_DECLINE_NOTE, contact: CONSENT_CONTACT_EMAIL,
    }))
    .digest('hex');
}

describe('consent text C is pinned to its version', () => {
  it('the current wording hashes to the hash recorded for CONSENT_TEXT_VERSION', () => {
    expect(KNOWN_VERSIONS[CONSENT_TEXT_VERSION]).toBe(hashOfCurrentText());
  });

  it('contains the exact elements sent to legal', () => {
    expect(CONSENT_LEAD).toContain('AC PM LLC（サービス名：Postmark）');
    expect(CONSENT_LINKS.map((l) => l.href)).toEqual([
      'https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/',
      'https://postmarkapp.com/dpa',
      '/legal/privacy/',
    ]);
    expect(CONSENT_BUTTON_LABEL).toBe('同意して、コードを送る');
    expect(CONSENT_RECORD_NOTE).toBe('・ボタンを押した日時を、同意の記録として保存します。');
    expect(CONSENT_DECLINE_NOTE + CONSENT_CONTACT_EMAIL).toBe(
      '同意しない場合は、コードを送れないため、ログインできません。お問い合わせ：info@domo-ai.com',
    );
  });
});
