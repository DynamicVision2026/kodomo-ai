import type { ReactNode } from 'react';
import { COMPANY, PAYMENT_METHODS_LIST, PRODUCT } from '../company';
import { COPY02_TOKUSHOHO_REFUND_SECTION } from '../consentText';
import '../legal.css';

// COPY-01 (28 Sep 2026, 酒井先生-reviewed; refund wording legally approved): same "go live at the
// same moment as BEGINNER_LAUNCH, never before" rule as every other COPY-01 surface — real
// visitors keep seeing the pre-launch draft rows until then. Mirrors src/course/BeginnerCourseApp.tsx's
// own VITE_BEGINNER_LAUNCH check.
const BEGINNER_LAUNCH = import.meta.env.VITE_BEGINNER_LAUNCH === '1';

const LEGACY_ROWS: [string, ReactNode][] = [
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
  ['商品名', `${PRODUCT.brand}（モジュール1）`],
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
  ['返品・キャンセルについて', '返金ポリシーは近日公開予定です。詳細が決まり次第、このページでご案内します。'],
];

/** WO-C7 item 3 (Founder, 3 Oct 2026) — the full final replacement text, verbatim. Live only once
 *  BEGINNER_LAUNCH is on — until then this is only visible through the reviewer-only preview
 *  route (item 9), never to a real visitor (same rule `LEGACY_ROWS` above documents). */
const V3_ROWS: [string, ReactNode][] = [
  [
    '販売業者',
    <>
      {COMPANY.name}（コーポレートサイト：
      <a href={COMPANY.corporateSiteUrl} target="_blank" rel="noopener noreferrer">{COMPANY.corporateSiteUrl}</a>
      ）
    </>,
  ],
  ['運営責任者', `${COMPANY.representativeTitle} ${COMPANY.representativeName}`],
  ['所在地', COMPANY.address],
  ['電話番号', `${COMPANY.phone}（${COMPANY.phoneHours}）`],
  ['メールアドレス', COMPANY.email],
  [
    '販売価格',
    `${PRODUCT.fullName}4,980円（税込、月額料金なし）。家族ライセンス：子どものプロフィール3人まで・端末5台まで`,
  ],
  ['商品代金以外の必要料金', 'インターネット接続に必要な通信費はお客様のご負担となります。'],
  ['お支払方法', `${PAYMENT_METHODS_LIST}（Shopify経由）`],
  ['お支払時期', 'ご注文確定時に一度きりのご請求が発生します。自動更新・自動課金はありません。'],
  [
    '商品の引渡し時期・役務の提供時期',
    'お支払い完了後、ただちにレッスン2〜7をご利用いただけます。レッスン1は購入前から無料でご利用いただけます。アクセス方法はご注文確認メールをご確認ください。',
  ],
  ['動作環境', '最新のブラウザ（Safari、Chrome、Edge）。音声を再生できる端末。'],
  ['返品・キャンセル', COPY02_TOKUSHOHO_REFUND_SECTION],
];

function TokushohoBody({ rows, previewBanner }: { rows: [string, ReactNode][]; previewBanner?: boolean }) {
  return (
    <main className="legal">
      {previewBanner && (
        <>
          <p className="legal__draft-banner">
            このページは草案です。公開前に必ず内容をご確認ください。
          </p>
          <p className="legal__draft-banner">
            これはプレビューです。BEGINNER_LAUNCH が有効になると、このページがそのまま公開されます。
          </p>
        </>
      )}
      <h1>特定商取引法に基づく表記</h1>
      <dl className="legal__table">
        {rows.map(([label, value]) => (
          <div className="legal__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}

/**
 * 特定商取引法に基づく表記 — Founder-approved for launch (3 Oct 2026, the BEGINNER_LAUNCH flip).
 * Real company data (see src/legal/company.ts). The draft/review banner now lives only on
 * TokushohoPreviewPage below, never on this, the real public route.
 */
export function TokushohoPage() {
  return <TokushohoBody rows={BEGINNER_LAUNCH ? V3_ROWS : LEGACY_ROWS} />;
}

/** WO-C7 item 9 (Founder, 3 Oct 2026): reviewer-only preview — always the v3 rows, regardless of
 *  BEGINNER_LAUNCH, the same way /lp-new/ always renders the new landing page. Mounted only at the
 *  noindexed /legal/tokushoho-preview/ route (src/legal/tokushoho/previewMain.tsx), never here. */
export function TokushohoPreviewPage() {
  return <TokushohoBody rows={V3_ROWS} previewBanner />;
}
