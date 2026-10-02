import type { ReactNode } from 'react';
import { COMPANY, PRODUCT } from '../company';
import { COPY02_TOKUSHOHO_REFUND_SECTION } from '../consentText';
import '../legal.css';

// COPY-01 (28 Sep 2026, 酒井先生-reviewed; refund wording legally approved): same "go live at the
// same moment as BEGINNER_LAUNCH, never before" rule as every other COPY-01 surface — real
// visitors keep seeing the pre-launch draft rows until then. Mirrors src/course/BeginnerCourseApp.tsx's
// own VITE_BEGINNER_LAUNCH check.
const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

// COPY-02 (Founder, 2 Oct 2026, approved) supersedes COPY-01's §7 sentence above now that the
// product is Lesson 1 free-sample / Lessons 2-7 paid, not the Playground — imported from
// src/legal/consentText.ts so this page and the landing page never hold their own separate copy
// of the same policy (Founder's own instruction: "import the same refund constant").

const ROWS: [string, ReactNode][] = [
  ['販売業者', COMPANY.name],
  ['運営統括責任者', `${COMPANY.representativeTitle} ${COMPANY.representativeName}`],
  ['所在地', COMPANY.address],
  ['法人番号', COMPANY.corporateNumber],
  [
    '電話番号',
    <>ご請求いただければ遅滞なく開示いたします。まずは下記メールアドレスへご連絡ください。</>,
  ],
  ['メールアドレス', COMPANY.email],
  // COPY-01 §1 naming table: "モジュール1" is retired as a public name once BEGINNER_LAUNCH is on.
  ['商品名', `${PRODUCT.workingTitle}（${BEGINNER_LAUNCH ? '入門コース' : 'モジュール1'}）`],
  ['販売価格', `${PRODUCT.price}（買い切り、世帯ライセンス — ご家庭内の全員でご利用いただけます）`],
  ['商品代金以外に必要な費用', 'ございません（インターネット接続料金等はお客様のご負担となります）'],
  // Founder-confirmed against Shopify Settings → Payments, 28 Sep 2026 (same confirmation as
  // COPY-01 §7's FAQ answer) — effective today, not gated on BEGINNER_LAUNCH. PayPal deliberately
  // excluded (Founder decision, 28 Sep 2026): not offered.
  ['お支払い方法', 'クレジットカード（Visa・Mastercard・American Express・JCB）、Shop Pay、Apple Pay、Google Pay、PayPay、メルペイ'],
  ['お支払い時期', 'ご注文確定時'],
  [
    '商品の引き渡し時期',
    'ご注文確定後、ログイン用のご案内メールをお送りします。メールに記載のリンクからログインし、メールで届く確認コードを入力してご利用いただけます。具体的な配信日は販売ページの表示をご確認ください。',
  ],
  [
    '返品・キャンセルについて',
    // AD-15: the old "30-day guarantee" copy was retired with no replacement yet. COPY-02
    // (Founder, 2 Oct 2026, approved) supplies the real, legally-approved wording — including its
    // own login-consent refund condition as the section's second bullet — shown only once
    // BEGINNER_LAUNCH is on; real visitors keep seeing the pre-launch placeholder until then.
    BEGINNER_LAUNCH ? COPY02_TOKUSHOHO_REFUND_SECTION : '返金ポリシーは近日公開予定です。詳細が決まり次第、このページでご案内します。',
  ],
];

/**
 * 特定商取引法に基づく表記 — DRAFT. Real company data (see src/legal/company.ts), but this
 * session is not a substitute for the founder's own legal review before publishing.
 */
export function TokushohoPage() {
  return (
    <main className="legal">
      <p className="legal__draft-banner">
        このページは草案です。公開前に必ず内容をご確認ください。
      </p>
      <h1>特定商取引法に基づく表記</h1>
      <dl className="legal__table">
        {ROWS.map(([label, value]) => (
          <div className="legal__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
