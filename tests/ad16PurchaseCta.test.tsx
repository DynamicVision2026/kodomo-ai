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
  entitlements: [{ moduleId: 'm1', status: 'active' }],
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
    const openSpy = vi.fn(() => ({}) as Window);
    vi.stubGlobal('open', openSpy);

    const user = userEvent.setup();
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('購入手続きへ進む')).toBeInTheDocument());
    await user.click(screen.getByText('購入手続きへ進む'));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc123', '_blank', 'noopener'),
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
    vi.stubGlobal('open', vi.fn(() => ({}) as Window));

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

  it('an already-entitled family never sees the purchase CTA at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) return jsonResponse(ME_ENTITLED);
      if (url.endsWith('/sessions')) return jsonResponse([]);
      return new Response('not found', { status: 404 });
    }));
    await renderConfiguredAccountPage();
    await waitFor(() => expect(screen.getByText('使用中の端末')).toBeInTheDocument());
    expect(screen.queryByText('購入手続きへ進む')).not.toBeInTheDocument();
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
