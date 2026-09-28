import type { ReactNode } from 'react';
import { COMPANY, PRODUCT } from '../company';
import '../legal.css';

// COPY-01 (28 Sep 2026, 酒井先生-reviewed; refund wording legally approved): same "go live at the
// same moment as BEGINNER_LAUNCH, never before" rule as every other COPY-01 surface — real
// visitors keep seeing the pre-launch draft rows until then. Mirrors src/course/BeginnerCourseApp.tsx's
// own VITE_BEGINNER_LAUNCH check.
const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

// COPY-01 §7's exact, legally-approved sentence — identical everywhere it appears (landing page,
// FAQ, Shopify description, this page, and the Shopify refund policy itself).
const REFUND_SENTENCE =
  'ご購入から10日以内で、入門コースのレッスンをまだ始めていない場合は、info@domo-ai.com までご連絡いただければ返金いたします。' +
  'プレイグラウンドを使ったことや、ログインしたことは「始めた」に含みません。';

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
    // AD-15: the old "30-day guarantee" copy was retired with no replacement yet. COPY-01 §7
    // supplies the real, legally-approved wording — shown only once BEGINNER_LAUNCH is on.
    BEGINNER_LAUNCH ? REFUND_SENTENCE : '返金ポリシーは近日公開予定です。詳細が決まり次第、このページでご案内します。',
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
