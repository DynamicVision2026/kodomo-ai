import type { Env } from './types.js';

/**
 * AD-13 §3 "Global rules": "state-changing requests require Content-Type: application/json and
 * an allowed Origin (CSRF protection)." A cross-site form POST can't set a JSON content type or
 * an arbitrary Origin header, so both together rule out the classic cookie-riding CSRF form.
 *
 * Architect decision (same-origin API via reverse proxy): the browser never talks to this
 * backend cross-origin any more — every real request arrives via the frontend's own server-side
 * `/api/*` proxy, which forwards the browser's original `Origin` header unchanged. That header
 * is now the frontend's own canonical origin whenever the browser sends one at all, so this
 * check against `env.APP_ORIGINS` (an allowlist, never a wildcard) remains the real defense
 * against a request that reaches this still-`--allow-unauthenticated` backend some OTHER way
 * (i.e. not through the proxy) — this is a CSRF check, not CORS, and needs no CORS response
 * headers to do its job.
 *
 * Falls back to the older, single-origin `env.APP_ORIGIN` (deprecated — see types.ts) when
 * `APP_ORIGINS` isn't set yet, so a backend whose config predates this migration keeps working
 * unchanged rather than failing every state-changing request the moment this code ships ahead of
 * that service's own env-var update. Both unset fails CLOSED for any request that actually
 * carries a browser Origin header; only requests with no Origin header at all (same-origin
 * navigations some browsers omit it for, and non-browser callers) get through — which is also
 * why every acceptance test that exercises this constructs an `Env` with an origin allowlist set
 * explicitly, matching how it will actually run once deployed.
 */
export function passesCsrfCheck(request: Request, env: Env): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;
  const allowlist = env.APP_ORIGINS ?? (env.APP_ORIGIN ? [env.APP_ORIGIN] : []);
  return allowlist.includes(origin);
}
