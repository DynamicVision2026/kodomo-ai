import type { Env } from './types.js';
import { handleShopifyOrderWebhook } from './handlers/webhook.js';
import { handleAdminIssue } from './handlers/adminIssue.js';
import { handleUnlock } from './handlers/unlock.js';

/**
 * Platform-neutral request router — plain Web-standard Request in, Response out. No
 * Cloudflare-specific module shape (this used to be `export default { fetch }`, the Workers
 * convention). backend/server/ adapts this to Express/Cloud Run; nothing under backend/src/
 * needs to know what's calling it, same as before the platform switch.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/webhooks/shopify/orders-paid') {
    return handleShopifyOrderWebhook(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/admin/issue') {
    return handleAdminIssue(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/unlock') {
    return handleUnlock(request, env);
  }

  return new Response('not found', { status: 404 });
}
