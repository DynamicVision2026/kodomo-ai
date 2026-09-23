/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { handleRequest } from '../backend/src/router';
import type { Env } from '../backend/src/types';
import { MemoryDb } from '../backend/server/memoryDb';
import { FakeEmailSender } from '../backend/src/email';

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    db: new MemoryDb(),
    email: new FakeEmailSender(),
    SHOPIFY_WEBHOOK_SECRET: 'test-secret',
    ADMIN_TOKEN: 'test-admin',
    AUTH_PEPPER: 'test-pepper',
    APP_ORIGINS: ['https://app.example.com'],
    ...overrides,
  };
}

describe('handleRequest — no CORS on /api/v1/* any more (Architect decision: same-origin API via reverse proxy)', () => {
  it('an OPTIONS request to an /api/v1 route is no longer specially handled — nothing answers it, so it 404s like any other unrouted method', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/api/v1/me', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('a real /api/v1 response carries no CORS headers at all, with or without APP_ORIGINS set — the browser only ever reaches this backend via the frontend\'s own same-origin proxy now', async () => {
    for (const origins of [['https://app.example.com'], undefined]) {
      const env = fakeEnv({ APP_ORIGINS: origins });
      const res = await handleRequest(new Request('https://backend.example/api/v1/me', { method: 'GET' }), env);
      expect(res.status).toBe(401); // no session cookie — unrelated to CORS
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    }
  });

  it('the webhook and admin routes never carried CORS headers and still don\'t — neither is ever called from a browser', async () => {
    const env = fakeEnv();
    const webhookRes = await handleRequest(
      new Request('https://backend.example/webhooks/shopify/orders-paid', { method: 'POST', body: '{}' }),
      env,
    );
    expect(webhookRes.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const adminRes = await handleRequest(new Request('https://backend.example/admin/family?email=x@example.com', { method: 'GET' }), env);
    expect(adminRes.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('an unknown path/method 404s', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/nonsense', { method: 'GET' }), env);
    expect(res.status).toBe(404);
  });
});

describe('passesCsrfCheck — APP_ORIGINS is an allowlist, never a wildcard (Architect decision)', () => {
  it('accepts a request whose Origin is any one of several allowed origins', async () => {
    const env = fakeEnv({ APP_ORIGINS: ['https://app.example.com', 'https://domo-ai.com'] });
    for (const origin of ['https://app.example.com', 'https://domo-ai.com']) {
      const res = await handleRequest(
        new Request('https://backend.example/api/v1/auth/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin },
          body: JSON.stringify({ email: 'parent@example.com' }),
        }),
        env,
      );
      expect(res.status).toBe(200);
    }
  });

  it('rejects an Origin that is not on the allowlist — never a wildcard match', async () => {
    const env = fakeEnv({ APP_ORIGINS: ['https://app.example.com'] });
    const res = await handleRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
        body: JSON.stringify({ email: 'parent@example.com' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('falls back to the deprecated single-origin APP_ORIGIN when APP_ORIGINS is not set — a not-yet-migrated backend keeps working unchanged', async () => {
    const env = fakeEnv({ APP_ORIGINS: undefined, APP_ORIGIN: 'https://app.example.com' });
    const accepted = await handleRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
        body: JSON.stringify({ email: 'parent@example.com' }),
      }),
      env,
    );
    expect(accepted.status).toBe(200);

    const rejected = await handleRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
        body: JSON.stringify({ email: 'parent@example.com' }),
      }),
      env,
    );
    expect(rejected.status).toBe(403);
  });

  it('with neither APP_ORIGINS nor APP_ORIGIN set, any request carrying an Origin header is rejected — fails closed, never open', async () => {
    const env = fakeEnv({ APP_ORIGINS: undefined, APP_ORIGIN: undefined });
    const res = await handleRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
        body: JSON.stringify({ email: 'parent@example.com' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('handleRequest — routing', () => {
  it('POST /api/v1/auth/request always answers 200 (no enumeration) for a well-formed body', async () => {
    const env = fakeEnv();
    const res = await handleRequest(
      new Request('https://backend.example/api/v1/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
        body: JSON.stringify({ email: 'parent@example.com' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('an invalid signature on the orders-paid webhook is rejected with 401', async () => {
    const env = fakeEnv();
    const res = await handleRequest(
      new Request('https://backend.example/webhooks/shopify/orders-paid', {
        method: 'POST',
        headers: { 'X-Shopify-Hmac-Sha256': 'not-a-real-signature' },
        body: JSON.stringify({ id: 1, line_items: [] }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('/admin/* without a bearer token is rejected with 401', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/admin/family?email=x@example.com', { method: 'GET' }), env);
    expect(res.status).toBe(401);
  });
});
