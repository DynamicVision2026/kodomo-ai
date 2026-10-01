import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingPage } from '../src/lp/LandingPage';

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
  // Same pattern tests/ad16PurchaseCta.test.tsx already established: jsdom's real
  // window.location.href setter throws "Not implemented: navigation", so every startPurchase()
  // path (which ends in a real assignment to it) needs the whole object stubbed.
  Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });
});

afterEach(() => {
  cleanup();
  delete window.plausible;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
});

describe('LandingPage', () => {
  it('tracks lp_view on mount and persists a random A/B variant to storage', () => {
    render(<LandingPage />);
    expect(plausible).toHaveBeenCalledWith('lp_view', expect.anything());

    const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(['A', 'B']).toContain(saved.abVariant);

    // Every subsequent event should carry that same persisted variant.
    const [, opts] = plausible.mock.calls[0]!;
    expect(opts.props.abVariant).toBe(saved.abVariant);
  });

  it('shows the same variant on a later mount instead of re-rolling it', () => {
    localStorage.setItem(
      'm-app.v2',
      JSON.stringify({ profiles: [], familyId: null, cachedEntitlements: [], pendingSyncKeys: [], abVariant: 'B' }),
    );
    render(<LandingPage />);
    expect(screen.getByText(/親子で、同じスタートラインから/)).toBeInTheDocument();
  });

  it('tracks cta_play_click and cta_buy_click', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    await user.click(screen.getByText('無料でミッション1を体験する'));
    expect(plausible).toHaveBeenCalledWith('cta_play_click', expect.anything());

    await user.click(screen.getByText('購入する ¥4,980（税込）'));
    expect(plausible).toHaveBeenCalledWith('cta_buy_click', expect.anything());
  });

  // Post-launch-check work order: both buy buttons are now always real, clickable <button>
  // elements (never a bare href="#" or a text-only pending paragraph) — startPurchase() itself
  // decides where to send the browser once it knows the session's login state.
  it('a logged-out visitor clicking either buy button is sent to /login/, never straight to a purchase-intent call', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    expect(screen.getByText('購入する ¥4,980（税込）').tagName).toBe('BUTTON');
    expect(screen.getByText('購入する', { selector: 'button' }).tagName).toBe('BUTTON');

    await user.click(screen.getByText('購入する ¥4,980（税込）'));
    await waitFor(() => expect(window.location.href).toBe('/login/?next=%2Faccount%2F%3Fbuy%3D1'));
  });

  it('a logged-in parent clicking a buy button opens checkout in a new tab and shows the waiting message', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) {
        return jsonResponse({ familyId: 'f1', email: 'p***@example.com', consentRecorded: true, entitlements: [], profiles: [], trials: [] });
      }
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));
    // AD-14 decision 7 (fixing 4e660e8's own iOS Safari bug): window.open must be called with
    // a BLANK url, never 'noopener' (which always returns null by spec — indistinguishable from
    // a real popup block on iOS) — this fake window stands in for the tab it opens, so the
    // assertions below can see it get navigated to the real checkout URL afterward.
    const fakeCheckoutWindow = { location: { href: '' } } as unknown as Window;
    const openSpy = vi.fn((_url?: string, _target?: string, features?: string) =>
      typeof features === 'string' && features.includes('noopener') ? null : fakeCheckoutWindow,
    );
    vi.stubGlobal('open', openSpy);
    const { LandingPage: LoggedInLandingPage } = await import('../src/lp/LandingPage');
    const user = userEvent.setup();
    render(<LoggedInLandingPage />);

    await user.click(screen.getByText('購入する', { selector: 'button' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('', '_blank'));
    await waitFor(() =>
      expect(fakeCheckoutWindow.location.href).toBe('https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc'),
    );
    // The original tab itself never navigates away — the checkout lives in the new tab only.
    expect(window.location.href).toBe('');
    expect(
      screen.getByText('お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('購入する', { selector: 'button' })).not.toBeInTheDocument();
  });

  it('AD-14 decision 7: once the entitlement lands, the original tab switches to the thank-you state and links into /play/', async () => {
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
    const { LandingPage: LoggedInLandingPage } = await import('../src/lp/LandingPage');
    const user = userEvent.setup();
    render(<LoggedInLandingPage />);

    await user.click(screen.getByText('購入する', { selector: 'button' }));
    await waitFor(() =>
      expect(
        screen.getByText('お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。'),
      ).toBeInTheDocument(),
    );

    // Shopify's own orders/paid webhook grants the entitlement server-side while the parent is
    // still on the checkout tab; returning to this one (a window focus event) is what the work
    // order calls "resuming on tab focus" — the hook re-checks /me right away rather than
    // waiting out the rest of the 5s poll interval.
    entitled = true;
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(screen.getByText('ご購入ありがとうございます！')).toBeInTheDocument());
    const playLink = screen.getByText('つづきから あそぶ').closest('a');
    expect(playLink).toHaveAttribute('href', '/play/');
  });

  it('AD-14 decision 7: a blocked popup falls back to a same-tab redirect', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) {
        return jsonResponse({ familyId: 'f1', email: 'p***@example.com', consentRecorded: true, entitlements: [], profiles: [], trials: [] });
      }
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));
    // jsdom's own real window.open (unmocked) always returns undefined — the same signal a
    // real popup blocker gives — so leaving it unstubbed here exercises the fallback honestly.
    const { LandingPage: LoggedInLandingPage } = await import('../src/lp/LandingPage');
    const user = userEvent.setup();
    render(<LoggedInLandingPage />);

    await user.click(screen.getByText('購入する', { selector: 'button' }));
    await waitFor(() => expect(window.location.href).toBe('https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc'));
  });

  it('shows an honest error, never a silent failure, when the purchase-intent call itself fails', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) {
        return jsonResponse({ familyId: 'f1', email: 'p***@example.com', consentRecorded: true, entitlements: [], profiles: [], trials: [] });
      }
      if (url.endsWith('/purchase-intents')) return jsonResponse({ error: 'server' }, 500);
      return new Response('not found', { status: 404 });
    }));
    const { LandingPage: LoggedInLandingPage } = await import('../src/lp/LandingPage');
    const user = userEvent.setup();
    render(<LoggedInLandingPage />);

    await user.click(screen.getByText('購入する', { selector: 'button' }));
    await waitFor(() => expect(screen.getByText(/購入手続きを開始できませんでした/)).toBeInTheDocument());
  });

  it('A1 (flip-prep): the pre-legal-review 学びの方向性との対応 section is gone entirely', () => {
    render(<LandingPage />);
    expect(document.querySelector('.lp__alignment-row')).toBeNull();
    expect(screen.queryByText('学びの方向性との対応')).not.toBeInTheDocument();
    expect(screen.queryByText(/法務チェック前の草案/)).not.toBeInTheDocument();
  });

  it('never claims an endorsement that does not exist (spec v0.5 §1A "Never" list)', () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? '';
    // Bare "認定" is not itself forbidden — spec's own kit item is "親子認定証" (a fun
    // certificate, not an endorsement claim). What's actually banned is MEXT/government
    // endorsement language, or treating the still-proposed curriculum change as decided.
    for (const banned of ['文部科学省推奨', '文科省推奨', '文部科学省認定', '文科省認定', '公認', '教科書準拠', '監修', '必修化']) {
      expect(text).not.toContain(banned);
    }
    expect(text).not.toMatch(/次の学習指導要領では.*決定/);
  });

  it('links to this app\'s own legal pages, built from the company\'s real confirmed data', () => {
    const { container } = render(<LandingPage />);
    // WO-21 Phase 8: trailing slash matters — vite's multi-page build serves each page at its
    // own directory path (e.g. /legal/tokushoho/index.html -> /legal/tokushoho/); a link missing
    // the trailing slash fell through to the LP's own index.html instead, a real bug this
    // playwright-verified fix closes (see the WO-21 Phase 8 commit for the reproduction).
    // Scoped to the footer: Notice D (item 5) also links to /legal/privacy/ with the same label.
    const footer = within(container.querySelector('.lp__footer')!);
    expect(footer.getByText('特定商取引法に基づく表記').closest('a')).toHaveAttribute('href', '/legal/tokushoho/');
    expect(footer.getByText('プライバシーポリシー').closest('a')).toHaveAttribute('href', '/legal/privacy/');
  });

  it('AD-15 §4 (Architect decision): the primary CTA routes a new visitor through login first, returning them to /play/ once signed in', () => {
    render(<LandingPage />);
    // Never straight to /play/ any more — no profile creation before login for a new visitor.
    // ?next=/play/ still carries the same trailing-slash real-built-page-path requirement
    // WO-21 Phase 8 established, now for the login screen's own eventual redirect target.
    expect(screen.getByText('無料でミッション1を体験する').closest('a')).toHaveAttribute('href', '/login/?next=/play/');
  });

  it('post-launch-check work order: shows the new registration/data-handling facts right after the hero, before any other section', () => {
    render(<LandingPage />);
    expect(screen.getByText('メールアドレスだけで、かんたん登録（パスワード不要）')).toBeInTheDocument();
    expect(screen.getByText('お子さまのお名前や生年月日は登録しません')).toBeInTheDocument();
    expect(screen.getByText('学習の記録はアカウントに保存され、機種を変えても続きから遊べます')).toBeInTheDocument();

    const main = document.querySelector('main.lp')!;
    const children = Array.from(main.children);
    const heroIndex = children.findIndex((el) => el.classList.contains('lp__hero'));
    const trustIndex = children.findIndex((el) => el.classList.contains('lp__trust'));
    expect(trustIndex).toBe(heroIndex + 1);
  });

  it('never claims registration is unnecessary or that nothing is stored on a server — both are now false since Family Accounts shipped', () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('登録不要');
    expect(text).not.toContain('子ども情報のクラウド保存なし');
    expect(text).not.toContain('完全ローカル完結');
    expect(text).not.toContain('創設ファミリーとして申し込む');
  });

  it('WO-21 Phase 7/AD-15: consistently states every required commercial fact — price, household licence (in natural Japanese, not raw English), digital+printable, profile/device caps, no subscription, and founders\' bonus; no longer overclaims the retired refund guarantee', () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('¥4,980');
    expect(text).toContain('世帯ライセンス');
    expect(text).not.toContain('household licence'); // no untranslated placeholder copy
    expect(text).toContain('印刷キット'); // digital app + printable kit, both mentioned
    // Founder positioning decision (post-launch-check): "最大N人/台" reworded to "3人まで（3プロフィール）／5台の端末"
    // — same MAX_PROFILES/MAX_DEVICES facts, framed as a per-child record cap rather than a family-size limit.
    expect(text).toContain('お子さま3人まで（3プロフィール）'); // MAX_PROFILES
    expect(text).toContain('5台の端末'); // MAX_DEVICES
    expect(text).toContain('一緒に参加するご家族の人数に制限はありません'); // family size itself is uncapped
    // AD-15: the old 30-day guarantee copy is retired everywhere — the new (10-day, usage-
    // contingent) policy isn't finalized/server-enforced yet, so neither surface should claim it.
    expect(text).not.toContain('30日間');
    expect(text).toContain('月額なし');
    expect(text).toContain('自動更新はありません'); // explicitly denied, never silently omitted
    expect(text).toContain('創設ファミリー特典');
    // WO-31: 冬休みスペシャルシート no longer appears in the unconditional 届くもの list — it's
    // gated to 創設ファミリー特典 only (in the price section, asserted above), never promised to
    // every buyer.
    expect(document.querySelector('.lp__price')?.textContent).toContain('冬休みスペシャルシート');
  });

  it('Founder positioning decision: markets as a whole-family experience, with no grade/age reference anywhere (item A3, flip-prep 1 Oct 2026)', () => {
    render(<LandingPage />);
    expect(screen.getByText('親子で、家族みんなで')).toBeInTheDocument();
    expect(screen.getByText('問う力に、年齢はありません。お子さまを中心に、家族みんなで「もう一問」。')).toBeInTheDocument();
    expect(
      screen.getByText('いちばん早く上達するのは、きっとお子さま。覚えたことを家族に「おしえてあげる」のも、学びの一部です。'),
    ).toBeInTheDocument();
    // The grade picker (1・2年 / 3・4年 / 5・6年) and every grade/age string are gone entirely.
    expect(screen.queryByText('1・2年')).not.toBeInTheDocument();
    expect(screen.queryByText('3・4年')).not.toBeInTheDocument();
    expect(screen.queryByText('5・6年')).not.toBeInTheDocument();
    expect(screen.queryByText('どの学年で使いますか？')).not.toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('小学3・4年生から');
    expect(text).not.toContain('年生の「なぜ？」が深くなる時期に');
  });

  it('item A4 (flip-prep): a visible ログイン link sits in the header and near both buy buttons', () => {
    render(<LandingPage />);
    expect(screen.getByText('ログイン', { selector: '.lp__header-login' })).toHaveAttribute('href', '/login/');
    const loginLinks = screen.getAllByText('すでにご購入の方はこちら（ログイン）');
    expect(loginLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of loginLinks) {
      expect(link.closest('a')).toHaveAttribute('href', '/login/');
    }
  });

  it('item A2 (flip-prep): the FAQ refund answer is the Founder\'s final two bullets, not the old placeholder', () => {
    render(<LandingPage />);
    expect(screen.queryByText(/返金ポリシーは近日公開予定です/)).not.toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).toContain('プレイグラウンドを使ったことや、ログインしたことは「始めた」に含みません。');
    expect(text).toContain('ログイン時の同意をいただけないためにご利用になれない場合は');
  });
});
