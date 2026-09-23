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
