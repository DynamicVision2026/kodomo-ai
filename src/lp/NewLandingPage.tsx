import { useEffect } from 'react';
import { track } from '../engine/analytics';
import { fetchMe } from '../family/api';
import { usePurchaseFlow } from '../family/usePurchaseFlow';
import { FAQ_REFUND_BULLETS } from '../legal/consentText';
import { NoticeD } from '../legal/NoticeD';
import moduleJson from '../modules/m1/module.json';
import '../ad12/tokens.css';
import './landing-page.css';

/**
 * COPY-01 (Coordinator, 28 Sep 2026) — the post-launch landing page. Reviewed by 酒井先生 (28 Sep);
 * the ★ refund sentence is legally approved. This copy describes the product as it will be once
 * `BEGINNER_LAUNCH` is on: the Playground is free, the paid product is the 入門コース (¥4,980),
 * and the 72-hour trial no longer exists. It must never be shown to a real visitor before that —
 * `src/lp/main.tsx` renders this component only when `import.meta.env.VITE_BEGINNER_LAUNCH === '1'`,
 * `LandingPage.tsx` (unchanged) otherwise. `/lp-new/` (this same component, noindexed, `newMain.tsx`)
 * always renders it regardless of the flag, so the Founder can review it before launch.
 *
 * Same product/SKU as the old page — `moduleJson` ('m1') is still what Shopify sells; only its
 * public name changes (入門コース, never "モジュール1" — COPY-01 §1's naming table).
 *
 * Two things this file deliberately leaves out of COPY-01's own section list:
 * - The old grade-picker (1・2年/3・4年/5・6年) — COPY-01's §2 section list doesn't include it;
 *   the new copy positions the product as "8歳ごろから" for the whole family instead (§⑥).
 * - A/B headline testing — COPY-01 gives one headline, not two variants.
 * Both are flagged in this work order's own report for the Coordinator to confirm.
 *
 * A6 gap-fill (Founder, flip-prep 1 Oct 2026): this file was missing two things the old
 * LandingPage.tsx already had and that item 5/10 of the "consent at login" spec made a legal
 * requirement of every buy-button surface — Notice D (the login-consent disclosure) and the
 * consent-decline refund bullet — found during this pass and added below, not previously flagged.
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

/** COPY-01 §3 (identical to §2 ⑩). The ★ refund answer's sentence is exact, legally-approved
 *  wording — never paraphrased, and identical everywhere it appears (landing page, FAQ, Shopify
 *  description, 特定商取引法に基づく表記, Shopify refund policy). Sourced from
 *  src/legal/consentText.ts's `FAQ_REFUND_BULLETS[0]` — the same verbatim sentence the old
 *  LandingPage.tsx's FAQ now shows (item A2, flip-prep 1 Oct 2026) — so the two pages never drift. */
const [REFUND_SENTENCE, CONSENT_REFUND_SENTENCE] = FAQ_REFUND_BULLETS as readonly [string, string];

const FAQ_ITEMS: Array<{ q: string; a: string; extra?: string }> = [
  { q: '無料で、どこまで使えますか？', a: 'プレイグラウンドは、家族のアカウントを作れば無料で使えます。入門コースは有料（¥4,980 税込・買い切り）です。まずはプレイグラウンドで、ナゼホリの雰囲気をたしかめてみてください。' },
  { q: '72時間の無料体験は、なくなったのですか？', a: 'はい。入門コースの公開にともない終了いたしました。かわりに、プレイグラウンドを無料でお使いいただけます。' },
  { q: '何歳から使えますか？', a: '8歳ごろからが目安です。音声とことばは、小学3年生が一度聞いて分かるように作っています。年上のお子さんや大人も、いっしょに楽しめます。' },
  { q: '親がAIにくわしくなくても大丈夫ですか？', a: '大丈夫です。おうちの方に、正しい答えは求めていません。答えに困ったら「分からないね。いっしょに調べてみよう」と言ってください。それも、このコースのゴールの一つです。' },
  { q: 'アプリの中で、AIと話すのですか？', a: 'いいえ。アプリの中で、AIにはつながりません。ご家庭でAIを使うかどうかは、おうちの方がお決めください。' },
  { q: '質問の上手・下手を、判定しますか？', a: 'しません。点数や順位もありません。入り口を1回つかえたら、それで成功です。' },
  { q: '1回に、どのくらい時間がかかりますか？', a: '音声ドラマは4〜6分ほどです。そのあとの練習とチェックは、お子さんのペースで進められます。何回かに分けてもかまいません。' },
  { q: '家族ライセンスとは何ですか？', a: '1回のお支払いで、ご家族みんなで使えるライセンスです。子どものプロフィールは3人まで、端末は5台まで使えます。月額料金はありません。' },
  { q: 'どの端末で使えますか？', a: 'iPad、スマートフォン、パソコンのブラウザで使えます。アプリのダウンロードはいりません。' },
  { q: '端末をかえたら、進みぐあいはどうなりますか？', a: '同じメールアドレスでログインすれば、そのまま続きから使えます。' },
  { q: 'ログインのしかたは？', a: 'おうちの方のメールアドレスを入れると、6けたのコードがメールで届きます。そのコードを入れるだけです。パスワードはありません。' },
  { q: 'コードのメールが届きません。', a: '迷惑メールフォルダをご確認ください。no-reply@domo-ai.com からのメールを受け取れるように設定してください。それでも届かないときは、info@domo-ai.com までご連絡ください。' },
  { q: '以前「モジュール1」を買いました。', a: '追加料金なしで、入門コースをお使いいただけます。これまでと同じメールアドレスでログインしてください。これまでのカードのレッスンは「プレイグラウンド」として、そのまま使えます。' },
  { q: '支払い方法は？', a: 'クレジットカード（Visa・Mastercard・American Express・JCB）、Shop Pay、Apple Pay、Google Pay、PayPay、メルペイがお使いいただけます。Apple Pay と Google Pay は、対応する端末でのみ表示されます。' },
  { q: '返金はできますか？', a: REFUND_SENTENCE, extra: CONSENT_REFUND_SENTENCE },
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
    <main className="lp">
      <section className="lp__hero">
        <h1>AIが答えたら、もう一問。</h1>
        <p className="lp__subhead">ふしぎは、きみのもの。</p>
        <p>
          AIは、なんでもすぐに答えてくれます。でも、答えをもらったら、そこでおしまいでしょうか。
          ナゼホリは、答えのあとに「もう一問」たずねる力を、親子で育てるアプリです。
        </p>
        <div className="lp__cta-row">
          <a className="lp__cta lp__cta--primary" href="/login/?next=/play/" onClick={() => track('cta_play_click')}>
            無料のプレイグラウンドで、あそんでみる
          </a>
          <a className="lp__cta lp__cta--secondary" href="#price">
            入門コースを見る（¥4,980 税込・買い切り）
          </a>
        </div>
        <p className="lp__family-note">8歳ごろから。家族みんなで。</p>
      </section>

      <section className="lp__section">
        <h2>答えは、みじかい。</h2>
        <p>
          答えの中には、まだ分からないことが、かくれています。中身の見えないことば。とばされた理由。
          「みんな」「いつも」のような大きなことば。だれも言っていない前提。ほかの人から見ると、ちがって見えること。
        </p>
        <p>AIは、聞かれたことに答えます。何を知りたいか、分かっているのは、聞く人だけです。</p>
        <p>だから、答えのあとの「もう一問」は、子ども自身のものです。</p>
        <p className="lp__family-note">すごくなくていい。「なんで？」一つで、つぎのドアがひらく。</p>
      </section>

      <section className="lp__section">
        <h2>ナゼホリの進みかた</h2>
        <ol>
          <li><strong>プレイグラウンド（無料）</strong>：カードをえらんで、「なんで？」をためしてみる場所。家族のアカウントを作れば、無料で遊べます。</li>
          <li><strong>入門コース（¥4,980 税込・買い切り）</strong>：答えのあとの「もう一問」の入り口を7つ、1回に1つずつ身につけるコースです。</li>
          <li><strong>その先</strong>：もっと深く考えるステージを、準備しています。内容と時期は、決まりしだいお知らせします。</li>
        </ol>
      </section>

      <section className="lp__section">
        <h2>入門コース：7つの入り口</h2>
        <p>答えを聞いたら、どこから「もう一問」を始めればいい？　入門コースでは、その入り口を7つ、1回に1つずつ練習します。</p>
        <ol className="lp__entrances">
          {ENTRANCES.map((entrance, i) => (
            <li key={entrance.tool} className="lp__entrance">
              <p className="lp__entrance-heading">
                {i + 1}. {entrance.tool} — {entrance.label}
              </p>
              <p className="lp__entrance-when">{entrance.when}</p>
              <p className="lp__entrance-example">{entrance.example}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp__section">
        <h2>1回のレッスン</h2>
        <ul>
          <li><strong>きく</strong>：家族の会話を、音声ドラマで聞きます（4〜6分）。</li>
          <li><strong>れんしゅう</strong>：5つの場面で、その日の入り口をつかってみます。</li>
          <li><strong>チェック</strong>：入り口をつかえたか、ふりかえります。</li>
          <li><strong>おうちで</strong>：家族の会話で、1回つかってみます。つかえたら、おうちの方が「つかえた！★」をおします。</li>
        </ul>
        <p className="lp__family-note">注：点数や順位はありません。質問の上手・下手も判定しません。</p>
        <p>7つの花がさいたら、さいごのページへ。親子の認定証（印刷用）をお届けします。</p>
      </section>

      <section className="lp__section">
        <h2>だれのため？</h2>
        <p className="lp__skill-flow">問う力に、年齢はありません。</p>
        <p>
          8歳ごろから使えます。音声とことばは、小学3年生が一度聞いて分かるように作りました。
          きょうだいも、おうちの方も、おじいちゃん・おばあちゃんも、いっしょにどうぞ。
        </p>
      </section>

      <section className="lp__section">
        <h2>おうちの方へ</h2>
        <p className="lp__skill-flow">答えを知らなくて、大丈夫です。</p>
        <p>
          お子さんの「なんで？」に、うまく答えられなくてもかまいません。「分からないね。いっしょに調べてみよう」
          ――それも、このコースのゴールの一つです。レッスンごとに、おうちの方へのひとことメモがついています。
        </p>
      </section>

      <section className="lp__section lp__trust" aria-label="安心のために">
        <h2>安心のために</h2>
        <ul className="lp__trust-list">
          <li>アプリの中で、AIにはつながりません。</li>
          <li>お子さんが文字を入力する場面はありません。</li>
          <li>お子さんの名前や学校名などの個人情報は、入力しません。</li>
          <li>広告はありません。</li>
          <li>点数やランキング（順位）はありません。</li>
          <li>ログインは、おうちの方のメールアドレスと6けたのコードだけ。パスワードはいりません。</li>
        </ul>
      </section>

      <section className="lp__section lp__price" id="price">
        <h2>料金</h2>
        <p className="lp__price-amount">入門コース ¥4,980（税込）</p>
        <ul>
          <li>買い切り・月額料金なし</li>
          <li>家族ライセンス：1回のお支払いで、家族みんなで使えます（子どものプロフィール3人まで・端末5台まで）</li>
          <li>プレイグラウンドは無料です</li>
          <li>以前「モジュール1」をご購入のご家族は、追加料金なしで入門コースをお使いいただけます。</li>
        </ul>
        {(purchaseState.kind === 'idle' || purchaseState.kind === 'loading' || purchaseState.kind === 'error') && (
          <>
            {/* A6 gap-fill (Founder, flip-prep 1 Oct 2026): this surface was missing Notice D —
                the same login-consent disclosure every other buy button already shows (item 5). */}
            <NoticeD className="lp__notice-d" />
            <button type="button" className="lp__cta lp__cta--primary" onClick={startPurchase} disabled={purchaseState.kind === 'loading'}>
              入門コースを買う
            </button>
          </>
        )}
        {purchaseState.kind === 'error' && (
          <p className="lp__cta-error">{PURCHASE_ERROR_MESSAGE[purchaseState.reason]}</p>
        )}
        {purchaseState.kind === 'awaiting-payment' && (
          <p className="lp__purchase-status">
            お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。
          </p>
        )}
        {purchaseState.kind === 'paid' && (
          <div className="lp__purchase-status lp__purchase-status--paid">
            <p>ご購入ありがとうございます！</p>
            <a className="lp__cta lp__cta--primary" href="/course/beginner/">入門コースをひらく</a>
          </div>
        )}
        <p className="lp__family-note lp__refund-note">★ {REFUND_SENTENCE}</p>
      </section>

      <section className="lp__section lp__faq">
        <h2>よくある質問</h2>
        <dl>
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <dt>{item.q.startsWith('返金') ? '★ ' : ''}{item.q}</dt>
              <dd>
                {item.a}
                {item.extra && <> {item.extra}</>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="lp__footer">
        <a href="/legal/tokushoho/">特定商取引法に基づく表記</a>
        <a href="/legal/privacy/">プライバシーポリシー</a>
        <span>お問い合わせ：info@domo-ai.com</span>
        <span>運営：Beyond Culture 獨歩文化株式会社</span>
      </footer>
    </main>
  );
}
