import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/**
 * WORKER_URL is read from import.meta.env.VITE_UNLOCK_API_URL as a module-level constant, so
 * each test stubs the env (if needed) and re-imports the module fresh via vi.resetModules() —
 * changing the env after the module has already loaded would have no effect.
 */
describe('UnlockPage', () => {
  it('never calls fetch and shows a "not live yet" message when no Worker URL is configured', async () => {
    const { UnlockPage } = await import('../src/parent/unlock/UnlockPage');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<UnlockPage />);
    await user.type(screen.getByLabelText('家族用コード'), 'NAZE-ABCD-EFGH');
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(await screen.findByText(/まだ準備中/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on a valid code, grants the entitlement in storage and offers to continue', async () => {
    vi.stubEnv('VITE_UNLOCK_API_URL', 'https://worker.example');
    const { UnlockPage } = await import('../src/parent/unlock/UnlockPage');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ moduleIds: ['m1'], founder: false, overCap: false }),
      }),
    );

    const user = userEvent.setup();
    render(<UnlockPage />);
    await user.type(screen.getByLabelText('家族用コード'), 'NAZE-ABCD-EFGH');
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(await screen.findByText(/登録が完了しました/)).toBeInTheDocument();
    expect(screen.getByText('ミッションを始める')).toBeInTheDocument();
    // WO-21 Phase 8: trailing slash matters — vite's multi-page build serves /play at its own
    // directory path (/play/index.html -> /play/); a link missing the trailing slash fell
    // through to the LP's own index.html instead under a real static host, a real bug.
    expect(screen.getByText('ミッションを始める').closest('a')).toHaveAttribute('href', '/play/');

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.entitlements).toContain('m1:full');
    // WO-30 §0: the credential itself, not just the derived tag — reconcileEntitlements()
    // (src/engine/entitlements.ts) refuses to trust `entitlements` at all without this.
    expect(saved.redeemedCode).toBe('NAZE-ABCD-EFGH');
  });

  it('on an unknown code, shows an error and never touches storage', async () => {
    vi.stubEnv('VITE_UNLOCK_API_URL', 'https://worker.example');
    const { UnlockPage } = await import('../src/parent/unlock/UnlockPage');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const user = userEvent.setup();
    render(<UnlockPage />);
    await user.type(screen.getByLabelText('家族用コード'), 'NAZE-ZZZZ-ZZZZ');
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(await screen.findByText(/コードが見つかりませんでした/)).toBeInTheDocument();
    expect(screen.queryByText('ミッションを始める')).not.toBeInTheDocument();
    expect(localStorage.getItem('m-app.v1')).toBeNull();
  });

  it('surfaces the soft device-cap note without blocking the redemption', async () => {
    vi.stubEnv('VITE_UNLOCK_API_URL', 'https://worker.example');
    const { UnlockPage } = await import('../src/parent/unlock/UnlockPage');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ moduleIds: ['m1'], founder: false, overCap: true }),
      }),
    );

    const user = userEvent.setup();
    render(<UnlockPage />);
    await user.type(screen.getByLabelText('家族用コード'), 'NAZE-ABCD-EFGH');
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(await screen.findByText(/複数の端末で使われています/)).toBeInTheDocument();
    expect(screen.getByText('ミッションを始める')).toBeInTheDocument(); // still succeeds
  });

  it('disables submit while the request is in flight and re-enables the form after', async () => {
    vi.stubEnv('VITE_UNLOCK_API_URL', 'https://worker.example');
    const { UnlockPage } = await import('../src/parent/unlock/UnlockPage');
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; })),
    );

    const user = userEvent.setup();
    render(<UnlockPage />);
    await user.type(screen.getByLabelText('家族用コード'), 'NAZE-ABCD-EFGH');
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(screen.getByRole('button', { name: '確認中…' })).toBeDisabled();

    resolveFetch({ ok: true, status: 200, json: async () => ({ moduleIds: ['m1'], founder: false, overCap: false }) });
    expect(await screen.findByText(/登録が完了しました/)).toBeInTheDocument();
  });
});
