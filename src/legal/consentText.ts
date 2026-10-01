/**
 * Consent at login (PURCHASE-FLOW.md v2) — consent text C, exactly as sent to legal on 1 Oct 2026,
 * shown on /login BEFORE a code is requested.
 *
 * ANY change to the wording, links or button label REQUIRES bumping `CONSENT_TEXT_VERSION` in
 * shared/consent.ts in the same change, so every stored consent names the text that was agreed to.
 * tests/consentTextVersion.test.ts pins a hash of this text to that version to enforce it.
 */
import { COMPANY } from './company';

export interface ConsentLink {
  label: string;
  href: string;
}

export const CONSENT_LEAD =
  'ログイン用の確認コードなどのメールは、アメリカ合衆国に所在するメール配信事業者 AC PM LLC（サービス名：Postmark）を通じてお送りします。このため、入力されたメールアドレスと、お送りするメールの内容が同社に提供されます。';

/** Every link opens in a new tab (the screen never navigates away from the consent step). */
export const CONSENT_LINKS: readonly ConsentLink[] = [
  {
    label: 'アメリカ合衆国の個人情報保護制度（個人情報保護委員会の資料）',
    href: 'https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/',
  },
  { label: '同社の個人情報保護のための措置', href: 'https://postmarkapp.com/dpa' },
  { label: 'プライバシーポリシー', href: '/legal/privacy/' },
];

export const CONSENT_BUTTON_LABEL = '同意して、コードを送る';

export const CONSENT_DECLINE_NOTE =
  '同意しない場合は、コードを送れないため、ログインできません。お問い合わせ：';
export const CONSENT_CONTACT_EMAIL = COMPANY.email;
