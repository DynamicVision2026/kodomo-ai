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

  it('links to the (not-yet-built) legal pages rather than fabricating their content here', () => {
    render(<LandingPage />);
    expect(screen.getByText('特定商取引法に基づく表記').closest('a')).toHaveAttribute('href', '/legal/tokushoho');
    expect(screen.getByText('プライバシーポリシー').closest('a')).toHaveAttribute('href', '/legal/privacy');
  });
});
