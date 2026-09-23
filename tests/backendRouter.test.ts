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
    APP_ORIGIN: 'https://app.example.com',
    ...overrides,
  };
}

describe('handleRequest — CORS on /api/v1/* (AD-13 §1)', () => {
  it('answers an OPTIONS preflight for an /api/v1 route with the configured origin', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/api/v1/me', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('a real /api/v1 response also carries the CORS headers', async () => {
    const env = fakeEnv();
    const res = await handleRequest(new Request('https://backend.example/api/v1/me', { method: 'GET' }), env);
    expect(res.status).toBe(401); // no session cookie — CORS doesn't change that
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });

  it('emits no CORS headers at all while APP_ORIGIN is unset (the pre-domain-setup blocker state)', async () => {
    const env = fakeEnv({ APP_ORIGIN: undefined });
    const res = await handleRequest(new Request('https://backend.example/api/v1/me', { method: 'GET' }), env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('the webhook and admin routes never carry CORS headers — neither is ever called from a browser', async () => {
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
