import { COMPANY, PRODUCT } from '../company';
import '../legal.css';

/**
 * Privacy policy — DRAFT. Describes what this codebase actually does (verified across this
 * repo): no free-text input anywhere in the child flow, no child PII fields ever (gate:no-
 * free-text, src/engine/storage.ts), and — since AD-13's Family Account — a purchasing family's
 * parent email and profile/progress records ARE stored server-side (Firestore, Tokyo region).
 * Real content, still pending the founder's own legal review before publishing (same caveat as
 * the 特商法 page) — the APPI overseas-transfer disclosure below needs the founder's final
 * sign-off on wording.
 *
 * COPY-01 §8 (Coordinator, prepared 28 Sep 2026): sections 2-4's first paragraphs rewritten —
 * true both before and after BEGINNER_LAUNCH, so NOT flag-gated (unlike src/legal/tokushoho/
 * TokushohoPage.tsx's own BEGINNER_LAUNCH-gated rows). Root cause this rewrite fixes: the prior
 * wording described a no-account "無料でお試しいただける範囲" local-only guest mode and a
 * 72-hour account trial — neither has been true since AD-13's account-first model shipped
 * (verified: `src/family/api.ts`'s `isFamilyApiConfigured()` reads `VITE_FAMILY_API_URL`, which
 * `Dockerfile.frontend` sets unconditionally, so every real deployment already requires a family
 * login before any mission opens — `src/shell/MissionShell.tsx#enterMission`'s "no session"
 * branch is a redirect to /login/, never anonymous local play). Section 3 now states plainly that
 * this backend never receives/stores card numbers or other payment details (confirmed:
 * `backend/src/shopify.ts`'s `ShopifyOrderPayload` type — the entire shape the webhook payload
 * handler reads — has no such field at all); KOMOJU stays named (Coordinator decision, 28 Sep
 * 2026 follow-up) — only PayPal is dropped (Founder decision: not offered). Section 4's Postmark
 * paragraph is firmed up per the same follow-up: names Postmark alone (the "または Amazon SES"
 * hedge is dropped — no SES code exists anywhere in this repo, only
 * `backend/server/postmarkEmail.ts`) and states its country directly, dropping both the old
 * "we'll announce the specific provider later" sentence AND the APPI overseas-transfer disclosure
 * sentence that used to accompany it — the Coordinator's own replacement text was exactly one
 * sentence; flagged back to the Coordinator in case dropping that legal disclosure line was
 * unintended, since neither instruction explicitly called out removing it.
 *
 * NOT YET PUBLISHED: held per the Coordinator's own instruction (28 Sep 2026) pending 酒井先生's
 * and the founder's legal sign-off — this commit is prepared/committed locally but deliberately
 * not pushed. Do not push this file's changes to the production branch until that sign-off is
 * confirmed (a push to this repo's own production branch auto-deploys to the live site — see
 * docs/launch-runbook.md).
 */
export function PrivacyPage() {
  return (
    <main className="legal">
      <p className="legal__draft-banner">
        このページは草案です。公開前に必ず内容をご確認ください。
      </p>
      <h1>プライバシーポリシー</h1>
      <p className="legal__revision-date">改定日：2026年9月28日</p>

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
          本サービスは、保護者の方のメールアドレスでログインしてご利用いただきます。
          進行状況は、下記「4. ファミリーアカウントとして保存する情報」のとおり、当社のサーバーに
          保存されます。
        </p>
      </section>

      <section>
        <h2>3. ご購入時に取得する情報</h2>
        <p>
          ご購入手続きは外部の決済プラットフォーム（Shopify）上で行われ、お名前・お支払い情報は
          Shopify および決済代行会社（KOMOJU）が取得します。当社が、クレジットカード番号などの
          お支払い情報を受け取ることはありません。当社は、ご購入者様のメールアドレスを Shopify
          から受け取り、ファミリーアカウントの識別・ログインのために使用します。
        </p>
      </section>

      <section>
        <h2>4. ファミリーアカウントとして保存する情報</h2>
        <p>
          ファミリーアカウントでログインしてご利用いただく場合、以下の情報を当社のサーバー
          （Google Cloud, Firestore、東京リージョン）に保存します。
        </p>
        <ul>
          <li>保護者の方のメールアドレス（ログイン用）</li>
          <li>お子さまのプロフィール（あらかじめ用意されたアバター・ニックネーム・学習段階のみ）</li>
          <li>ミッションの進行状況・学習記録</li>
        </ul>
        <p>
          ログイン確認コードの送信には、外部のメール配信事業者（Postmark、所在国：アメリカ合衆国）を
          利用します。
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
