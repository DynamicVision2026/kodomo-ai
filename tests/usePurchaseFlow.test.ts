/**
 * AD-14 decision 7 — the purchase return flow's own hook (src/family/usePurchaseFlow.ts), tested
 * directly rather than through a page component so the 5s poll interval and the 30-minute give-up
 * can be exercised precisely with fake timers. tests/LandingPage.test.tsx and
 * tests/ad16PurchaseCta.test.tsx cover the same hook wired into a real page (new tab, same-tab
 * fallback, focus-triggered re-check, thank-you state) with real timers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const ME_UNENTITLED = { familyId: 'f1', email: 'p***@example.com', entitlements: [], profiles: [], trials: [] };
const ME_ENTITLED = {
  familyId: 'f1', email: 'p***@example.com',
  entitlements: [{ moduleId: 'm1', status: 'active' }],
  profiles: [], trials: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('usePurchaseFlow', () => {
  it('polls /me every 5s while awaiting payment and flips to paid once the module entitlement is active', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    let entitled = false;
    let meCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) {
        meCalls += 1;
        return jsonResponse(entitled ? ME_ENTITLED : ME_UNENTITLED);
      }
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));
    vi.stubGlobal('open', vi.fn(() => ({}) as Window));
    const { usePurchaseFlow } = await import('../src/family/usePurchaseFlow');

    // Fake timers from before startPurchase() runs — the poll interval it schedules (inside a
    // useEffect keyed on the 'awaiting-payment' state) must itself be a FAKE setInterval, or
    // vi.advanceTimersByTimeAsync below has nothing real to advance.
    vi.useFakeTimers();
    const { result } = renderHook(() => usePurchaseFlow('m1'));

    await act(async () => {
      await result.current.startPurchase();
    });
    expect(result.current.state.kind).toBe('awaiting-payment');
    const callsBeforePolling = meCalls;

    // First 5s tick: still unentitled, state stays awaiting-payment.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(meCalls).toBeGreaterThan(callsBeforePolling);
    expect(result.current.state.kind).toBe('awaiting-payment');

    // Shopify's webhook grants the entitlement between ticks; the next 5s poll picks it up.
    entitled = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.state.kind).toBe('paid');
  });

  it('gives up polling after 30 minutes without ever reporting an error', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    let meCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/me')) {
        meCalls += 1;
        return jsonResponse(ME_UNENTITLED); // never pays, in this test
      }
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));
    vi.stubGlobal('open', vi.fn(() => ({}) as Window));
    const { usePurchaseFlow } = await import('../src/family/usePurchaseFlow');

    vi.useFakeTimers();
    const { result } = renderHook(() => usePurchaseFlow('m1'));
    await act(async () => {
      await result.current.startPurchase();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    });

    const callsAt31Min = meCalls;
    expect(result.current.state.kind).toBe('awaiting-payment'); // never errors, just stops
    // A further tick makes no more calls — polling has genuinely stopped, not just slowed down.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(meCalls).toBe(callsAt31Min);
  });

  it('a blocked popup redirects the same tab instead of entering the awaiting-payment state', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_FAMILY_API_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/purchase-intents')) {
        return jsonResponse({ url: 'https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc', expiresAt: '2026-02-01T00:00:00.000Z' }, 201);
      }
      return new Response('not found', { status: 404 });
    }));
    // Unstubbed window.open — jsdom's own real implementation always returns undefined, the same
    // signal a real popup blocker gives.
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });
    const { usePurchaseFlow } = await import('../src/family/usePurchaseFlow');

    const { result } = renderHook(() => usePurchaseFlow('m1'));
    await act(async () => {
      await result.current.startPurchase();
    });

    expect(window.location.href).toBe('https://kodomo-ai.myshopify.com/cart/111:1?attributes%5Bdomo_pt%5D=abc');
    expect(result.current.state.kind).toBe('loading'); // fallback never sets awaiting-payment

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });
});
