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
 *
 * iOS Safari fix (post-launch-check, fixing 4e660e8): a tab opened with the `'noopener'` feature
 * string is, by spec, never handed back to the caller — `window.open` always returns `null` for
 * it, indistinguishable from a real popup block, so the old code's fallback fired on every iOS
 * tap. Safari also only honors `window.open` as a real user gesture when it's called
 * SYNCHRONOUSLY inside the click handler — anything awaited first (even a fast fetch) makes it
 * silently open a blank/background tab instead. So `startPurchase` now opens a blank tab first,
 * before any `await`, and only navigates it to the real URL once the purchase-intent request
 * resolves — severing its `opener` by hand afterward gives the same isolation `'noopener'` would
 * have, without forcing a null return.
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
    // Must be the very first thing this function does — no `await` before it — or Safari on
    // iOS no longer treats it as a direct result of the tap and silently drops the tab.
    const checkoutWindow = window.open('', '_blank');
    setState({ kind: 'loading' });
    const result = await createPurchaseIntent(moduleId);
    if (!('url' in result)) {
      checkoutWindow?.close();
      // gate:no-hardcoded-copy only exempts src/lp, src/parent, src/modules, src/legal,
      // src/admin — this shared hook itself stays copy-free; each caller (both in exempt
      // directories already) owns the actual Japanese wording for its own `reason`.
      setState({ kind: 'error', reason: result.reason === 'not_configured' ? 'not_configured' : 'other' });
      return;
    }
    if (!checkoutWindow) {
      // A real popup block (or a platform that never opens one for a blank URL) — same-tab
      // fallback is the only option left.
      window.location.href = result.url;
      return;
    }
    checkoutWindow.opener = null;
    checkoutWindow.location.href = result.url;
    setState({ kind: 'awaiting-payment' });
  }

  return { state, startPurchase };
}
