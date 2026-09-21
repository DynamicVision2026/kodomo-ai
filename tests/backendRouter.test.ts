import { describe, it, expect } from 'vitest';
import { handleRequest } from '../backend/src/router';
import type { Env } from '../backend/src/types';

function fakeEnv(): Env {
  const store = new Map<string, string>();
  return {
    NAZE_CODES: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      delete: async (k: string) => { store.delete(k); },
    },
    SHOPIFY_WEBHOOK_SECRET: 'test-secret',
    ADMIN_TOKEN: 'test-admin',
  };
}

/**
 * WO-30: a real browser QA pass against a locally-running backend caught this — /unlock is the
 * one route a family's BROWSER calls directly (src/parent/unlock/redeemCode.ts), and the
 * frontend/backend are separate Cloud Run origins (docs/launch-runbook.md Parts 1-2), so it's a
 * genuinely cross-origin fetch(). Before this fix, every real redemption attempt would have
 * silently failed as an opaque "network error" — the request reached handleUnlock fine, only
 * the browser discarding the CORS-less response was invisible to any test that (like
 * tests/workerHandlers.test.ts) calls handleUnlock directly, bypassing the router entirely.
 */
describe('handleRequest — CORS on /unlock (WO-30)', () => {
  it('answers an OPTIONS preflight for /unlock with the CORS headers a browser requires, never reaching handleUnlock', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/unlock', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('the real POST /unlock response also carries Access-Control-Allow-Origin', async () => {
    const env = fakeEnv();
    const res = await handleRequest(
      new Request('https://backend.example/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'NAZE-0000-0000', deviceId: 'd1' }),
      }),
      env,
    );
    expect(res.status).toBe(404); // not_found is still the correct body — CORS doesn't change that
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
  });

  it('OPTIONS on any other path is not treated as a CORS preflight — falls through to the ordinary 404', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/webhooks/shopify/orders-paid', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('the webhook and admin-issue routes are never given CORS headers — neither is ever called from a browser', async () => {
    const env = fakeEnv();
    const webhookRes = await handleRequest(
      new Request('https://backend.example/webhooks/shopify/orders-paid', { method: 'POST', body: '{}' }),
      env,
    );
    expect(webhookRes.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const adminRes = await handleRequest(
      new Request('https://backend.example/admin/issue', { method: 'POST', body: '{}' }),
      env,
    );
    expect(adminRes.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('an unknown path/method still 404s, unaffected by the CORS routing added above', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/nonsense', { method: 'GET' }), env);
    expect(res.status).toBe(404);
  });
});
