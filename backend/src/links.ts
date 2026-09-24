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

export function loginUrl(env: Env): string {
  return `${appBaseUrl(env)}/login`;
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
