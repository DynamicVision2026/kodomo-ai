import { COMPANY, PRODUCT } from '../company';
import '../legal.css';

/**
 * Privacy policy — DRAFT. Describes what this codebase actually does (verified across this
 * repo): no free-text input anywhere in the child flow, no child PII fields ever (gate:no-
 * free-text, src/engine/storage.ts), and — since AD-13's Family Account — a purchasing family's
 * parent email and profile/progress records ARE stored server-side (Firestore, Tokyo region),
 * unlike the fully-local guest/trial-only path. Real content, still pending the founder's own
 * legal review before publishing (same caveat as the 特商法 page) — in particular the exact
 * processor list (email provider — Postmark or SES, per AD-13's own launch blockers) and the
 * APPI overseas-transfer disclosure below need the founder's final sign-off on wording.
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
          本サービスのアプリ部分に、お名前・ご住所・学校名などを入力する項目はありません。
          お子さまが選ぶのは、あらかじめ用意されたアバターとニックネームのみです。
          無料でお試しいただける範囲（アカウント登録なし）では、進行状況はお使いの端末の中だけに
          保存され、当社のサーバーには送信されません。ご購入後またはお試し期間中にログインされた
          場合は、下記「4. ファミリーアカウントとして保存する情報」のとおり、サーバー側にも
          保存されます。
        </p>
      </section>

      <section>
        <h2>3. ご購入時に取得する情報</h2>
        <p>
          ご購入手続きは外部の決済プラットフォーム（Shopify）上で行われ、お名前・お支払い情報は
          Shopify および決済代行会社（KOMOJU、PayPal）が取得します。当社は、ご購入者様の
          メールアドレスを Shopify から受け取り、ファミリーアカウントの識別・ログインのために
          使用します。
        </p>
      </section>

      <section>
        <h2>4. ファミリーアカウントとして保存する情報</h2>
        <p>
          ご購入いただいた場合、またはお試し期間（アカウント登録から72時間）中にログインされた
          場合、以下の情報を当社のサーバー（Google Cloud, Firestore、東京リージョン）に保存します。
        </p>
        <ul>
          <li>保護者の方のメールアドレス（ログイン用）</li>
          <li>お子さまのプロフィール（あらかじめ用意されたアバター・ニックネーム・学習段階のみ）</li>
          <li>ミッションの進行状況・学習記録</li>
        </ul>
        <p>
          ログイン確認コードの送信には、外部のメール配信事業者（Postmark または Amazon SES）を
          利用します。これらの事業者は日本国外に所在するため、個人情報保護法に基づく外国にある
          第三者への提供に該当します。具体的な事業者名・所在国は、契約確定後に本ページで
          ご案内します。
        </p>
        <p>
          保存されたデータは、アカウント設定画面（/account）からいつでも削除いただけます。
          削除操作を行うと、ご家庭のプロフィール・進行状況・メールアドレスの登録情報は速やかに
          削除されます。
        </p>
      </section>

      <section>
        <h2>5. アクセス解析について</h2>
        <p>
          本サービスでは、Cookie を使わない匿名の解析（ページの表示回数や操作イベントなど）を
          利用しています。個人を特定する情報は含まれず、広告のための計測は行っていません。
        </p>
      </section>

      <section>
        <h2>6. 第三者提供</h2>
        <p>
          法令に基づく場合を除き、取得した情報を上記（Shopify・決済代行会社・メール配信事業者・
          Google Cloud）以外の第三者に提供することはありません。
        </p>
      </section>

      <section>
        <h2>7. お子さまの個人情報について</h2>
        <p>
          本サービスは、お子さまから氏名・住所・学校名などの個人情報を一切取得しない設計に
          なっています。この方針は、サービスの安全性の根幹として維持します。ファミリーアカウントに
          保存される情報も、保護者の方のメールアドレスと、お子さまが選んだプリセットの
          アバター・ニックネームのみです。
        </p>
      </section>

      <section>
        <h2>8. お問い合わせ</h2>
        <p>本ポリシーに関するお問い合わせは、下記メールアドレスまでお願いいたします。</p>
        <p>{COMPANY.email}</p>
      </section>
    </main>
  );
}
