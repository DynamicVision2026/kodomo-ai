import { useEffect, useState } from 'react';
import { load, save } from '../engine/storage';
import { track, setVariant } from '../engine/analytics';
import { fetchMe } from '../family/api';
import { usePurchaseFlow } from '../family/usePurchaseFlow';
import moduleJson from '../modules/m1/module.json';
import './landing-page.css';

/** AD-16 §1: the one module this storefront sells today — same source module.json already
 *  supplies the play surface's own moduleId/title, never a second hand-typed copy of either
 *  (mirrors src/parent/account/AccountPage.tsx's own PURCHASE_MODULE_ID). */
const PURCHASE_MODULE_ID = moduleJson.id;

/**
 * Parent-voice landing page. Spec v0.5 §10. Child-facing copy rules do NOT apply here —
 * src/lp is deliberately excluded from gate:no-hardcoded-copy (spec v0.5 §7, pillar 6:
 * "Parent surfaces say 'thinking-training course'").
 *
 * Content status, read before editing:
 * - Sections 1, 2, 4, 5, 6, 7, 8, 9 (headline text, kit list, safety claims, roadmap, price
 *   anchor) use wording given verbatim in the spec, or restate features this repo has actually
 *   built and this session verified (no LLM at runtime, no free-text input, no PII in storage,
 *   no ad code, household-licence entitlement model).
 * - Section 3 (現状) deliberately does NOT cite survey statistics. Spec v0.5 §10 asks for that,
 *   but real citations are the founder's research to supply — inventing numbers here would be
 *   worse than an honest values-framed placeholder.
 * - Section 7A's four "Allowed" sentences are copied verbatim from spec v0.5 §1A, which marks
 *   them "draft, pending native and legal check" — that check has not happened. Do not treat
 *   this section as cleared for public launch; its source links are placeholders pending a
 *   confirmed, stable MEXT URL (this session would not guess one).
 * - Section 11's legal links point to this app's own /legal/tokushoho and /legal/privacy pages
 *   (src/legal), built from real company data the founder confirmed from soul-id.jp — still
 *   drafts pending the founder's own legal review, not a substitute for one.
 * - AD-13 correction (post-launch-check work order): the trust banner used to claim
 *   「登録不要・子ども情報のクラウド保存なし・完全ローカル完結」 — true of the pre-AD-13 local-only
 *   build, but false since Family Accounts shipped (sign-up IS required; progress IS stored on
 *   the server, by design, so it survives a device change). Replaced with three factual
 *   AD-13-era claims instead: email-only sign-up (no password), no child name/birthdate ever
 *   collected, and progress synced to the account (not to "the cloud" in the vague sense the old
 *   slogan implied avoiding).
 * - Founder positioning decision (post-launch-check, wording only — no logic change): lessons
 *   stay designed for Grades 3-4 (the grade picker is unchanged), but the product is marketed as
 *   a whole-family experience — hero badge, a family-note line under the subhead, and a line in
 *   親子で遊びかた framing the child as the one who teaches the family back. The profile/device
 *   caps (3 profiles / 5 devices, AD-15) are now framed as a per-child record limit, paired with
 *   an explicit "no limit on how many family members join in" statement. All of this copy is
 *   pending 酒井先生's review, same as every other section marked so above.
 */

const HEADLINES: Record<'A' | 'B', string> = {
  A: '「AIの答えで終わる子」から、「もう一問、深掘りできる子」へ。',
  B: '親子で、同じスタートラインから。AI時代の「深掘り力」を育てる。',
};
const SUBHEAD =
  '3・4年生の「なぜ？」が深くなる時期に。保護者も一緒に学べる思考トレーニング。' +
  '子どもにとっては、ただ楽しいゲームです。';

const TRUST_POINTS = [
  'メールアドレスだけで、かんたん登録（パスワード不要）',
  'お子さまのお名前や生年月日は登録しません',
  '学習の記録はアカウントに保存され、機種を変えても続きから遊べます',
];

const GRADE_BANDS = ['1・2年', '3・4年', '5・6年'] as const;
type GradeBand = (typeof GRADE_BANDS)[number];

const ALIGNMENT_ROWS = [
  {
    direction: '学習指導要領がめざす「思考力・判断力・表現力」',
    text: '学習指導要領がめざす『思考力・判断力・表現力』の育成に沿って設計しています。',
    sourceHref: '#', // TODO(founder/legal): confirm stable MEXT source URL before launch.
    sourceLabel: '文部科学省 学習指導要領（出典リンクは公開前に確定）',
  },
  {
    direction: '文部科学省 生成AIガイドライン Ver.2.0',
    text: '文部科学省の生成AIガイドライン（Ver.2.0）の考え方 —— AIの答えは参考のひとつ、最後に判断するのは人 —— を、あそびにしました。',
    sourceHref: '#',
    sourceLabel: '文部科学省 生成AIガイドライン（出典リンクは公開前に確定）',
  },
  {
    direction: '3年生から始まる探究的な学習',
    text: '3年生から始まる『探究的な学習』の最初の一歩、『問いを立てる』『調べて深める』を家庭で。',
    sourceHref: '#',
    sourceLabel: '文部科学省 総合的な学習の時間（出典リンクは公開前に確定）',
  },
  {
    direction: '次期学習指導要領（検討中）',
    text: '次の学習指導要領では、3年生からの情報教育の充実が検討されています。',
    sourceHref: '#',
    sourceLabel: '中央教育審議会 資料（出典リンクは公開前に確定）',
  },
];

const KIT_ITEMS = [
  '8つのストーリーミッション + ナゼホリバンク（自由に選べる短いお題）',
  '45枚の質問カード（印刷して遊べるアナログゲーム）',
  '保護者ハンドブック（PDF）— 3つのルール、ミッションごとの問いかけ例',
  'おとな版1分メモ',
  '質問レシピシート + 親子認定証',
  'おとなの見守り付き・本物のAIを使う特別セッションのガイド（1回）',
];

/** usePurchaseFlow (src/family, not exempt from gate:no-hardcoded-copy) stays copy-free — this
 *  mirrors src/parent/account/AccountPage.tsx's own identical map for the same reason. */
const PURCHASE_ERROR_MESSAGE: Record<'not_configured' | 'other', string> = {
  not_configured: 'ただいま購入手続きの準備中です。しばらくしてから、もう一度お試しください。',
  other: '購入手続きを開始できませんでした。しばらくしてから、もう一度お試しください。',
};

export function LandingPage() {
  const [variant, setLocalVariant] = useState<'A' | 'B'>('A');
  const [gradePick, setGradePick] = useState<GradeBand | null>(null);
  const { state: purchaseState, startPurchase: startPurchaseFlow } = usePurchaseFlow(PURCHASE_MODULE_ID);

  useEffect(() => {
    const state = load();
    setLocalVariant(state.abVariant);
    setVariant(state.abVariant);
    save(state); // persists the variant on first-ever load, when `empty()` just rolled it
    track('lp_view');
  }, []);

  function pickGrade(band: GradeBand) {
    setGradePick(band);
    track('grade_pick', { band });
  }

  /** A logged-out visitor is sent to /login/ first — no purchase-intent is ever created for an
   *  anonymous session — and lands back on /account/, where the exact same purchase flow this
   *  function runs is already wired up (AccountPage.tsx's own startPurchase). A logged-in parent
   *  skips straight to usePurchaseFlow's own real purchase-intent call (AD-14 decision 7: opens
   *  in a new tab, then this tab waits for the entitlement), same as that screen. */
  async function startPurchase() {
    track('cta_buy_click');
    const me = await fetchMe();
    if (!me) {
      window.location.href = '/login/?next=' + encodeURIComponent('/account/?buy=1');
      return;
    }
    // Signed in but never consented (an account from before consent existed): agree first.
    if (!me.consentRecorded) {
      window.location.href = '/login/?reconsent=1&next=' + encodeURIComponent('/account/?buy=1');
      return;
    }
    await startPurchaseFlow();
  }

  return (
    <main className="lp">
      <section className="lp__hero">
        <p className="lp__door">小学3・4年生から、家族みんなで</p>
        <h1>{HEADLINES[variant]}</h1>
        <p className="lp__subhead">{SUBHEAD}</p>
        <p className="lp__family-note">問う力に、年齢はありません。お子さまを中心に、家族みんなで「もう一問」。</p>
        <div className="lp__cta-row">
          {/* Architect decision (AD-15 §4): a new visitor always signs in first — no profile
             created before login. `?next=/play/` returns them straight to the app once they
             have (LoginPage.tsx's own resolveNextPath); the existing guest-import reconciliation
             it already runs on a successful login is unaffected, and still the only path for
             someone who already has local profiles from before this change. */}
          <a className="lp__cta lp__cta--primary" href="/login/?next=/play/" onClick={() => track('cta_play_click')}>
            無料でミッション1を体験する
          </a>
          <button type="button" className="lp__cta lp__cta--secondary" onClick={startPurchase}>
            購入する ¥4,980（税込）
          </button>
        </div>
      </section>

      <section className="lp__trust" aria-label="登録とデータの取り扱い">
        <ul className="lp__trust-list">
          {TRUST_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="lp__section lp__grade-pick">
        <h2>どの学年で使いますか？</h2>
        <div className="lp__grade-row">
          {GRADE_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              className={gradePick === band ? 'is-selected' : ''}
              onClick={() => pickGrade(band)}
            >
              {band}
            </button>
          ))}
        </div>
        {gradePick && (
          <p className="lp__grade-note">
            {gradePick === '3・4年'
              ? '今すぐ 3・4年生向けの内容でお楽しみいただけます。'
              : 'まずは 3・4年生向けとして提供しています。他の学年向けは今後追加予定です。どなたでも体験いただけます。'}
          </p>
        )}
      </section>

      <section className="lp__section">
        <h2>いま、家庭で起きていること</h2>
        {/* TODO(founder): replace with cited survey data per spec v0.5 §10 §3 before launch. */}
        <p>
          学校の宿題でAIを使う子が増えています。でも、AIの答えをもらって終わり、になっていないでしょうか。
          「一緒に考えてあげたいけれど、何を聞けばいいか分からない」という保護者の声もよく聞きます。
        </p>
      </section>

      <section className="lp__section lp__skill">
        <h2>身につく力</h2>
        <p className="lp__skill-flow">問う → 浅い答え → もう一問 → ねっこ</p>
        <p>最初の答えで止まらず、もう一問。これを繰り返す力を育てます。</p>
      </section>

      <section className="lp__section">
        <h2>親子で遊べる仕掛け</h2>
        <p>いちばん早く上達するのは、きっとお子さま。覚えたことを家族に「おしえてあげる」のも、学びの一部です。</p>
        <ul>
          <li>よそうバトル — 親子でどちらの予想が当たるか、いっしょに考える</li>
          <li>おしえてあげようカード — 子どもが今日学んだことを家族に説明する</li>
          <li>ほりさげゲーム — カードを使ったアナログの深掘りゲーム</li>
          <li>冬休みスペシャル — 大人でも悩む「大人トラップ」お題</li>
        </ul>
      </section>

      <section className="lp__section">
        <h2>届くもの</h2>
        <ul>
          {KIT_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="lp__section">
        <h2>安心設計</h2>
        <ul>
          <li>本物のAIには接続しません（シミュレーターです）</li>
          <li>文字入力なし</li>
          <li>個人情報の入力なし</li>
          <li>広告なし</li>
        </ul>
      </section>

      <section className="lp__section lp__alignment" id="alignment">
        <h2>学びの方向性との対応</h2>
        <p className="lp__alignment-caveat">
          {/* Draft wording, spec v0.5 §1A — pending native-speaker and legal review before launch. */}
          （このセクションの文言は法務チェック前の草案です）
        </p>
        <div className="lp__alignment-rows">
          {ALIGNMENT_ROWS.map((row) => (
            <div key={row.direction} className="lp__alignment-row">
              <p className="lp__alignment-direction">{row.direction}</p>
              <p className="lp__alignment-text">{row.text}</p>
              <a className="lp__alignment-source" href={row.sourceHref}>
                {row.sourceLabel}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="lp__section">
        <h2>これから</h2>
        <ul>
          <li>M1 質問力・深掘り力（今回リリース）</li>
          <li>M2 見直し力（予定）</li>
          <li>M3 整理力（予定）</li>
        </ul>
      </section>

      <section className="lp__section lp__price" id="price">
        <h2>価格</h2>
        {/* Price display + wording needs the legal check per spec v0.5 §14 before launch. */}
        <p className="lp__price-anchor">AIスクール1か月分より安く、家族みんなで、買い切り。</p>
        <p className="lp__price-amount">¥4,980（税込・買い切り・月額なし）</p>
        <ul>
          <li>世帯ライセンス — ひとつの購入で、ご家庭のお子さま・保護者の方すべてが使えます</li>
          <li>一緒に参加するご家族の人数に制限はありません</li>
          <li>学習の記録はお子さま3人まで（3プロフィール）／5台の端末</li>
          <li>アプリ本体とあそべる印刷キット（質問カードなど）の両方が届きます</li>
          {/* AD-15: the old "30-day guarantee" copy is retired. The new refund policy (a 10-day
              voluntary window, contingent on whether paid content was actually used) is not yet
              finalized/server-enforced — see backend/src/schema.ts's OrderDoc/EntitlementDoc
              timestamps, which already preserve what that check will need. Real wording pending
              the founder/legal review this whole section still needs regardless. */}
          <li>創設ファミリー特典（冬休みスペシャルシート 全9枚 を含む）</li>
        </ul>
        {/* Same startPurchase() as the hero CTA above — a real, always-clickable button (never a
            dead href="#"), routing through /login/ when logged out and straight to
            usePurchaseFlow's real purchase-intent flow when logged in. Its own not_configured
            fallback (SHOPIFY_VARIANT_IDS unset for kodomo-ai-m1 — src/family/api.ts's
            createPurchaseIntent) surfaces as the same honest error message this button's own
            purchaseState shows. */}
        {(purchaseState.kind === 'idle' || purchaseState.kind === 'loading' || purchaseState.kind === 'error') && (
          <button type="button" className="lp__cta lp__cta--primary" onClick={startPurchase} disabled={purchaseState.kind === 'loading'}>
            購入する
          </button>
        )}
        {purchaseState.kind === 'error' && (
          <p className="lp__cta-error">{PURCHASE_ERROR_MESSAGE[purchaseState.reason]}</p>
        )}
        {/* AD-14 decision 7: checkout opened in a new tab (usePurchaseFlow's own startPurchase) —
            this tab waits here, polling /me for the entitlement Shopify's orders/paid webhook
            grants server-side, then hands the parent straight into the app. */}
        {purchaseState.kind === 'awaiting-payment' && (
          <p className="lp__purchase-status">
            お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。
          </p>
        )}
        {purchaseState.kind === 'paid' && (
          <div className="lp__purchase-status lp__purchase-status--paid">
            <p>ご購入ありがとうございます！</p>
            <a className="lp__cta lp__cta--primary" href="/play/">つづきから あそぶ</a>
          </div>
        )}
      </section>

      <section className="lp__section lp__faq">
        <h2>よくある質問</h2>
        <dl>
          <dt>本物のAIとやり取りしますか？</dt>
          <dd>いいえ。アプリの中で子どもが操作するのはすべて事前に用意された内容で、実際のAIには接続しません。</dd>
          <dt>個人情報を入力する場面はありますか？</dt>
          <dd>ありません。名前・住所・学校名などの入力欄はどこにもありません。</dd>
          <dt>ログインコードのメールが届きません</dt>
          <dd>
            ログインコードは no-reply@domo-ai.com から届きます。届かない場合は、迷惑メールフォルダをご確認いただくか、このアドレスからの受信を許可してください。
          </dd>
          <dt>返金はできますか？</dt>
          {/* AD-15: old 30-day guarantee copy retired; the new policy (10-day voluntary window,
              contingent on actual paid-content use) isn't finalized yet — see the price
              section's own note. */}
          <dd>返金ポリシーは近日公開予定です。詳細が決まり次第、このページでご案内します。</dd>
          <dt>兄弟姉妹で使えますか？</dt>
          <dd>
            世帯ライセンスのため、ご家庭のお子さま・保護者の方すべてでお使いいただけます。一緒に参加するご家族の人数に制限はありません。学習の記録はお子さま3人まで（3プロフィール）／5台の端末です。
          </dd>
          <dt>毎月お金がかかりますか？</dt>
          <dd>いいえ。¥4,980の買い切りで、月額料金や自動更新はありません。</dd>
        </dl>
      </section>

      <footer className="lp__footer">
        {/* src/legal — real company data confirmed from soul-id.jp, still drafts pending the
            founder's own legal review (Task 9, docs/work-order-w1.md). */}
        <a href="/legal/tokushoho/">特定商取引法に基づく表記</a>
        <a href="/legal/privacy/">プライバシーポリシー</a>
      </footer>
    </main>
  );
}
