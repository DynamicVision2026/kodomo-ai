import type { Env } from './types.js';
import { handleShopifyOrderWebhook, handleShopifyRefundWebhook } from './handlers/webhook.js';
import { handleAdmin } from './handlers/admin.js';
import { handleAuthRequest } from './handlers/authRequest.js';
import { handleAuthVerify } from './handlers/authVerify.js';
import { handleAuthLogout } from './handlers/authLogout.js';
import { handleMe } from './handlers/me.js';
import { handleCreateProfile, handleDeleteProfile, handleUpdateProfile } from './handlers/profiles.js';
import { handleGetProgress, handlePutProgress } from './handlers/progress.js';
import { handleImport } from './handlers/importHandler.js';
import { handleDeleteSession, handleListSessions } from './handlers/sessions.js';
import { handleAccountEmail, handleDeleteAccount } from './handlers/account.js';

/**
 * AD-13 §1 "Domain requirement": every `/api/v1/*` route is a cookie-bearing, credentialed,
 * cross-origin request under Option A (separate `app.<domain>`/`api.<domain>` subdomains) — an
 * open `*` origin (the old `/unlock` route's own CORS, WO-30) is never correct once real session
 * cookies are involved, so this only ever answers the ONE configured `APP_ORIGIN`, and answers
 * nothing at all (no CORS headers, browser blocks the response) while it's still unset.
 */
function corsHeaders(env: Env): Record<string, string> {
  if (!env.APP_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
}

function withCors(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(env))) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

/** Platform-neutral request router — plain Web-standard Request in, Response out. */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS' && path.startsWith('/api/v1/')) {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (request.method === 'POST' && path === '/webhooks/shopify/orders-paid') {
    return handleShopifyOrderWebhook(request, env);
  }
  if (request.method === 'POST' && path === '/webhooks/shopify/refunds-create') {
    return handleShopifyRefundWebhook(request, env);
  }
  if (path.startsWith('/admin/')) {
    return handleAdmin(request, env, url);
  }

  if (path.startsWith('/api/v1/')) {
    const response = await routeApi(request, env, path);
    return withCors(response, env);
  }

  return new Response('not found', { status: 404 });
}

async function routeApi(request: Request, env: Env, path: string): Promise<Response> {
  const segments = path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
  const method = request.method;

  if (method === 'POST' && path === '/api/v1/auth/request') return handleAuthRequest(request, env);
  if (method === 'POST' && path === '/api/v1/auth/verify') return handleAuthVerify(request, env);
  if (method === 'POST' && path === '/api/v1/auth/logout') return handleAuthLogout(request, env);
  if (method === 'GET' && path === '/api/v1/me') return handleMe(request, env);

  if (method === 'POST' && path === '/api/v1/profiles') return handleCreateProfile(request, env);
  if ((method === 'PATCH') && segments[0] === 'profiles' && segments.length === 2) {
    return handleUpdateProfile(request, env, segments[1]!);
  }
  if (method === 'DELETE' && segments[0] === 'profiles' && segments.length === 2) {
    return handleDeleteProfile(request, env, segments[1]!);
  }
  if (segments[0] === 'profiles' && segments[2] === 'progress' && segments.length === 4) {
    const [, profileId, , moduleId] = segments;
    if (method === 'GET') return handleGetProgress(request, env, profileId!, moduleId!);
    if (method === 'PUT') return handlePutProgress(request, env, profileId!, moduleId!);
  }

  if (method === 'POST' && path === '/api/v1/import') return handleImport(request, env);

  if (method === 'GET' && path === '/api/v1/sessions') return handleListSessions(request, env);
  if (method === 'DELETE' && segments[0] === 'sessions' && segments.length === 2) {
    return handleDeleteSession(request, env, segments[1]!);
  }

  if (method === 'POST' && path === '/api/v1/account/email') return handleAccountEmail(request, env);
  if (method === 'DELETE' && path === '/api/v1/account') return handleDeleteAccount(request, env);

  return new Response('not found', { status: 404 });
}
