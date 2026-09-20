import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingPage } from '../src/lp/LandingPage';

let plausible: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  plausible = vi.fn();
  window.plausible = plausible;
});

afterEach(() => {
  cleanup();
  delete window.plausible;
});

describe('LandingPage', () => {
  it('tracks lp_view on mount and persists a random A/B variant to storage', () => {
    render(<LandingPage />);
    expect(plausible).toHaveBeenCalledWith('lp_view', expect.anything());

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(['A', 'B']).toContain(saved.abVariant);

    // Every subsequent event should carry that same persisted variant.
    const [, opts] = plausible.mock.calls[0]!;
    expect(opts.props.abVariant).toBe(saved.abVariant);
  });

  it('shows the same variant on a later mount instead of re-rolling it', () => {
    localStorage.setItem(
      'm-app.v1',
      JSON.stringify({ profiles: [], entitlements: ['m1:free'], founder: false, abVariant: 'B' }),
    );
    render(<LandingPage />);
    expect(screen.getByText(/親子で、同じスタートラインから/)).toBeInTheDocument();
  });

  it('tracks grade_pick with the chosen band', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    await user.click(screen.getByText('5・6年'));
    expect(plausible).toHaveBeenCalledWith('grade_pick', { props: expect.objectContaining({ band: '5・6年' }) });
  });

  it('tracks cta_play_click and cta_buy_click', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    await user.click(screen.getByText('無料でミッション1を体験する'));
    expect(plausible).toHaveBeenCalledWith('cta_play_click', expect.anything());

    await user.click(screen.getByText('創設ファミリーとして申し込む ¥4,980'));
    expect(plausible).toHaveBeenCalledWith('cta_buy_click', expect.anything());
  });

  it('renders all four section 1A alignment rows, each with its own source link', () => {
    render(<LandingPage />);
    const rows = document.querySelectorAll('.lp__alignment-row');
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.querySelector('.lp__alignment-source')).toBeTruthy();
    }
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
    render(<LandingPage />);
    // WO-21 Phase 8: trailing slash matters — vite's multi-page build serves each page at its
    // own directory path (e.g. /legal/tokushoho/index.html -> /legal/tokushoho/); a link missing
    // the trailing slash fell through to the LP's own index.html instead, a real bug this
    // playwright-verified fix closes (see the WO-21 Phase 8 commit for the reproduction).
    expect(screen.getByText('特定商取引法に基づく表記').closest('a')).toHaveAttribute('href', '/legal/tokushoho/');
    expect(screen.getByText('プライバシーポリシー').closest('a')).toHaveAttribute('href', '/legal/privacy/');
  });

  it('WO-21 Phase 8: the primary CTA into the app carries a trailing slash, matching the real built page path', () => {
    render(<LandingPage />);
    expect(screen.getByText('無料でミッション1を体験する').closest('a')).toHaveAttribute('href', '/play/');
  });

  it('prominently features the privacy slogan right after the hero, before any other section', () => {
    render(<LandingPage />);
    expect(screen.getByText('「登録不要・子ども情報のクラウド保存なし・完全ローカル完結」')).toBeInTheDocument();

    const main = document.querySelector('main.lp')!;
    const children = Array.from(main.children);
    const heroIndex = children.findIndex((el) => el.classList.contains('lp__hero'));
    const trustIndex = children.findIndex((el) => el.classList.contains('lp__trust'));
    expect(trustIndex).toBe(heroIndex + 1);
  });

  it('elaborates each clause of the privacy slogan without overclaiming full offline use', () => {
    render(<LandingPage />);
    const trust = document.querySelector('.lp__trust')!;
    expect(trust.textContent).toContain('アカウント登録は不要');
    expect(trust.textContent).toContain('端末');
    expect(trust.textContent).not.toMatch(/オフライン|インターネット接続なし/);
  });

  it('WO-21 Phase 7: consistently states every required commercial fact — price, household licence (in natural Japanese, not raw English), digital+printable, profile/device caps, refund guarantee, no subscription, and founders\' bonus', () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('¥4,980');
    expect(text).toContain('世帯ライセンス');
    expect(text).not.toContain('household licence'); // no untranslated placeholder copy
    expect(text).toContain('印刷キット'); // digital app + printable kit, both mentioned
    expect(text).toContain('最大6人'); // MAX_PROFILES
    expect(text).toContain('最大5台'); // MAX_DEVICES
    expect(text).toContain('30日間返金保証');
    expect(text).toContain('月額なし');
    expect(text).toContain('自動更新はありません'); // explicitly denied, never silently omitted
    expect(text).toContain('創設ファミリー特典');
    expect(text).toContain('冬休みスペシャルシート');
  });
});
