import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewLandingPage } from '../src/lp/NewLandingPage';

let plausible: ReturnType<typeof vi.fn>;
let originalLocation: Location;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  localStorage.clear();
  plausible = vi.fn();
  window.plausible = plausible;
  originalLocation = window.location;
  Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });
});

afterEach(() => {
  cleanup();
  delete window.plausible;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
});

// COPY-01 (28 Sep 2026, 酒井先生-reviewed): the post-launch landing page. This component only
// ever renders in production once BEGINNER_LAUNCH is on (src/lp/main.tsx's own gate) or on the
// noindexed /lp-new/ preview route (src/lp/newMain.tsx) — these tests exercise the component
// directly, the same way BeginnerCourseApp's own licensed-gated content is tested via its screens
// rather than main.tsx.
describe('NewLandingPage (COPY-01)', () => {
  it('tracks lp_view on mount', () => {
    render(<NewLandingPage />);
    expect(plausible).toHaveBeenCalledWith('lp_view', expect.anything());
  });

  it('shows the COPY-01 hero headline and both CTAs', () => {
    render(<NewLandingPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('AIが答えたら、もう一問。');
    // COPY-02 (Founder, 2 Oct 2026): Lesson 1 is the free sample now, not the Playground.
    expect(screen.getByText('レッスン1を無料で試してみる').closest('a')).toHaveAttribute('href', '/login/?next=/course/beginner/');
    expect(screen.getByText('入門コースを見る（¥4,980 税込・買い切り）').closest('a')).toHaveAttribute('href', '#price');
  });

  it('renders all 7 entrance cards in order, each with its tool, situation and example question', () => {
    render(<NewLandingPage />);
    const cards = document.querySelectorAll('.nz-lesson-card');
    expect(cards).toHaveLength(7);
    expect(cards[0]!.textContent).toContain('おべんとうばこ');
    expect(cards[0]!.textContent).toContain('ふたを あける');
    expect(cards[6]!.textContent).toContain('虫とりあみ');
    expect(cards[6]!.textContent).toContain('もう 一問');
  });

  it('renders every §8 safety line', () => {
    render(<NewLandingPage />);
    for (const line of [
      'アプリの中で、AIにはつながりません。',
      'お子さんが文字を入力する場面はありません。',
      'お子さんの名前や学校名などの個人情報は、入力しません。',
      '広告はありません。',
      '点数やランキング（順位）はありません。',
      'ログインは、おうちの方のメールアドレスと6けたのコードだけ。パスワードはいりません。',
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });

  it('renders all 17 FAQ questions (COPY-02, 2 Oct 2026), the refund question never starred (Founder, 3 Oct 2026: the ★ was an internal marker only), using the exact approved COPY-02 sentence plus the consent-decline bullet', () => {
    render(<NewLandingPage />);
    const dts = document.querySelectorAll('.nz-faq-card dt');
    expect(dts).toHaveLength(17);
    expect(Array.from(dts).some((dt) => dt.textContent?.includes('何歳'))).toBe(false);
    const refundDt = Array.from(dts).find((dt) => dt.textContent?.includes('返金はできますか？'));
    expect(refundDt?.textContent).toBe('返金はできますか？');
    const refundDd = refundDt?.nextElementSibling;
    const text = (refundDd?.textContent ?? '').replace(/\s+/g, '');
    expect(text).toContain(
      (
        'ご購入後3日以内で、かつ、ご購入後に有料レッスン（レッスン2〜7）を一度も開いていない場合に限り、info@domo-ai.com までご連絡いただければ、購入代金を返金いたします。' +
        '無料のレッスン1のご利用は、有料コンテンツの利用には含まれません。'
      ).replace(/\s+/g, ''),
    );
    // COPY-02's own updated consent-decline refund bullet (ties the promise to "paid content",
    // now that Lesson 1 is an explicit free/unpaid surface).
    expect(text).toContain('ログイン時の同意をいただけないためにご利用になれない場合は'.replace(/\s+/g, ''));
    expect(text).toContain('有料コンテンツの利用開始前であれば'.replace(/\s+/g, ''));
  });

  it('Founder, 3 Oct 2026 (cosmetic): the email address in the refund answer is glued to the preceding text with a non-breaking space, not a plain concatenation, so it never starts its own line', () => {
    render(<NewLandingPage />);
    const dts = document.querySelectorAll('.nz-faq-card dt');
    const refundDt = Array.from(dts).find((dt) => dt.textContent?.includes('返金はできますか？'));
    const refundDd = refundDt?.nextElementSibling;
    const rawText = refundDd?.textContent ?? '';
    expect(rawText).toContain('限り、 info@domo-ai.com');
  });

  it('the price section shows the ¥4,980 amount, household-licence facts, and the prior-Module-1-buyer line', () => {
    render(<NewLandingPage />);
    const price = document.querySelector('.nz-price-card')!;
    expect(price.textContent).toContain('¥4,980');
    expect(price.textContent).toContain('買い切り・月額料金なし');
    expect(price.textContent).toContain('子どものプロフィール3人まで・端末5台まで');
    expect(price.textContent).toContain('レッスン1は無料でご利用いただけます。レッスン2〜7とさいごのページは、購入するとひらきます。');
    expect(price.textContent).toContain('以前「モジュール1」をご購入のご家族は、追加料金なしで入門コースをお使いいただけます。');
  });

  it('COPY-02 (2 Oct 2026): the price section shows the short refund note as its own paragraph under Notice D', () => {
    render(<NewLandingPage />);
    const price = document.querySelector('.nz-price-card')!;
    expect(price.textContent).toContain('ご購入後、レッスン2〜7が利用できるようになります。');
    expect(price.textContent).toContain('ご購入後3日以内で、かつ、有料レッスンを一度も開いていない場合に限り、返金を承ります。');
  });

  it('final report follow-up (1 Oct 2026): the price section shows the consent-refund sentence exactly once (inside Notice D), with no separate duplicate paragraph', () => {
    render(<NewLandingPage />);
    const price = document.querySelector('.nz-price-card')!;
    expect(price.querySelector('.nz-refund-note')).toBeNull();
    expect(price.querySelectorAll('.nz-notice-d')).toHaveLength(1);
    const matches = (price.textContent ?? '').match(/同意いただけない場合は、ログインできないため/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('A6 gap-fill (Founder, flip-prep 1 Oct 2026): Notice D (the login-consent disclosure, item 5) appears above the buy button, same as every other buy-button surface', () => {
    render(<NewLandingPage />);
    const notice = document.querySelector('.nz-price-card .nz-notice-d');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('保護者の方のメールアドレスでのログインが必要です');
    expect(notice?.querySelector('a')).toHaveAttribute('href', '/legal/privacy/');
  });

  it('Founder follow-up (1 Oct 2026): no age/grade reference anywhere — family-only positioning', () => {
    render(<NewLandingPage />);
    expect(screen.getByText('家族みんなで。')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const banned of ['歳', '年生', '学年']) {
      expect(text).not.toContain(banned);
    }
  });

  it('never uses retired naming ("お試し", "体験期間", "トライアル") anywhere', () => {
    render(<NewLandingPage />);
    const text = document.body.textContent ?? '';
    for (const retired of ['お試し', '体験期間', 'トライアル', 'trial']) {
      expect(text).not.toContain(retired);
    }
  });

  it('"72時間"/"無料体験" appear exactly once — the FAQ question that explicitly says the trial is gone — never as a live offer elsewhere', () => {
    render(<NewLandingPage />);
    const dts = Array.from(document.querySelectorAll('.nz-faq-card dt'));
    const trialFaqIndex = dts.findIndex((dt) => dt.textContent?.includes('72時間の無料体験は？'));
    expect(trialFaqIndex).toBeGreaterThanOrEqual(0);
    const dds = document.querySelectorAll('.nz-faq-card dd');
    expect(dds[trialFaqIndex]!.textContent).toContain('終了いたしました');

    const text = document.body.textContent ?? '';
    expect(text.split('72時間').length - 1).toBe(1);
    expect(text.split('無料体験').length - 1).toBe(1);
  });

  it('a logged-out visitor clicking the price-section purchase button is sent to /login/, never straight to a purchase-intent call', async () => {
    const user = userEvent.setup();
    render(<NewLandingPage />);
    const buyButton = screen.getByText('入門コースを買う');
    expect(buyButton.tagName).toBe('BUTTON');

    await user.click(buyButton);
    await waitFor(() => expect(window.location.href).toBe('/login/?next=%2Faccount%2F%3Fbuy%3D1'));
  });

  it('a logged-in parent completing checkout is offered a link into /course/beginner/, not /play/', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    let entitled = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) {
        return jsonResponse({
          familyId: 'f1', email: 'p***@example.com', consentRecorded: true,
          entitlements: entitled ? [{ moduleId: 'm1', status: 'active' }] : [],
          profiles: [], trials: [],
        });
      }
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));
    vi.stubGlobal('open', vi.fn(() => ({ location: { href: '' } }) as unknown as Window));
    const { NewLandingPage: LoggedInNewLandingPage } = await import('../src/lp/NewLandingPage');
    const user = userEvent.setup();
    render(<LoggedInNewLandingPage />);

    await user.click(screen.getByText('入門コースを買う'));
    await waitFor(() =>
      expect(
        screen.getByText('お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。'),
      ).toBeInTheDocument(),
    );

    entitled = true;
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(screen.getByText('ご購入ありがとうございます！')).toBeInTheDocument());
    const openLink = screen.getByText('入門コースをひらく').closest('a');
    expect(openLink).toHaveAttribute('href', '/course/beginner/');
  });
});
