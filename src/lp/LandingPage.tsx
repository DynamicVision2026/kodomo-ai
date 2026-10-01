import { useEffect, useState } from 'react';
import { load, save } from '../engine/storage';
import { track, setVariant } from '../engine/analytics';
import { fetchMe } from '../family/api';
import { usePurchaseFlow } from '../family/usePurchaseFlow';
import { FAQ_REFUND_BULLETS } from '../legal/consentText';
import { NoticeD } from '../legal/NoticeD';
import { Mascot } from '../shell/Mascot';
import moduleJson from '../modules/m1/module.json';
import gardenPlantSpriteRaw from '../course/assets/icons/garden-plant.sprite.svg?raw';
import '../ad12/tokens.css';
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
 * - The headline, trust banner, kit list, safety claims, and roadmap use wording given verbatim
 *   in the spec, or restate features this repo has actually built and this session verified (no
 *   LLM at runtime, no free-text input, no PII in storage, no ad code, household-licence
 *   entitlement model).
 * - The 「いま、家庭で起きていること」section deliberately does NOT cite survey statistics. Spec
 *   v0.5 §10 asks for that, but real citations are the founder's research to supply — inventing
 *   numbers here would be worse than an honest values-framed placeholder.
 * - The footer's legal links point to this app's own /legal/tokushoho and /legal/privacy pages
 *   (src/legal), built from real company data the founder confirmed from soul-id.jp — still
 *   drafts pending the founder's own legal review, not a substitute for one.
 * - AD-13 correction (post-launch-check work order): the trust banner used to claim
 *   「登録不要・子ども情報のクラウド保存なし・完全ローカル完結」 — true of the pre-AD-13 local-only
 *   build, but false since Family Accounts shipped (sign-up IS required; progress IS stored on
 *   the server, by design, so it survives a device change). Replaced with three factual
 *   AD-13-era claims instead: email-only sign-up (no password), no child name/birthdate ever
 *   collected, and progress synced to the account (not to "the cloud" in the vague sense the old
 *   slogan implied avoiding).
 * - Founder decision (flip-prep, 1 Oct 2026): every grade/age reference removed — lessons still
 *   stay designed for Grades 3-4 internally (unchanged in the course itself), but the landing
 *   page never surfaces a grade picker or a grade range in copy; positioned as family-only
 *   instead (「親子で、家族みんなで」). The 「学びの方向性との対応」section (MEXT-alignment table)
 *   is removed for the same flip-prep pass — its wording was explicitly marked pre-legal-review
 *   draft and its source links were all literal `#` placeholders; never shown to a real visitor.
 * - Item A5 (Founder, flip-prep 1 Oct 2026) visual pass: uses the course's real Push B design
 *   tokens (src/ad12/tokens.css — the ink/paper/field/accent custom properties) and two
 *   kinds of EXISTING art only: `<Mascot state="curious">` (src/shell/Mascot.tsx — the generic
 *   「？」-curl blob already used across the course shell) and the growth-flower sprite
 *   (src/course/assets/icons/garden-plant.sprite.svg, the garden's real たね/め/つぼみ/はな icons).
 *   The request named three characters by name — ハテナ、アオイ、ポン太 — but only ポン太 has any
 *   asset in this repo at all (voice lines, no art); ハテナ and アオイ are speaker-name strings
 *   with no visual art anywhere in the codebase. Rather than invent new character art (explicitly
 *   against this same instruction — "existing assets only; no new art"), this page uses the real
 *   assets that DO exist and visually fit the brief (the same "？" mascot and flower-growth motif
 *   the rest of the product already shows a parent during the course) and flags the gap here for
 *   the Founder rather than silently drawing something new.
 */

/** A5: one `<use>` against the growth-flower sprite, mounted once near the end of <main> — the
 *  same real icons the course's own garden screen shows (src/course/Icon.tsx's own pattern). */
function GrowthIcon({ stage, className }: { stage: 'seed' | 'sprout' | 'bud' | 'flower'; className?: string }) {
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden="true">
      <use href={`#p-${stage}`} />
    </svg>
  );
}

const HEADLINES: Record<'A' | 'B', string> = {
  A: '「AIの答えで終わる子」から、「もう一問、深掘りできる子」へ。',
  B: '親子で、同じスタートラインから。AI時代の「深掘り力」を育てる。',
};
const SUBHEAD =
  '保護者も一緒に学べる思考トレーニング。子どもにとっては、ただ楽しいゲームです。';

const TRUST_POINTS = [
  'メールアドレスだけで、かんたん登録（パスワード不要）',
  'お子さまのお名前や生年月日は登録しません',
  '学習の記録はアカウントに保存され、機種を変えても続きから遊べます',
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
  const { state: purchaseState, startPurchase: startPurchaseFlow } = usePurchaseFlow(PURCHASE_MODULE_ID);

  useEffect(() => {
    const state = load();
    setLocalVariant(state.abVariant);
    setVariant(state.abVariant);
    save(state); // persists the variant on first-ever load, when `empty()` just rolled it
    track('lp_view');
  }, []);

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
      {/* A5: the growth-flower sprite mounted once, referenced by every <GrowthIcon> below via
          `<use href="#p-...">` — same technique as src/course/main.tsx's own sprite mount. */}
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: gardenPlantSpriteRaw }} />

      <header className="lp__header">
        <span className="lp__logo">ナゼホリ</span>
        {/* Item A4 (Founder, flip-prep 1 Oct 2026): a visible ログイン link, not just the buy
            flow's own implicit redirect — a returning parent shouldn't have to click "購入する"
            just to reach /login/. */}
        <a className="lp__header-login" href="/login/">ログイン</a>
      </header>

      <section className="lp__hero">
        <div className="lp__hero-mascot">
          <Mascot state="curious" />
        </div>
        <p className="lp__door">親子で、家族みんなで</p>
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
        <a className="lp__login-link" href="/login/">すでにご購入の方はこちら（ログイン）</a>
        <NoticeD className="lp__notice-d" />
      </section>

      <section className="lp__trust" aria-label="登録とデータの取り扱い">
        <ul className="lp__trust-list">
          {TRUST_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
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
        {/* A5: the same seed→sprout→bud→flower growth icons the course garden shows after every
            lesson — here as a purely decorative echo of the 問う→…→ねっこ progression text. */}
        <div className="lp__growth-row" aria-hidden="true">
          <GrowthIcon stage="seed" className="lp__growth-icon" />
          <GrowthIcon stage="sprout" className="lp__growth-icon" />
          <GrowthIcon stage="bud" className="lp__growth-icon" />
          <GrowthIcon stage="flower" className="lp__growth-icon" />
        </div>
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

      <section className="lp__section">
        <h2>これから</h2>
        <ul>
          <li>M1 質問力・深掘り力（今回リリース）</li>
          <li>M2 見直し力（予定）</li>
          <li>M3 整理力（予定）</li>
        </ul>
      </section>

      <section className="lp__section lp__price" id="price">
        <GrowthIcon stage="flower" className="lp__price-icon" />
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
        {/* Founder (1 Oct 2026, final report follow-up): the refund-for-declined-consent promise
            used to appear twice here — once in this paragraph, once inside Notice D right below
            it. Notice D's own lead text already includes it (CONSENT_DECLINE_REFUND_NOTE, src/
            legal/consentText.ts), so this duplicate paragraph is removed; Notice D is now the one
            place it's shown here, same as every other buy-button surface. */}
        {/* Same startPurchase() as the hero CTA above — a real, always-clickable button (never a
            dead href="#"), routing through /login/ when logged out and straight to
            usePurchaseFlow's real purchase-intent flow when logged in. Its own not_configured
            fallback (SHOPIFY_VARIANT_IDS unset for kodomo-ai-m1 — src/family/api.ts's
            createPurchaseIntent) surfaces as the same honest error message this button's own
            purchaseState shows. */}
        {(purchaseState.kind === 'idle' || purchaseState.kind === 'loading' || purchaseState.kind === 'error') && (
          <>
            <NoticeD className="lp__notice-d" />
            <button type="button" className="lp__cta lp__cta--primary" onClick={startPurchase} disabled={purchaseState.kind === 'loading'}>
              購入する
            </button>
            <a className="lp__login-link" href="/login/">すでにご購入の方はこちら（ログイン）</a>
          </>
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
          {/* Item A2 (Founder, flip-prep 1 Oct 2026): the final refund policy, replacing the old
              "近日公開予定" placeholder. */}
          <dd>
            <ul className="lp__faq-refund-list">
              {FAQ_REFUND_BULLETS.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </dd>
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
