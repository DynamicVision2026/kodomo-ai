import type { Env } from './types';
import { handleShopifyOrderWebhook } from './handlers/webhook';
import { handleAdminIssue } from './handlers/adminIssue';
import { handleUnlock } from './handlers/unlock';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
  },
};
