import type { Env } from './types.js';

/**
 * Architect decision: every emailed/redirect link this backend builds uses the ONE canonical
 * origin (`env.APP_BASE_URL`), never whichever alias happened to receive the request that
 * triggered it — a family reading a "module activated" email must always land on the real,
 * durable address, not a hostname due to be redirected away from. Falls back to the deprecated
 * single-origin `env.APP_ORIGIN` when `APP_BASE_URL` isn't set yet, so a backend deployment
 * whose env still predates this migration keeps producing working (if not yet fully canonical)
 * links rather than broken ones.
 */
export function appBaseUrl(env: Env): string {
  return env.APP_BASE_URL ?? env.APP_ORIGIN ?? '';
}

export function loginUrl(env: Env, opts?: { email?: string; next?: string }): string {
  const base = `${appBaseUrl(env)}/login/`;
  const params = new URLSearchParams();
  if (opts?.email) params.set('email', opts.email);
  if (opts?.next) params.set('next', opts.next);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Email-redesign (Founder, 1 Oct 2026), item 6: the activation email's button must send a
 *  not-logged-in parent to `/login/` with their own email pre-filled, and return them to
 *  `/course/beginner/` once their code is verified (`src/parent/login/LoginPage.tsx`'s own
 *  `resolveNextPath` already bounces an ALREADY-logged-in parent straight to `next` on mount — see
 *  that file's doc comment — so this one URL serves both of item 6's two cases). Gated on
 *  `BEGINNER_LAUNCH` like every other post-launch surface: before launch there is no
 *  `/course/beginner/` to return to, so the plain, unenriched login URL is correct instead. */
export function activationLoginUrl(env: Env, email: string): string {
  if (env.BEGINNER_LAUNCH !== '1') return loginUrl(env);
  return loginUrl(env, { email, next: '/course/beginner/' });
}

export function claimUrl(env: Env, token: string): string {
  return `${appBaseUrl(env)}/claim?token=${encodeURIComponent(token)}`;
}

/** Admin dashboard order page ("a direct link to the order in Shopify admin"): Shopify's own
 *  `/admin/orders/{id}` path on the shop domain redirects to the modern admin.shopify.com UI
 *  regardless of which one staff actually use. `null` (not a broken link) when
 *  `SHOPIFY_SHOP_DOMAIN` isn't configured yet — same honest not-yet-configured convention as
 *  every other optional env var in this backend. */
export function shopifyAdminOrderUrl(env: Env, shopifyOrderId: string): string | null {
  if (!env.SHOPIFY_SHOP_DOMAIN) return null;
  return `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/orders/${encodeURIComponent(shopifyOrderId)}`;
}
