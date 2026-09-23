import type { Env } from './types.js';

/**
 * AD-13 §3 "Global rules": "state-changing requests require Content-Type: application/json and
 * an allowed Origin (CSRF protection)." A cross-site form POST can't set a JSON content type or
 * an arbitrary Origin header, so both together rule out the classic cookie-riding CSRF form.
 *
 * `env.APP_ORIGIN` is unset until the custom domain (§1's Option A/B) is live — see the launch
 * blockers list. Until then, this fails CLOSED for any request that actually carries a browser
 * Origin header (safer default while the real value is still pending), and only requests with no
 * Origin header at all (same-origin navigations some browsers omit it for, and non-browser
 * callers) get through — which is also why every acceptance test that exercises this constructs
 * an `Env` with `APP_ORIGIN` set explicitly, matching how it will actually run once deployed.
 */
export function passesCsrfCheck(request: Request, env: Env): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === env.APP_ORIGIN;
}
