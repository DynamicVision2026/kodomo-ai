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
 * Founder decision (1 Oct 2026, "launch today... no further legal round before launch"): sections
 * 2-3-4 rewritten again on top of the held COPY-01 §8 commit (`eadae62`) — 制定日 is this page's
 * actual first-publication date (commit `ce0ce8a`, confirmed directly from git history, never
 * guessed); 最終改定日 is this release's own date. Section 4 is now split into 4-1 (what's stored)
 * and 4-2 (the Postmark/overseas-transfer disclosure), each its own anchor — text C v3
 * (src/legal/consentText.ts) links its second bullet straight at `#4-2`, so that heading's `id`
 * must never change without also updating text C's own link.
 *
 * Founder follow-up (APPI compliance gaps, same day): §1 now names the business address/
 * representative — reused directly from `COMPANY.address`/`COMPANY.representativeName`, the
 * same Founder-confirmed values the 特商法 page already publishes (src/legal/company.ts), rather
 * than the rougher 東京都大田区-only placeholder the request itself offered, since the real,
 * already-sourced value is strictly better and keeps this page consistent with that one. Two new
 * sections (開示・訂正・利用停止等 before contact, 安全管理措置 after the third-party/outsourcing
 * section) and §4-1/§6 rewrites close the remaining APPI gaps the Founder flagged. Sections
 * renumbered accordingly; nothing before §4 shifts, so text C v3's own `#4-2` link is unaffected.
 */
export function PrivacyPage() {
  return (
    <main className="legal">
      <p className="legal__draft-banner">
        このページは草案です。公開前に必ず内容をご確認ください。
      </p>
      <h1>プライバシーポリシー</h1>
      <p className="legal__revision-date">制定日：2026年9月18日／最終改定日：2026年10月1日</p>

      <section>
        <h2>1. 事業者情報</h2>
        <p>
          {COMPANY.name}（以下「当社」）は、{PRODUCT.brand}（以下「本サービス」）における
          お客様の情報の取り扱いについて、以下のとおりプライバシーポリシーを定めます。
        </p>
        <dl className="legal__table">
          <div className="legal__row">
            <dt>住所</dt>
            <dd>{COMPANY.address}</dd>
          </div>
          <div className="legal__row">
            <dt>代表者</dt>
            <dd>{COMPANY.representativeTitle} {COMPANY.representativeName}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>2. アプリ本体（お子さまが操作する画面）で取得する情報</h2>
        <p>
          本サービスのアプリ部分に、お名前・ご住所・学校名などを入力する項目はありません。
          お子さまのプロフィールとして保存するのは、あらかじめ用意されたアバターとニックネーム、
          および学習の進み具合に関する情報のみです。
          本サービスは、保護者の方のメールアドレスでログインしてご利用いただきます。
          進行状況は、下記「4. ファミリーアカウントとして保存する情報」のとおり、当社のサーバーに
          保存されます。
        </p>
      </section>

      <section>
        <h2>3. ご購入時に取得する情報</h2>
        <p>
          ご購入手続きは、外部ECプラットフォームであるShopify上で行います。決済は、お選びいただいた
          決済手段に応じて、Shopifyが提供する決済サービス（クレジットカード、Shop Pay、Apple Pay、
          Google Pay）または株式会社KOMOJUが提供する決済サービス（PayPay、メルペイ）で処理されます。
          決済に必要な情報は、それぞれの事業者が、各社のプライバシーポリシーに従って取り扱います。
        </p>
        <p>当社は、完全なクレジットカード番号およびセキュリティコードを取得・保存しません。</p>
        <p>
          当社はShopifyから、注文番号、購入商品、購入金額、購入日時および購入者のメールアドレス等の
          注文情報を受け取り、購入の確認、ファミリーアカウントの識別・連携、ログイン、問い合わせ対応
          および会計処理のために利用します。また、当社は、Shopifyの管理画面において、注文時にご入力
          いただいた情報（お名前、ご連絡先など）、決済手段の種類ならびに決済および返金の状況を確認
          することができ、これらを購入の確認、返金その他の問い合わせ対応および会計処理のために利用
          します。
        </p>
      </section>

      <section>
        <h2>4. ファミリーアカウントとして保存する情報</h2>

        <h3 id="4-1">4-1. 保存する情報と利用目的</h3>
        <p>
          ファミリーアカウントでログインしてご利用いただく場合、本サービスの提供、ログイン認証、
          および学習進捗の保存・表示のために、以下の情報を当社のサーバー（Google Cloud, Firestore、
          東京リージョン）に保存します。
        </p>
        <ul>
          <li>保護者の方のメールアドレス（ログイン用）</li>
          <li>お子さまのプロフィール（あらかじめ用意されたアバター・ニックネーム・学習段階のみ）</li>
          <li>ミッションの進行状況・学習記録</li>
          <li>外国にある第三者への提供についての同意の記録（同意の日時、同意文の版、確認コードの入力が完了した日時）</li>
        </ul>

        <h3 id="4-2">4-2. 外国にある第三者への提供（メール配信事業者）</h3>
        <p>
          当社は、ログイン用の確認コードおよび本サービスに関するお知らせ（ご購入後のご利用開始のお知らせなど）
          のメールの送信業務を、アメリカ合衆国に所在する AC PM, LLC（サービス名：Postmark）に委託して
          います。このため、保護者の方のメールアドレスおよび送信するメールの内容が同社に提供されます。
        </p>
        <p>
          当社は、この提供について、ログイン画面で確認コードを送信する前に、保護者の方の同意をいただいて
          います。同意をいただき、確認コードの入力が完了したメールアドレスにのみ、同社を通じてお知らせの
          メールを送信します。
        </p>
        <ul>
          <li>
            アメリカ合衆国の個人情報保護制度：個人情報保護委員会の資料をご覧ください。
            <br />
            <a href="https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/" target="_blank" rel="noopener noreferrer">
              https://www.ppc.go.jp/enforcement/infoprovision/laws/offshore_report_america/
            </a>
          </li>
          <li>
            同社が講じる個人情報保護のための措置（同社の公表資料にもとづく要約）：
            送信するデータは暗号化した通信で同社に送られ、同社のサーバー（米国シカゴ近郊のデータセンター
            および Amazon Web Services）で取り扱われます。保管中のデータの暗号化、業務に必要な従業員等に
            限ったアクセス、従業員等の守秘義務、漏えい等が発生した場合の顧客への通知などの措置が講じられて
            います。同社は、業務の一部を、データセンター事業者（Deft）、Amazon Web Services、Zendesk に
            再委託しています。お送りしたメールの内容と送信の記録は、同社の設定により45日間保存されたのち
            削除されます（配信できなかったアドレスの記録などは、同社が引き続き保存します）。
          </li>
        </ul>
        <p>同社の資料：</p>
        <ul>
          <li>
            利用規約：
            <a href="https://postmarkapp.com/terms-of-service" target="_blank" rel="noopener noreferrer">
              https://postmarkapp.com/terms-of-service
            </a>
          </li>
          <li>
            データ処理契約（DPA）：
            <a href="https://postmarkapp.com/dpa" target="_blank" rel="noopener noreferrer">
              https://postmarkapp.com/dpa
            </a>
          </li>
          <li>
            再委託先：
            <a href="https://postmarkapp.com/eu-privacy#sub-processors" target="_blank" rel="noopener noreferrer">
              https://postmarkapp.com/eu-privacy#sub-processors
            </a>
          </li>
        </ul>

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
        <h2>6. 第三者提供・委託について</h2>
        <p>
          当社は、法令に基づく場合を除き、あらかじめご本人の同意を得ることなく、個人情報を第三者に
          提供することはありません。ただし、本サービスの提供にあたり必要な範囲内で、個人情報の取り
          扱いの一部を外部（Shopify、決済代行会社、メール配信事業者、Google Cloud等）に委託する場合
          があります。この場合、当社は委託先において情報の適切な安全管理が図られるよう監督します。
        </p>
      </section>

      <section>
        <h2>7. 安全管理措置</h2>
        <p>
          当社は、個人情報の漏えい、滅失またはき損の防止その他の個人情報の安全管理のために、必要
          かつ適切な措置を講じます。また、個人情報の取り扱いを外部（Google Cloudやメール配信事業者
          等）に委託する場合には、委託先に対して必要かつ適切な監督を行います。
        </p>
      </section>

      <section>
        <h2>8. お子さまの個人情報について</h2>
        <p>
          本サービスは、お子さまから氏名・住所・学校名などの個人情報を一切取得しない設計に
          なっています。この方針は、サービスの安全性の根幹として維持します。ファミリーアカウントに
          保存される情報も、保護者の方のメールアドレスと、お子さまが選んだプリセットの
          アバター・ニックネームのみです。
        </p>
      </section>

      <section>
        <h2>9. 保有個人データの開示・訂正・利用停止等について</h2>
        <p>
          当社は、ご本人（または代理人）から保有個人データの開示、訂正、追加、削除、利用停止等の
          お求めがあった場合、ご本人確認の上、法令に従い速やかに対応いたします。これらのご請求、
          または当社の個人情報の取り扱いに関する苦情・ご相談につきましては、下記の「お問い合わせ」
          窓口までご連絡ください。
        </p>
        <p>
          なお、アカウント設定画面（/account）からアカウントの削除操作を行っていただくことで、
          登録情報の速やかな削除（利用停止）が可能です。
        </p>
      </section>

      <section>
        <h2>10. お問い合わせ</h2>
        <p>本ポリシーに関するお問い合わせは、下記メールアドレスまでお願いいたします。</p>
        <p>{COMPANY.email}</p>
      </section>
    </main>
  );
}
