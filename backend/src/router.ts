import type { Env } from './types.js';
import { handleShopifyOrderWebhook } from './handlers/webhook.js';
import { handleAdminIssue } from './handlers/adminIssue.js';
import { handleUnlock } from './handlers/unlock.js';

/**
 * WO-30: `/unlock` is the one route a real family's BROWSER calls directly (src/parent/unlock/
 * redeemCode.ts) — and the frontend and this backend are deployed as separate Cloud Run
 * services/origins (docs/launch-runbook.md Parts 1-2), so this is a genuinely cross-origin
 * fetch(). Without these headers the browser silently discards the response (a real production
 * WO-30 browser QA pass caught this: every redemption attempt failed as an opaque "network
 * error", never reaching handleUnlock's own actual 200/404 logic at all — the request lands
 * fine, only the RESPONSE gets blocked). `*` is fine here: no cookies/credentials are ever
 * involved (spec v0.5 §7's own "no accounts" design), the request body is a code + a
 * non-identifying device id, and the endpoint's own logic is already what decides what a given
 * code is allowed to see — an open origin adds no new exposure. The webhook and admin-issue
 * routes are never called from a browser (Shopify's own servers / a curl/admin tool
 * respectively), so neither needs this.
 */
const UNLOCK_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

/**
 * Platform-neutral request router — plain Web-standard Request in, Response out. No
 * Cloudflare-specific module shape (this used to be `export default { fetch }`, the Workers
 * convention). backend/server/ adapts this to Express/Cloud Run; nothing under backend/src/
 * needs to know what's calling it, same as before the platform switch.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS' && url.pathname === '/unlock') {
    // The browser's own CORS preflight for the POST below — never reaches handleUnlock, no
    // body to read, no KV access, just the headers that let the real request through.
    return new Response(null, { status: 204, headers: UNLOCK_CORS_HEADERS });
  }

  if (request.method === 'POST' && url.pathname === '/webhooks/shopify/orders-paid') {
    return handleShopifyOrderWebhook(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/admin/issue') {
    return handleAdminIssue(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/unlock') {
    const res = await handleUnlock(request, env);
    const headers = new Headers(res.headers);
    for (const [name, value] of Object.entries(UNLOCK_CORS_HEADERS)) headers.set(name, value);
    return new Response(res.body, { status: res.status, headers });
  }

  return new Response('not found', { status: 404 });
}
