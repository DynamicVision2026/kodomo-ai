/**
 * Consent at login — consent text C v3, the Founder's final pre-launch version (1 Oct 2026,
 * supersedes v2/v2b: "No further legal round before launch"), shown on /login BEFORE a code is
 * requested.
 *
 * ANY change to the wording, links or button label REQUIRES bumping `CONSENT_TEXT_VERSION` in
 * shared/consent.ts in the same change, so every stored consent names the text that was agreed to.
 * tests/consentTextVersion.test.ts pins a hash of this text to that version to enforce it.
 * A full copy of every released version also lives under docs/consent-versions/.
 */
import { COMPANY } from './company';

export interface ConsentLink {
  label: string;
  href: string;
}

export const CONSENT_LEAD =
  'ログイン用の確認コードや、本サービスに関するお知らせ（ご購入後のご利用開始のお知らせなど）のメールは、' +
  'アメリカ合衆国に所在するメール配信事業者 AC PM, LLC（サービス名：Postmark）を通じてお送りします。' +
  'このため、入力されたメールアドレスと、お送りするメールの内容が同社に提供されます。';

export const CONSENT_CONFIRM_NOTE = '下記の内容をご確認のうえ、同意される場合はボタンを押してください。';

/** Every link opens in a new tab (the screen never navigates away from the consent step). */
export const CONSENT_LINKS: readonly ConsentLink[] = [
  {
    label: 'アメリカ合衆国の個人情報保護制度（個人情報保護委員会の資料）',
    href: 'https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/',
  },
  {
    label:
      '同社が講じる個人情報保護のための措置：暗号化した通信と保管、業務に必要な人に限ったアクセス、' +
      '守秘義務、漏えい時の通知など。くわしくは → プライバシーポリシー「4-2」',
    href: '/legal/privacy/#4-2',
  },
  { label: 'プライバシーポリシー', href: '/legal/privacy/' },
];

export const CONSENT_BUTTON_LABEL = '同意して、コードを送る';

export const CONSENT_RECORD_NOTE =
  '・ボタンを押した日時と同意文の版を、同意の記録として保存します。' +
  '確認コードの入力が完了するまでは、お知らせのメールは送りません。';

export const CONSENT_NO_MARKETING_NOTE = '・この同意にもとづいて、広告・宣伝のメールをお送りすることはありません。';

export const CONSENT_DECLINE_NOTE =
  '・同意されない場合は、確認コードをお送りできないため、ログインできません。その場合のお問い合わせ先：';
export const CONSENT_CONTACT_EMAIL = COMPANY.email;

/**
 * Notice D (Founder, 1 Oct 2026) — shown above every landing-page buy button and above
 * 「購入手続きへ進む」 on /account/, so a purchaser knows about the login consent requirement
 * BEFORE paying. `CONSENT_DECLINE_REFUND_NOTE` is the same refund promise added to the FAQ
 * (「返金はできますか？」), the landing page's price section, and the 特商法 page (item 10) — kept
 * here as a single source of truth so all four surfaces say exactly the same thing.
 */
export const CONSENT_DECLINE_REFUND_NOTE =
  '同意いただけない場合は、ログインできないため、ご利用いただけません。その場合で、まだご利用を始めていないときは、' +
  'ご購入からの日数にかかわらず、info@domo-ai.com までご連絡いただければ全額返金いたします。';

export const NOTICE_D_LEAD =
  'ナゼホリのご利用には、保護者の方のメールアドレスでのログインが必要です。ログインの際、確認コードのメールを米国のメール配信事業者（Postmark）を通じてお送りすることへの同意をお願いしています。' +
  CONSENT_DECLINE_REFUND_NOTE;

export const NOTICE_D_PRIVACY_LINK_LABEL = 'プライバシーポリシー';
export const NOTICE_D_PRIVACY_SUFFIX = 'をご覧ください。';
export const NOTICE_D_PRIVACY_PREFIX = 'くわしくは、';

/**
 * Landing-page FAQ「返金はできますか？」— the Founder's final verbatim two bullets (flip-prep,
 * 1 Oct 2026), replacing the old "近日公開予定" placeholder. The second bullet covers the same
 * declined-consent case as `CONSENT_DECLINE_REFUND_NOTE` above, in the Founder's own FAQ wording
 * rather than that shared Notice-D sentence — the two aren't byte-identical, but say the same
 * thing (full refund, regardless of days since purchase, if the parent hasn't started using it).
 */
export const FAQ_REFUND_BULLETS: readonly string[] = [
  'ご購入から10日以内で、入門コースのレッスンをまだ始めていない場合は、info@domo-ai.com までご連絡いただければ返金いたします。' +
    'プレイグラウンドを使ったことや、ログインしたことは「始めた」に含みません。',
  'ログイン時の同意をいただけないためにご利用になれない場合は、ご利用を始める前であれば、ご購入からの日数にかかわらず、' +
    'info@domo-ai.com までご連絡いただければ全額返金いたします。',
];
