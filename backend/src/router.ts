import type { Env } from './types.js';
import { handleShopifyOrderWebhook, handleShopifyRefundWebhook } from './handlers/webhook.js';
import { handleAdmin } from './handlers/admin.js';
import { handleAuthRequest } from './handlers/authRequest.js';
import { handleAuthVerify } from './handlers/authVerify.js';
import { handleAuthLogout } from './handlers/authLogout.js';
import { handleMe } from './handlers/me.js';
import { handleCreateProfile, handleDeleteProfile, handleUpdateProfile } from './handlers/profiles.js';
import { handleGetProgress, handlePutProgress } from './handlers/progress.js';
import { handleGetCourseProgress, handlePutCourseProgress } from './handlers/courseProgress.js';
import { handleImport } from './handlers/importHandler.js';
import { handleDeleteSession, handleListSessions } from './handlers/sessions.js';
import { handleAccountEmail, handleDeleteAccount, handleRequestDeleteCode } from './handlers/account.js';
import { handleCreatePurchaseIntent } from './handlers/purchaseIntents.js';
import { handleUnitOpen } from './handlers/units.js';
import { handleCourseLessonOpen } from './handlers/courseLessonOpen.js';
import { handleConfirmClaim, handleGetClaim } from './handlers/claims.js';

/**
 * Architect decision (same-origin API via reverse proxy): the frontend Cloud Run service now
 * reverse-proxies `/api/*` to this backend server-side — a browser never makes a cross-origin
 * request to this backend directly any more, so credentialed CORS (Access-Control-Allow-*
 * response headers, the OPTIONS preflight this used to answer) is no longer needed for the app
 * and has been removed entirely. `passesCsrfCheck` (backend/src/csrf.ts) remains the real
 * defense against a request that reaches this still-`--allow-unauthenticated` backend some other
 * way — a CSRF check, not CORS, and it needs no response headers to do its job.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

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
    return routeApi(request, env, path);
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

  // WO-C1: the formal course's own progress endpoint, deliberately a separate path
  // (course-progress, not progress) from the Playground's above — see courseProgress.ts's header
  // comment on why the two shapes are never merged into one handler.
  if (segments[0] === 'profiles' && segments[2] === 'course-progress' && segments.length === 4) {
    const [, profileId, , courseId] = segments;
    if (method === 'GET') return handleGetCourseProgress(request, env, profileId!, courseId!);
    if (method === 'PUT') return handlePutCourseProgress(request, env, profileId!, courseId!);
  }

  if (method === 'POST' && path === '/api/v1/import') return handleImport(request, env);

  if (method === 'GET' && path === '/api/v1/sessions') return handleListSessions(request, env);
  if (method === 'DELETE' && segments[0] === 'sessions' && segments.length === 2) {
    return handleDeleteSession(request, env, segments[1]!);
  }

  if (method === 'POST' && path === '/api/v1/account/email') return handleAccountEmail(request, env);
  if (method === 'POST' && path === '/api/v1/account/delete-code') return handleRequestDeleteCode(request, env);
  if (method === 'DELETE' && path === '/api/v1/account') return handleDeleteAccount(request, env);

  if (method === 'POST' && path === '/api/v1/purchase-intents') return handleCreatePurchaseIntent(request, env);

  if (method === 'POST' && segments[0] === 'units' && segments[2] === 'open' && segments.length === 3) {
    return handleUnitOpen(request, env, segments[1]!);
  }

  // Founder, 2 Oct 2026: refund-tracking for the beginner course's own Lessons 2-7 — see
  // handlers/courseLessonOpen.ts's own header comment for why this is a separate endpoint from
  // `/units/{unitId}/open` above rather than a reuse of it.
  if (method === 'POST' && segments[0] === 'course-lessons' && segments[2] === 'open' && segments.length === 3) {
    return handleCourseLessonOpen(request, env, segments[1]!);
  }

  if (segments[0] === 'claims' && segments.length === 2) {
    if (method === 'GET') return handleGetClaim(request, env, segments[1]!);
    if (method === 'POST') return handleConfirmClaim(request, env, segments[1]!);
  }

  return new Response('not found', { status: 404 });
}
