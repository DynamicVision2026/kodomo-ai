import { useEffect, useState } from 'react';
import { createPurchaseIntent, fetchMe } from './api';

export type PurchaseFlowState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'awaiting-payment' }
  | { kind: 'paid' }
  | { kind: 'error'; reason: 'not_configured' | 'other' };

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * AD-14 decision 7 — the purchase return flow. `startPurchase` opens the Shopify checkout in a
 * NEW tab (never navigates this one away — the parent stays exactly where they were, and a child
 * mid-mission on a shared device never loses their place either) and falls back to a same-tab
 * redirect only when the popup itself was blocked. This tab then waits: polling `/api/v1/me`
 * every 5s for the module's own entitlement to flip to `active` — the real grant happens
 * server-side, off Shopify's `orders/paid` webhook (backend/src/handlers/webhook.ts), never
 * anything this hook infers on its own. Polling only runs while the tab is actually visible (an
 * explicit check on `document.focus` picks it back up the moment the parent returns from
 * checkout) and gives up silently after 30 minutes — the parent can still return and refresh; the
 * entitlement itself isn't time-limited, only this tab's own polling is.
 */
export function usePurchaseFlow(moduleId: string) {
  const [state, setState] = useState<PurchaseFlowState>({ kind: 'idle' });

  useEffect(() => {
    if (state.kind !== 'awaiting-payment') return;
    const startedAt = Date.now();
    let cancelled = false;

    async function checkOnce() {
      if (cancelled) return;
      const me = await fetchMe();
      if (cancelled || !me) return;
      const entitled = me.entitlements.some((e) => e.moduleId === moduleId && e.status === 'active');
      if (entitled) setState({ kind: 'paid' });
    }

    const interval = setInterval(() => {
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        clearInterval(interval);
        return;
      }
      if (document.visibilityState === 'visible') void checkOnce();
    }, POLL_INTERVAL_MS);

    function onFocus() {
      if (Date.now() - startedAt < POLL_TIMEOUT_MS) void checkOnce();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [state.kind, moduleId]);

  async function startPurchase() {
    setState({ kind: 'loading' });
    const result = await createPurchaseIntent(moduleId);
    if (!('url' in result)) {
      // gate:no-hardcoded-copy only exempts src/lp, src/parent, src/modules, src/legal,
      // src/admin — this shared hook itself stays copy-free; each caller (both in exempt
      // directories already) owns the actual Japanese wording for its own `reason`.
      setState({ kind: 'error', reason: result.reason === 'not_configured' ? 'not_configured' : 'other' });
      return;
    }
    const checkoutWindow = window.open(result.url, '_blank', 'noopener');
    if (!checkoutWindow) {
      window.location.href = result.url;
      return;
    }
    setState({ kind: 'awaiting-payment' });
  }

  return { state, startPurchase };
}
