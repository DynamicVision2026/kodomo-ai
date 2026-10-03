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
 *
 * Deliberately UNCHANGED by COPY-02 (Founder, 2 Oct 2026) — this exact pair is still what
 * `LandingPage.tsx` (the old, pre-`BEGINNER_LAUNCH` page, still live at `/` today) shows, and it
 * must keep describing today's real, live policy until the flags flip. COPY-02's own replacement
 * text lives in the `COPY02_*` exports below, used only by `NewLandingPage.tsx` (preview at
 * `/lp-new/` now, live at `/` once `VITE_BEGINNER_LAUNCH` is on) and `TokushohoPage.tsx`'s own
 * flag-gated branch — never this export, so a real visitor never sees a refund promise naming
 * Lessons 2-7 before that product shape is actually what they can buy.
 */
export const FAQ_REFUND_BULLETS: readonly string[] = [
  'ご購入から10日以内で、入門コースのレッスンをまだ始めていない場合は、info@domo-ai.com までご連絡いただければ返金いたします。' +
    'プレイグラウンドを使ったことや、ログインしたことは「始めた」に含みません。',
  'ログイン時の同意をいただけないためにご利用になれない場合は、ご利用を始める前であれば、ご購入からの日数にかかわらず、' +
    'info@domo-ai.com までご連絡いただければ全額返金いたします。',
];

/**
 * COPY-02 (Founder, 2 Oct 2026, approved) — the "Lesson 1 free sample / Lessons 2-7 paid" refund
 * policy, replacing COPY-01's Playground-era wording above. Shown today only behind
 * `VITE_BEGINNER_LAUNCH` (`NewLandingPage.tsx`, `TokushohoPage.tsx`) and unconditionally at the
 * noindexed `/lp-new/` preview — never on the currently-live `/` page. `COPY02_REFUND_WINDOW_HOURS`
 * mirrors `backend/src/refund.ts`'s own `DEFAULT_POLICY.windowDays * 24` (both changed together,
 * same source of truth in spirit — the backend's own number is the enforced one; this is the text
 * a family actually reads). WO-C7 follow-up (Founder, 3 Oct 2026): the wording switched from
 * "3日" to the equivalent "72時間" — same window, worded in hours everywhere it's read aloud.
 */
export const COPY02_REFUND_WINDOW_HOURS = 72;

// Founder, 3 Oct 2026 (cosmetic): a non-breaking space (U+00A0) right before the email address,
// not a plain space — CJK/Latin mixed text otherwise lets the browser break the line exactly at
// that boundary, dropping "info@domo-ai.com" onto its own line and making the sentence read as
// broken. Same fix applied everywhere this address appears in COPY-02's own refund text below.
const COPY02_REFUND_CONDITION_SENTENCE =
  `ご購入日時から${COPY02_REFUND_WINDOW_HOURS}時間以内で、かつ、ご購入後に有料レッスン（レッスン2〜7）を一度も開いていない場合に限り、 ` +
  'info@domo-ai.com までご連絡いただければ、購入代金を返金いたします。';
const COPY02_LESSON1_EXCLUDED_SENTENCE =
  '無料のレッスン1のご利用は、有料コンテンツの利用には含まれません。';
// WO-C7 item 3 (Founder, 3 Oct 2026, v3): adds the parenthetical — a child opening a paid lesson
// by accident still counts as "opened", same as any other open.
const COPY02_INELIGIBLE_SENTENCE =
  `有料レッスン（レッスン2〜7）のいずれかを一度でも開いた場合（お子さまが誤って開いた場合を含みます）、` +
  `またはご購入日時から${COPY02_REFUND_WINDOW_HOURS}時間を経過した場合は、原則として返金対象外となります。`;
const COPY02_PAID_USE_DEFINITION_SENTENCE =
  '「有料コンテンツの利用開始」とは、ご購入後にレッスン2〜7のいずれかを初めて開いた時点をいいます。';
// WO-C7 item 3 (v3): new carve-out sentence — duplicate charges, payment errors, or a serious
// fault on the company's own side are handled individually, regardless of the window/usage rules
// above.
const COPY02_EXCEPTIONAL_CASES_SENTENCE =
  '重複請求、決済エラー、当社の責任による重大な不具合でご利用いただけない場合は、上記にかかわらず個別に対応のうえ返金いたします。';

/** The one refund-condition paragraph (特商法/FAQ full text) — all four sentences, verbatim,
 *  concatenated in COPY-02's own given order. */
export const COPY02_REFUND_FULL_TEXT =
  COPY02_REFUND_CONDITION_SENTENCE + COPY02_LESSON1_EXCLUDED_SENTENCE + COPY02_INELIGIBLE_SENTENCE + COPY02_PAID_USE_DEFINITION_SENTENCE;

/** The declined-login-consent refund bullet, COPY-02's own updated wording (ties the promise to
 *  "paid content" specifically, now that Lesson 1 is an explicit free/unpaid surface) — replaces
 *  `CONSENT_DECLINE_REFUND_NOTE` wherever COPY-02 applies. Not used by Notice D (unconditional,
 *  every page, both flag states) — only by the FAQ's own second bullet and the 特商法 page's own
 *  返品・キャンセル section, both already flag-gated at their call sites. */
export const COPY02_CONSENT_DECLINE_REFUND_NOTE =
  'ログイン時の同意をいただけないためにご利用になれない場合は、有料コンテンツの利用開始前であれば、ご購入からの日数にかかわらず、 ' +
  'info@domo-ai.com までご連絡いただければ全額返金いたします。';

export const COPY02_FAQ_REFUND_BULLETS: readonly [string, string] = [COPY02_REFUND_FULL_TEXT, COPY02_CONSENT_DECLINE_REFUND_NOTE];

/** WO-C7 item 5(a): the FAQ's own 「返金はできますか？」 answer no longer repeats the full legal
 *  text — a short sentence, then a link to the 特商法 page for the details. The consuming
 *  component supplies the actual `<a>` around `TOKUSHOHO_LINK_LABEL`. */
export const COPY02_FAQ_REFUND_SHORT_SENTENCE =
  `ご購入日時から${COPY02_REFUND_WINDOW_HOURS}時間以内で、かつ有料レッスン（レッスン2〜7）を一度も開いていない場合に返金いたします。`;

/** The 特商法 page's own title, reused everywhere this policy links out to it instead of
 *  repeating itself (WO-C7 items 4, 5a) — never paraphrased. */
export const TOKUSHOHO_LINK_LABEL = '特定商取引法に基づく表記';
export const TOKUSHOHO_LINK_HREF = '/legal/tokushoho/';

/** WO-C7 item 4 (v3) — the notice shown above every buy button, replacing the old
 *  `COPY02_SHORT_REFUND_NOTE`. Ends with a link to the 特商法 page (rendered by the consuming
 *  component) instead of repeating its full text. */
export const COPY02_BUY_NOTICE_LEAD =
  '本商品は買い切り型のデジタルコンテンツです。ご購入後、レッスン2〜7が利用できるようになります。' +
  `ご購入日時から${COPY02_REFUND_WINDOW_HOURS}時間以内で、かつ、有料レッスンを一度も開いていない場合に限り、返金を承ります。` +
  '有料レッスンを一度でも開いた場合（お子さまが誤って開いた場合を含みます）は、原則として返金対象外となります。';

/** 特商法ページ「返品・キャンセル」— WO-C7 item 3's own verbatim v3 text (a lead-in + two
 *  bulleted conditions + the shared consequence/definition sentences + the new exceptional-cases
 *  carve-out + a closing contact instruction), not a reuse of `COPY02_REFUND_FULL_TEXT`'s exact
 *  sentence boundaries since this page frames the same two conditions as an explicit list. */
export const COPY02_TOKUSHOHO_REFUND_SECTION =
  '次の場合は、返金いたします。' +
  `・ご購入日時から${COPY02_REFUND_WINDOW_HOURS}時間以内で、かつ、ご購入後に有料レッスン（レッスン2〜7）を一度も開いていない場合。` +
  '無料のレッスン1のご利用は、有料コンテンツの利用には含まれません。' +
  '・ログイン時の同意をいただけないためにご利用になれない場合で、有料コンテンツの利用開始前であるとき' +
  '（ご購入からの日数にかかわらず、全額返金）。' +
  `有料レッスン（レッスン2〜7）のいずれかを一度でも開いた場合（お子さまが誤って開いた場合を含みます）、` +
  `またはご購入日時から${COPY02_REFUND_WINDOW_HOURS}時間を経過した場合は、上の2つ目の場合を除き、原則として返金対象外となります。` +
  COPY02_PAID_USE_DEFINITION_SENTENCE +
  COPY02_EXCEPTIONAL_CASES_SENTENCE +
  '返金をご希望の場合は、 info@domo-ai.com までご連絡ください。内容を確認のうえ、ご購入時の決済方法で返金いたします。';
