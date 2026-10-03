import { useEffect, type ReactNode } from 'react';
import { track } from '../engine/analytics';
import { fetchMe } from '../family/api';
import { usePurchaseFlow } from '../family/usePurchaseFlow';
import { PAYMENT_METHODS_LIST, PRODUCT } from '../legal/company';
import {
  COPY02_BUY_NOTICE_LEAD, COPY02_FAQ_REFUND_BULLETS, COPY02_FAQ_REFUND_SHORT_SENTENCE,
  TOKUSHOHO_LINK_HREF, TOKUSHOHO_LINK_LABEL,
} from '../legal/consentText';
import { NoticeD } from '../legal/NoticeD';
import moduleJson from '../modules/m1/module.json';
import hatenaQuestionUrl from './assets/svg/hatena_question.svg';
import pontaTabletUrl from './assets/svg/ponta_tablet.svg';
import tool1Url from './assets/svg/tool_1_futa-wo-akeru.svg';
import tool2Url from './assets/svg/tool_2_mae-no-riyuu.svg';
import tool3Url from './assets/svg/tool_3_hamidashi.svg';
import tool4Url from './assets/svg/tool_4_hitotsu-keshite.svg';
import tool5Url from './assets/svg/tool_5_fumidai.svg';
import tool6Url from './assets/svg/tool_6_mukou-ni-suwaru.svg';
import tool7Url from './assets/svg/tool_7_mou-ichimon.svg';
import './nazehori.css';

/**
 * COPY-01 (Coordinator, 28 Sep 2026), superseded by COPY-02 (Founder, 2 Oct 2026, approved) — the
 * post-launch landing page. This copy describes the product as it will be once `BEGINNER_LAUNCH`
 * is on: Lesson 1 is the free sample, Lessons 2-7 and the ending page are the paid 入門コース
 * (¥4,980), and the 72-hour trial no longer exists (the Playground itself is also retired —
 * COPY-02 replaces every COPY-01 reference to it with the Lesson 1 free-sample framing). It must
 * never be shown to a real visitor before that —
 * `src/lp/main.tsx` renders this component only when `import.meta.env.VITE_BEGINNER_LAUNCH === '1'`,
 * `LandingPage.tsx` (unchanged) otherwise. `/lp-new/` (this same component, noindexed, `newMain.tsx`)
 * always renders it regardless of the flag, so the Founder can review it before launch.
 *
 * Same product/SKU as the old page — `moduleJson` ('m1') is still what Shopify sells; only its
 * public name changes (入門コース, never "モジュール1" — COPY-01 §1's naming table).
 *
 * Two things this file deliberately leaves out of COPY-01's own section list:
 * - The old grade-picker (1・2年/3・4年/5・6年) — COPY-01's §2 section list doesn't include it.
 *   COPY-01 itself originally positioned the product as "8歳ごろから" for the whole family (§⑥);
 *   the Founder's later flip-prep decision (1 Oct 2026, same one `LandingPage.tsx` documents)
 *   removed every age/grade reference from both landing pages entirely — family-only positioning
 *   now, no age anywhere, including this file's FAQ and 「だれのため？」 section below.
 * - A/B headline testing — COPY-01 gives one headline, not two variants.
 * Both are flagged in this work order's own report for the Coordinator to confirm.
 *
 * A6 gap-fill (Founder, flip-prep 1 Oct 2026): this file was missing two things the old
 * LandingPage.tsx already had and that item 5/10 of the "consent at login" spec made a legal
 * requirement of every buy-button surface — Notice D (the login-consent disclosure) and the
 * consent-decline refund bullet — found during this pass and added below, not previously flagged.
 *
 * Marketing design-pack redesign (Founder, 1 Oct 2026): colors/type/shape now come from
 * `nazehori-tokens.css` (imported via ./nazehori.css) and the character/tool SVGs the Founder
 * supplied, replacing the earlier AD-12 token pass + generic Mascot/growth-flower placeholders —
 * this file no longer imports `../ad12/tokens.css` or `./landing-page.css` at all, since every
 * class it uses now comes from `nazehori.css`'s own `.nz-*` set.
 *
 * The 7 lesson cards below are ordered b01→b07 (the real course sequence), each paired with its
 * OWN tool's icon — `tool_1`..`tool_7` in the design pack are numbered by that same b01..b07
 * lesson order (confirmed against src/course/content/lessons/beginner.course.json's own
 * id→tool-letter map and courseUi.json's toolLabels), not by the tool letters' A-Z order, which
 * is why `ENTRANCES` below (already in lesson order from the original COPY-01 pass) lines up
 * directly with `TOOL_ICONS` position-for-position — not a re-sort, just confirmed as already
 * correct and documented here so a future edit doesn't "fix" it into the wrong order.
 */

const ENTRANCES = [
  { tool: 'おべんとうばこ', label: 'ふたを あける', when: '中身の見えないことばがあるとき', example: '「少しって、どのくらい？」' },
  { tool: 'ドミノ', label: 'まえの りゆうを 見る', when: 'まえとあとは分かるのに、あいだが見えないとき', example: '「なにがあって、こうなったの？」' },
  { tool: 'かさ', label: 'はみだしを さがす', when: '「みんな」「いつも」などの大きなことばがあるとき', example: '「じゃあ、〇〇は、どう？」' },
  { tool: 'けしゴム', label: 'ひとつ けして かく', when: '理由がいくつもあるとき', example: '「もし、〇〇だけ△△だったら？」' },
  { tool: 'ふみ台', label: 'ふみ台を 見る', when: '答えが、だれも言っていないことの上に立っているとき', example: '「〇〇って、ほんとうに△△？」' },
  { tool: 'シーソー', label: 'むこうに すわる', when: '答えが、自分の側からだけ見ているとき', example: '「〇〇から見たら、どう？」' },
  { tool: '虫とりあみ', label: 'もう 一問', when: '答えを聞いたあと、いつでも', example: 'なんで？ゲーム：ことばを一つつかまえて「なんで？」' },
] as const;

const TOOL_ICONS = [tool1Url, tool2Url, tool3Url, tool4Url, tool5Url, tool6Url, tool7Url] as const;

const LESSONS = ENTRANCES.map((entrance, i) => ({
  ...entrance,
  lessonId: `b0${i + 1}`,
  icon: TOOL_ICONS[i],
}));

/** WO-C7 item 5(a) (Founder, 3 Oct 2026): the 「返金はできますか？」 answer no longer repeats the
 *  full legal text — a short sentence, then a link to the 特商法 page. The second bullet
 *  (declined-login-consent refund) is unchanged (A6 gap-fill, item 10's spec), still sourced from
 *  src/legal/consentText.ts's `COPY02_FAQ_REFUND_BULLETS` second element. Founder, 3 Oct 2026: the
 *  ★ marker that used to prefix this FAQ question was an internal "legally approved" annotation
 *  only — never meant to show to customers, so it's removed from the rendered `<dt>`. */
const [, CONSENT_REFUND_SENTENCE] = COPY02_FAQ_REFUND_BULLETS;

// COPY-02 (Founder, 2 Oct 2026, approved): the Lesson 1 free-sample / Lessons 2-7 paid FAQ set,
// replacing COPY-01's Playground-era questions. The returning-Module-1-buyer answer is a
// deliberate open question (not yet confirmed whether past Playground progress stays saved under
// the new course structure, or is simply not surfaced any more) — see this session's own report.
const FAQ_ITEMS: Array<{ q: string; a: ReactNode; extra?: ReactNode }> = [
  { q: '無料で、どこまで？', a: 'レッスン1は、家族のアカウントを作れば無料で使えます。レッスン2〜7とさいごのページは、入門コース（¥4,980 税込・買い切り）を購入するとひらきます。まずはレッスン1で、ナゼホリの雰囲気をたしかめてみてください。' },
  { q: '72時間の無料体験は？', a: 'はい、終了いたしました。かわりに、レッスン1を無料でお使いいただけます。' },
  { q: 'どんな人が使えますか？', a: '家族みんなで使えます。音声とことばは、一度聞いて分かるように、やさしく作っています。きょうだいも、おうちの方も、おじいちゃん・おばあちゃんも、いっしょに楽しめます。' },
  { q: '親がAIにくわしくなくても大丈夫ですか？', a: '大丈夫です。おうちの方に、正しい答えは求めていません。答えに困ったら「分からないね。いっしょに調べてみよう」と言ってください。それも、このコースのゴールの一つです。' },
  { q: 'アプリの中で、AIと話すのですか？', a: 'いいえ。アプリの中で、AIにはつながりません。ご家庭でAIを使うかどうかは、おうちの方がお決めください。' },
  { q: '質問の上手・下手を、判定しますか？', a: 'しません。点数や順位もありません。入り口を1回つかえたら、それで成功です。' },
  { q: '1回に、どのくらい時間がかかりますか？', a: '音声ドラマは4〜6分ほどです。そのあとの練習とチェックは、お子さんのペースで進められます。何回かに分けてもかまいません。' },
  { q: '家族ライセンスとは何ですか？', a: '1回のお支払いで、ご家族みんなで使えるライセンスです。子どものプロフィールは3人まで、端末は5台まで使えます。月額料金はありません。' },
  { q: 'どの端末で使えますか？', a: 'iPad、スマートフォン、パソコンのブラウザで使えます。アプリのダウンロードはいりません。' },
  { q: '端末をかえたら、進みぐあいはどうなりますか？', a: '同じメールアドレスでログインすれば、そのまま続きから使えます。' },
  { q: 'ログインのしかたは？', a: 'おうちの方のメールアドレスを入れると、6けたのコードがメールで届きます。そのコードを入れるだけです。パスワードはありません。' },
  { q: 'コードのメールが届きません。', a: '迷惑メールフォルダをご確認ください。no-reply@domo-ai.com からのメールを受け取れるように設定してください。それでも届かないときは、info@domo-ai.com までご連絡ください。' },
  { q: '以前「モジュール1」を買いました。', a: '追加料金なしで、入門コースをお使いいただけます。これまでと同じメールアドレスでログインしてください。これまでのカードのレッスンは、新しいコース構成では表示されませんが、これまでの記録は、保存されています。' },
  { q: '支払い方法は？', a: `${PAYMENT_METHODS_LIST}がお使いいただけます。Apple Pay と Google Pay は、対応する端末でのみ表示されます。` },
  {
    q: '返金はできますか？',
    a: (
      <>
        {COPY02_FAQ_REFUND_SHORT_SENTENCE}
        詳しい条件は「<a href={TOKUSHOHO_LINK_HREF}>{TOKUSHOHO_LINK_LABEL}</a>」をご覧ください。
      </>
    ),
    extra: CONSENT_REFUND_SENTENCE,
  },
  { q: '無料のレッスン1を使ってから購入しても、返金してもらえますか？', a: 'はい。無料のレッスン1のご利用は、有料コンテンツの利用には含まれません。ご購入後3日以内で、有料レッスン（レッスン2〜7）を一度も開いていなければ、返金いたします。' },
  { q: '購入後の3日間は、コース全部をためせる期間ですか？', a: 'いいえ。3日以内でも、有料レッスン（レッスン2〜7）を一度でも開いた場合（お子さまが誤って開いた場合を含みます）は、原則として返金対象外となります。購入したけれど、まだ有料レッスンを開いていない方のための期間です。' },
];

const PURCHASE_MODULE_ID = moduleJson.id;

const PURCHASE_ERROR_MESSAGE: Record<'not_configured' | 'other', string> = {
  not_configured: 'ただいま購入手続きの準備中です。しばらくしてから、もう一度お試しください。',
  other: '購入手続きを開始できませんでした。しばらくしてから、もう一度お試しください。',
};

export function NewLandingPage() {
  const { state: purchaseState, startPurchase: startPurchaseFlow } = usePurchaseFlow(PURCHASE_MODULE_ID);

  useEffect(() => {
    track('lp_view');
  }, []);

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
    <main className="nz-page">
      <header className="nz-header">
        <span className="nz-logo">ナゼホリ</span>
        <a className="nz-header-login" href="/login/">ログイン</a>
      </header>

      <section className="nz-hero">
        <div className="nz-hero-art">
          <img className="nz-hero-hatena" src={hatenaQuestionUrl} alt="" aria-hidden="true" />
          <img className="nz-hero-ponta" src={pontaTabletUrl} alt="" aria-hidden="true" />
        </div>
        <h1>
          AIが答えたら、<span className="nz-mark">もう一問</span>。
        </h1>
        <p className="nz-subhead">ふしぎは、きみのもの。</p>
        <p>
          AIは、なんでもすぐに答えてくれます。でも、答えをもらったら、そこでおしまいでしょうか。
          ナゼホリは、答えのあとに「もう一問」たずねる力を、親子で育てるアプリです。
        </p>
        <div className="nz-cta-row">
          {/* Item 3 (Founder, 1 Oct 2026): the paid path is now the primary (yellow) button, the
              free Playground is the secondary (white/outline) one — the design pack's own buy/
              free-trial button treatment. */}
          <a className="nz-cta nz-cta--buy" href="#price">
            入門コースを見る（¥4,980 税込・買い切り）
          </a>
          {/* COPY-02 (Founder, 2 Oct 2026): Lesson 1 is the free sample now, not the Playground —
              Button 2 (above) is unchanged. */}
          <a className="nz-cta nz-cta--trial" href="/login/?next=/course/beginner/" onClick={() => track('cta_play_click')}>
            レッスン1を無料で試してみる
          </a>
        </div>
        <p className="nz-family-note">家族みんなで。</p>
        <a className="nz-login-link" href="/login/">すでにご購入の方はこちら（ログイン）</a>
      </section>

      {/* Item 4 (Founder, 1 Oct 2026) names 「いま、家庭で起きていること」 — a section that only
          exists on the OLD LandingPage.tsx (`/`). This page's own closest equivalent (the
          problem-framing section right after the hero) gets the same full-width navy band
          treatment here; the literal section is handled in LandingPage.tsx itself. */}
      <section className="nz-band-navy">
        <div className="nz-band-inner">
          <h2>答えは、みじかい。</h2>
          <p>
            答えの中には、まだ分からないことが、かくれています。中身の見えないことば。とばされた理由。
            「みんな」「いつも」のような大きなことば。だれも言っていない前提。ほかの人から見ると、ちがって見えること。
          </p>
          <p>AIは、聞かれたことに答えます。何を知りたいか、分かっているのは、聞く人だけです。</p>
          <p>だから、答えのあとの「もう一問」は、子ども自身のものです。</p>
          <p className="nz-family-note" style={{ color: '#fff' }}>すごくなくていい。「なんで？」一つで、つぎのドアがひらく。</p>
        </div>
      </section>

      <section className="nz-section">
        <div className="nz-card">
          <h2>ナゼホリの進みかた</h2>
          <ol>
            <li><strong>無料のレッスン1</strong>：入門コースの最初の1回を、無料でお使いいただけます。家族のアカウントを作れば、すぐに始められます。</li>
            <li><strong>入門コース（¥4,980 税込・買い切り）</strong>：答えのあとの「もう一問」の入り口を7つ、1回に1つずつ身につけるコースです。レッスン2〜7とさいごのページは、購入するとひらきます。</li>
            <li><strong>その先</strong>：もっと深く考えるステージを、準備しています。内容と時期は、決まりしだいお知らせします。</li>
          </ol>
        </div>
      </section>

      {/* Item 5 (Founder, 1 Oct 2026): a grid of seven white cards, each with its own lesson's
          tool icon and name — two columns on a phone, more on wider screens (nazehori.css). */}
      <section className="nz-section">
        <h2>入門コース：7つの入り口</h2>
        <p>答えを聞いたら、どこから「もう一問」を始めればいい？　入門コースでは、その入り口を7つ、1回に1つずつ練習します。</p>
        <div className="nz-lessons-grid">
          {LESSONS.map((lesson, i) => (
            <div key={lesson.lessonId} className="nz-lesson-card">
              <img src={lesson.icon} alt="" aria-hidden="true" />
              <p className="nz-lesson-card-step">{i + 1}日目</p>
              <p className="nz-lesson-card-name">{lesson.tool}</p>
              <p className="nz-lesson-card-label">{lesson.label}</p>
            </div>
          ))}
        </div>
        <p className="nz-family-note">レッスン1は無料です。</p>
      </section>

      <section className="nz-section">
        <div className="nz-card">
          <h2>1回のレッスン</h2>
          <ul>
            <li><strong>きく</strong>：家族の会話を、音声ドラマで聞きます（4〜6分）。</li>
            <li><strong>れんしゅう</strong>：5つの場面で、その日の入り口をつかってみます。</li>
            <li><strong>チェック</strong>：入り口をつかえたか、ふりかえります。</li>
            <li><strong>おうちで</strong>：家族の会話で、1回つかってみます。つかえたら、おうちの方が「つかえた！★」をおします。</li>
          </ul>
          <p className="nz-family-note">注：点数や順位はありません。質問の上手・下手も判定しません。</p>
          <p>7つの花がさいたら、さいごのページへ。親子の認定証（印刷用）をお届けします。</p>
        </div>
      </section>

      <section className="nz-section">
        <div className="nz-card">
          <h2>だれのため？</h2>
          <p>問う力に、年齢はありません。</p>
          <p>音声とことばは、一度聞いて分かるように、やさしく作りました。きょうだいも、おうちの方も、おじいちゃん・おばあちゃんも、いっしょにどうぞ。</p>
        </div>
      </section>

      <section className="nz-section">
        <div className="nz-card">
          <h2>おうちの方へ</h2>
          <p>答えを知らなくて、大丈夫です。</p>
          <p>
            お子さんの「なんで？」に、うまく答えられなくてもかまいません。「分からないね。いっしょに調べてみよう」
            ――それも、このコースのゴールの一つです。レッスンごとに、おうちの方へのひとことメモがついています。
          </p>
        </div>
      </section>

      <section className="nz-section">
        <div className="nz-card" aria-label="安心のために">
          <h2>安心のために</h2>
          <ul>
            <li>アプリの中で、AIにはつながりません。</li>
            <li>お子さんが文字を入力する場面はありません。</li>
            <li>お子さんの名前や学校名などの個人情報は、入力しません。</li>
            <li>広告はありません。</li>
            <li>点数やランキング（順位）はありません。</li>
            <li>ログインは、おうちの方のメールアドレスと6けたのコードだけ。パスワードはいりません。</li>
          </ul>
        </div>
      </section>

      {/* Item 6 (Founder, 1 Oct 2026): one white card, the big price, Notice D once above the
          one yellow buy button. */}
      <section className="nz-section" id="price">
        <div className="nz-card nz-price-card">
          <h2>料金</h2>
          <p className="nz-price-amount">入門コース ¥4,980（税込）</p>
          <ul>
            <li>買い切り・月額料金なし</li>
            <li>家族ライセンス：1回のお支払いで、家族みんなで使えます（子どものプロフィール3人まで・端末5台まで）</li>
            <li>レッスン1は無料でご利用いただけます。レッスン2〜7とさいごのページは、購入するとひらきます。</li>
          </ul>
          {(purchaseState.kind === 'idle' || purchaseState.kind === 'loading' || purchaseState.kind === 'error') && (
            <>
              {/* A6 gap-fill (Founder, flip-prep 1 Oct 2026): this surface was missing Notice D —
                  the same login-consent disclosure every other buy button already shows (item 5
                  of the consent spec). Shown once, above the button, per the Founder's own item 6
                  of this redesign pass. */}
              <NoticeD className="nz-notice-d" />
              {/* WO-C7 item 4 (Founder, 3 Oct 2026, v3): the buy-button notice, its own paragraph
                  under Notice D — never a replacement for Notice D's own consent disclosure. Ends
                  with a link to the 特商法 page instead of repeating its full text. */}
              <p className="nz-family-note">
                {COPY02_BUY_NOTICE_LEAD}
                詳しくは「<a href={TOKUSHOHO_LINK_HREF}>{TOKUSHOHO_LINK_LABEL}</a>」をご覧ください。
              </p>
              <button type="button" className="nz-cta nz-cta--buy" onClick={startPurchase} disabled={purchaseState.kind === 'loading'}>
                入門コースを買う
              </button>
            </>
          )}
          {purchaseState.kind === 'error' && (
            <p className="nz-cta-error">{PURCHASE_ERROR_MESSAGE[purchaseState.reason]}</p>
          )}
          {purchaseState.kind === 'awaiting-payment' && (
            <p className="nz-purchase-status">
              お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。
            </p>
          )}
          {purchaseState.kind === 'paid' && (
            <div className="nz-purchase-status nz-purchase-status--paid">
              <p>ご購入ありがとうございます！</p>
              <a className="nz-cta nz-cta--buy" href="/course/beginner/">入門コースをひらく</a>
            </div>
          )}
        </div>
      </section>

      <section className="nz-section">
        <h2>よくある質問</h2>
        <dl className="nz-faq-list">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q} className="nz-card nz-faq-card">
              <dt>{item.q}</dt>
              <dd>
                {item.a}
                {item.extra && <> {item.extra}</>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* WO-C7 item 2 (Founder, 3 Oct 2026): the legal footer moved to static HTML in this
          route's own index.html (outside the React root), so it reads as plain HTML before any
          JS runs — every page needs it, not just this component. Removed here to avoid showing
          it twice. */}
    </main>
  );
}
