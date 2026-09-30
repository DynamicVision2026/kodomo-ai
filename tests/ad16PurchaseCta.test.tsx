/**
 * AD-16 §1: the logged-in parent's own purchase CTA (src/parent/account/AccountPage.tsx) —
 * calls `POST /purchase-intents`, sends the browser to the returned Shopify URL, and never
 * passes a family id or prefilled purchaser email anywhere in that call. Uses the same
 * `vi.resetModules()` + `vi.stubEnv('VITE_FAMILY_API_URL', ...)` pattern tests/EntitlementSecurity
 * .test.tsx's own "hand-edited cachedEntitlements" test established, so the real network path is
 * actually exercised rather than falling back to the not-configured default.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const ME_ENTITLED: unknown = {
  familyId: 'f1', email: 'p***@example.com',
  entitlements: [{ moduleId: 'm1', status: 'active', grantedAt: '2026-09-20T03:00:00.000Z' }],
  profiles: [], trials: [],
};
const ME_UNENTITLED: unknown = {
  familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [],
};

async function renderConfiguredAccountPage() {
  vi.resetModules();
  vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
  const { AccountPage } = await import('../src/parent/account/AccountPage');
  return render(<AccountPage />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AD-16 §1 — the account page purchase CTA', () => {
  it('AD-14 decision 7: an unentitled family tapping the CTA opens the returned Shopify URL in a new tab, never sending a family id or email', async () => {
    let capturedBody: unknown = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_UNENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      if (url.endsWith('/purchase-intents')) {
        capturedBody = JSON.parse(String(init?.body));
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc123', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));

    const originalLocation = window.location;
    // jsdom's window.location.href setter throws "Not implemented: navigation" — stub the whole
    // object so the assertion can observe (a lack of) assignment without a real navigation
    // attempt.
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });
    // AD-14 decision 7 (fixing 4e660e8's own iOS Safari bug): window.open must be called with a
    // BLANK url, never 'noopener' (which always returns null by spec — indistinguishable from a
    // real popup block on iOS).
    const fakeCheckoutWindow = { location: { href: '' } } as unknown as Window;
    const openSpy = vi.fn((_url?: string, _target?: string, features?: string) =>
      typeof features === 'string' && features.includes('noopener') ? null : fakeCheckoutWindow,
    );
    vi.stubGlobal('open', openSpy);

    const user = userEvent.setup();
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('購入手続きへ進む')).toBeInTheDocument());
    await user.click(screen.getByText('購入手続きへ進む'));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('', '_blank'));
    await waitFor(() =>
      expect(fakeCheckoutWindow.location.href).toBe('https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc123'),
    );
    expect(window.location.href).toBe(''); // this tab never navigates away
    expect(
      screen.getByText('お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。'),
    ).toBeInTheDocument();
    expect(capturedBody).toEqual({ moduleId: 'm1' });
    expect(JSON.stringify(capturedBody)).not.toContain('family');
    expect(JSON.stringify(capturedBody)).not.toContain('@'); // no email anywhere in the request body

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('AD-14 decision 7: a blocked popup falls back to a same-tab redirect', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_UNENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc123', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));

    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });
    // jsdom's own real window.open (unmocked) always returns undefined — the same signal a real
    // popup blocker gives — so leaving it unstubbed here exercises the fallback honestly.

    const user = userEvent.setup();
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('購入手続きへ進む')).toBeInTheDocument());
    await user.click(screen.getByText('購入手続きへ進む'));

    await waitFor(() => expect(window.location.href).toBe('https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc123'));

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('AD-14 decision 7: once the entitlement lands (checked on tab focus), the purchase section switches to the thank-you state and links into /play/', async () => {
    let entitled = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(entitled ? ME_ENTITLED : ME_UNENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc123', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));
    vi.stubGlobal('open', vi.fn(() => ({ location: { href: '' } }) as unknown as Window));

    const user = userEvent.setup();
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('購入手続きへ進む')).toBeInTheDocument());
    await user.click(screen.getByText('購入手続きへ進む'));
    await waitFor(() =>
      expect(
        screen.getByText('お支払い画面を別のタブで開きました。お支払いが終わったら、このページに戻ってください。'),
      ).toBeInTheDocument(),
    );

    entitled = true;
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(screen.getByText('ご購入ありがとうございます！')).toBeInTheDocument());
    const playLink = screen.getByText('つづきから あそぶ').closest('a');
    expect(playLink).toHaveAttribute('href', '/play/');
  });

  it('an already-entitled family never sees the purchase CTA — sees the purchase-date status instead', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_ENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      return new Response('not found', { status: 404 });
    }));
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('使用中の端末')).toBeInTheDocument());
    expect(screen.queryByText('購入手続きへ進む')).not.toBeInTheDocument();
    // ME_ENTITLED's grantedAt is 2026-09-20T03:00:00.000Z.
    expect(screen.getByText('ご購入済み：ナゼホリ Module 1（購入日：9月20日）')).toBeInTheDocument();
  });

  it('post-launch-check (Founder): behind VITE_BEGINNER_LAUNCH, the same purchase line says 入門コース instead of Module 1 — same m1 entitlement either way', async () => {
    vi.stubEnv('VITE_BEGINNER_LAUNCH', '1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_ENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      return new Response('not found', { status: 404 });
    }));
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('使用中の端末')).toBeInTheDocument());
    expect(screen.getByText('ご購入済み：ナゼホリ 入門コース（購入日：9月20日）')).toBeInTheDocument();
    expect(screen.queryByText(/Module 1/)).not.toBeInTheDocument();
  });

  it('a 503 not_configured response is handled safely, with an honest message and no crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_UNENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      if (url.endsWith('/purchase-intents')) return jsonResponse({ error: 'not_configured' }, 503);
      return new Response('not found', { status: 404 });
    }));

    const user = userEvent.setup();
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('購入手続きへ進む')).toBeInTheDocument());
    await user.click(screen.getByText('購入手続きへ進む'));

    await waitFor(() => expect(screen.getByText(/ただいま購入手続きの準備中です/)).toBeInTheDocument());
  });

  it('a network failure is handled safely, with an honest message and no crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_UNENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      throw new Error('simulated network failure');
    }));

    const user = userEvent.setup();
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('購入手続きへ進む')).toBeInTheDocument());
    await user.click(screen.getByText('購入手続きへ進む'));

    await waitFor(() => expect(screen.getByText(/購入手続きを開始できませんでした/)).toBeInTheDocument());
  });
});
