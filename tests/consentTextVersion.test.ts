import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { CONSENT_TEXT_VERSION } from '../shared/consent';
import {
  CONSENT_BUTTON_LABEL, CONSENT_CONFIRM_NOTE, CONSENT_CONTACT_EMAIL, CONSENT_DECLINE_NOTE, CONSENT_LEAD,
  CONSENT_LINKS, CONSENT_NO_MARKETING_NOTE, CONSENT_RECORD_NOTE,
} from '../src/legal/consentText';

/** Every released wording of the consent text, keyed by its version. A stored consent says which
 *  version the family agreed to, so editing the wording WITHOUT bumping `CONSENT_TEXT_VERSION`
 *  (and adding the new hash here) must fail. Never edit or delete an existing entry — old entries
 *  are hashed under the OLDER `hashOfCurrentText` field set (pre-v3: no `confirm`/`noMarketing`),
 *  which is why they're pinned as plain strings here rather than recomputed. */
const KNOWN_VERSIONS: Record<string, string> = {
  'v2-C-2026-10-01': 'c643e18e6c332a91a0d7a8d40e8ccfb0ccfd476b68d430893c12385a672ae7ad',
  // Addendum: added CONSENT_RECORD_NOTE ("the button-press time is saved as the consent record").
  'v2-C-2026-10-01b': '7a6db1e29127925584a2b7b9c63bc23c2fb3ddda880aa0e6173554b0ac51ca5b',
  // Founder decision (1 Oct 2026): text C v3 — "no further legal round before launch", consent
  // tied to verification, explicit no-marketing line, version named in the consent record itself.
  'v3-2026-10-01': '3c0543611a655d2fe2a598ec43bfdb1ab2010f73a8ee8f0a9dc3e611974b6ca2',
};

function hashOfCurrentText(): string {
  return createHash('sha256')
    .update(JSON.stringify({
      lead: CONSENT_LEAD, confirm: CONSENT_CONFIRM_NOTE, links: CONSENT_LINKS, button: CONSENT_BUTTON_LABEL,
      record: CONSENT_RECORD_NOTE, noMarketing: CONSENT_NO_MARKETING_NOTE, decline: CONSENT_DECLINE_NOTE,
      contact: CONSENT_CONTACT_EMAIL,
    }))
    .digest('hex');
}

describe('consent text C is pinned to its version', () => {
  it('the current wording hashes to the hash recorded for CONSENT_TEXT_VERSION', () => {
    expect(KNOWN_VERSIONS[CONSENT_TEXT_VERSION]).toBe(hashOfCurrentText());
  });

  it('contains the exact elements of text C v3', () => {
    expect(CONSENT_LEAD).toContain('AC PM, LLC（サービス名：Postmark）');
    expect(CONSENT_LEAD).toContain('本サービスに関するお知らせ');
    expect(CONSENT_CONFIRM_NOTE).toBe('下記の内容をご確認のうえ、同意される場合はボタンを押してください。');
    expect(CONSENT_LINKS.map((l) => l.href)).toEqual([
      'https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/',
      '/legal/privacy/#4-2',
      '/legal/privacy/',
    ]);
    expect(CONSENT_BUTTON_LABEL).toBe('同意して、コードを送る');
    expect(CONSENT_RECORD_NOTE).toBe(
      '・ボタンを押した日時と同意文の版を、同意の記録として保存します。確認コードの入力が完了するまでは、お知らせのメールは送りません。',
    );
    expect(CONSENT_NO_MARKETING_NOTE).toBe('・この同意にもとづいて、広告・宣伝のメールをお送りすることはありません。');
    expect(CONSENT_DECLINE_NOTE + CONSENT_CONTACT_EMAIL).toBe(
      '・同意されない場合は、確認コードをお送りできないため、ログインできません。その場合のお問い合わせ先：info@domo-ai.com',
    );
  });
});
