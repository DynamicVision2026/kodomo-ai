/**
 * AD-16 §2: the /claim parent screen (src/parent/claim/ClaimPage.tsx) — claim link -> log in if
 * needed (returning here via LoginPage's own `next` param) -> shows the order/product -> one
 * explicit confirm tap -> bind, with the resulting entitlement state/result. Same
 * `vi.resetModules()` + `vi.stubEnv` pattern as the other AD-16 frontend suites, since this page
 * always needs a real (mocked) backend to mean anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setUrl(path: string) {
  window.history.pushState({}, '', path);
}

async function renderConfiguredClaimPage() {
  vi.resetModules();
  vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
  const { ClaimPage } = await import('../src/parent/claim/ClaimPage');
  return render(<ClaimPage />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setUrl('/claim/');
});

describe('AD-16 §2 — /claim: no token / not logged in', () => {
  it('a link with no token at all shows an honest "invalid link" message, never crashes', async () => {
    setUrl('/claim/');
    await renderConfiguredClaimPage();
    expect(await screen.findByText(/リンクが正しくないようです/)).toBeInTheDocument();
  });

  it('an unauthenticated visit shows a login link that carries the token forward via `next`', async () => {
    setUrl('/claim/?token=abc123');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })));
    await renderConfiguredClaimPage();
    const link = await screen.findByText('ログインする');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      `/login/?next=${encodeURIComponent('/claim/?token=abc123')}`,
    );
  });

  it('an invalid/expired/already-used token shows an honest message, not a silent bind', async () => {
    setUrl('/claim/?token=stale');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await renderConfiguredClaimPage();
    expect(await screen.findByText(/このリンクはすでに使用されたか、有効期限が切れています/)).toBeInTheDocument();
  });
});

describe('AD-16 §2 — /claim: logged in, valid claim', () => {
  it('shows the order/product and requires an explicit confirm tap before binding anything', async () => {
    let confirmCalled = false;
    setUrl('/claim/?token=goodtoken');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/claims/goodtoken') && method === 'GET') {
        return jsonResponse({ orderName: '#1234', moduleIds: ['m1'] });
      }
      if (url.endsWith('/claims/goodtoken') && method === 'POST') {
        confirmCalled = true;
        return jsonResponse({ ok: true, orderName: '#1234' });
      }
      return new Response('not found', { status: 404 });
    }));

    await renderConfiguredClaimPage();
    expect(await screen.findByText('#1234')).toBeInTheDocument();
    expect(screen.getByText('しつもん・ふかぼり編')).toBeInTheDocument();
    // Nothing bound yet — the GET alone never confirms anything.
    expect(confirmCalled).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByText('このアカウントに登録する'));

    await waitFor(() => expect(confirmCalled).toBe(true));
    expect(await screen.findByText(/ご注文#1234を登録しました/)).toBeInTheDocument();
  });

  it('a claim that has already been redeemed (410 on confirm) shows an honest error, not a false success', async () => {
    setUrl('/claim/?token=racedtoken');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/claims/racedtoken') && method === 'GET') {
        return jsonResponse({ orderName: '#9999', moduleIds: ['m1'] });
      }
      if (url.endsWith('/claims/racedtoken') && method === 'POST') {
        return jsonResponse({ error: 'invalid_or_expired' }, 410);
      }
      return new Response('not found', { status: 404 });
    }));

    const user = userEvent.setup();
    await renderConfiguredClaimPage();
    await screen.findByText('#9999');
    await user.click(screen.getByText('このアカウントに登録する'));

    await waitFor(() => expect(screen.getByText(/すでに使用されたか、有効期限が切れています/)).toBeInTheDocument());
    expect(screen.queryByText(/登録しました/)).not.toBeInTheDocument();
  });
});
