import { COMPANY, PRODUCT } from '../company';
import '../legal.css';

/**
 * Privacy policy — DRAFT. Describes what this codebase actually collects (verified across
 * this repo: no free-text input anywhere in the child flow, no PII fields, cookieless
 * analytics — see gate:no-free-text and src/engine/storage.ts, analytics.ts) plus the
 * third parties an actual checkout would touch (Shopify/KOMOJU/PayPal — not yet wired,
 * Task 7). Same caveat as the 特商法 page: real content, still pending the founder's own
 * legal review before publishing.
 */
export function PrivacyPage() {
  return (
    <main className="legal">
      <p className="legal__draft-banner">
        このページは草案です。公開前に必ず内容をご確認ください。
      </p>
      <h1>プライバシーポリシー</h1>

      <section>
        <h2>1. 事業者情報</h2>
        <p>
          {COMPANY.name}（以下「当社」）は、{PRODUCT.workingTitle}（以下「本サービス」）における
          お客様の情報の取り扱いについて、以下のとおりプライバシーポリシーを定めます。
        </p>
      </section>

      <section>
        <h2>2. アプリ本体（お子さまが操作する画面）で取得する情報</h2>
        <p>
          本サービスのアプリ部分に、お名前・ご住所・学校名・メールアドレスなどを入力する項目は
          ありません。お子さまが選ぶのは、あらかじめ用意されたアバターとニックネームのみです。
          進行状況はお使いの端末の中だけに保存され、当社のサーバーには送信されません。
        </p>
      </section>

      <section>
        <h2>3. ご購入時に取得する情報</h2>
        <p>
          ご購入手続きは外部の決済プラットフォーム（Shopify）上で行われ、お名前・メールアドレス・
          お支払い情報は Shopify および決済代行会社（KOMOJU、PayPal）が取得します。
          当社は、ご家庭に家族用コードをお届けするために必要なメールアドレスのみを Shopify から
          受け取ります。
        </p>
      </section>

      <section>
        <h2>4. アクセス解析について</h2>
        <p>
          本サービスでは、Cookie を使わない匿名の解析（ページの表示回数や操作イベントなど）を
          利用しています。個人を特定する情報は含まれず、広告のための計測は行っていません。
        </p>
      </section>

      <section>
        <h2>5. 第三者提供</h2>
        <p>
          法令に基づく場合を除き、取得した情報を上記以外の第三者に提供することはありません。
        </p>
      </section>

      <section>
        <h2>6. お子さまの個人情報について</h2>
        <p>
          本サービスは、お子さまから氏名・住所・学校名などの個人情報を一切取得しない設計に
          なっています。この方針は、サービスの安全性の根幹として維持します。
        </p>
      </section>

      <section>
        <h2>7. お問い合わせ</h2>
        <p>本ポリシーに関するお問い合わせは、下記メールアドレスまでお願いいたします。</p>
        <p>{COMPANY.email}</p>
      </section>
    </main>
  );
}
