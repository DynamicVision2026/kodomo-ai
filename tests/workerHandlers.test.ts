/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleShopifyOrderWebhook } from '../backend/src/handlers/webhook';
import { handleAdminIssue } from '../backend/src/handlers/adminIssue';
import { handleUnlock } from '../backend/src/handlers/unlock';
import type { Env, KVNamespaceLike } from '../backend/src/types';

function makeFakeKv(): KVNamespaceLike {
  const data = new Map<string, string>();
  return {
    async get(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
  };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NAZE_CODES: makeFakeKv(),
    SHOPIFY_WEBHOOK_SECRET: 'webhook-secret',
    ADMIN_TOKEN: 'admin-secret',
    ...overrides,
  };
}

async function signedWebhookRequest(bodyObj: unknown, secret: string): Promise<Request> {
  const body = JSON.stringify(bodyObj);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const signature = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return new Request('https://worker.example/webhooks/shopify/orders-paid', {
    method: 'POST',
    headers: { 'X-Shopify-Hmac-Sha256': signature, 'content-type': 'application/json' },
    body,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
});
afterEach(() => vi.unstubAllGlobals());

describe('handleShopifyOrderWebhook', () => {
  it('rejects a badly-signed request without touching KV', async () => {
    const env = makeEnv();
    const req = await signedWebhookRequest({ id: 1, line_items: [] }, 'wrong-secret');
    const res = await handleShopifyOrderWebhook(req, env);
    expect(res.status).toBe(401);
  });

  it('an order for other products only (A-D) issues nothing and still returns 200', async () => {
    const env = makeEnv();
    const req = await signedWebhookRequest(
      { id: 2, line_items: [{ id: 10, sku: 'product-a-sku', quantity: 1 }] },
      env.SHOPIFY_WEBHOOK_SECRET,
    );
    const res = await handleShopifyOrderWebhook(req, env);
    expect(res.status).toBe(200);
    expect(await env.NAZE_CODES.get('order:2')).toBeNull();
  });

  it('a mixed order issues a code only for the matched line item, ignoring the rest', async () => {
    const env = makeEnv();
    const req = await signedWebhookRequest(
      {
        id: 3,
        line_items: [
          { id: 20, sku: 'product-a-sku', quantity: 1 },
          { id: 21, sku: 'kodomo-ai-m1', quantity: 1 },
        ],
      },
      env.SHOPIFY_WEBHOOK_SECRET,
    );
    const res = await handleShopifyOrderWebhook(req, env);
    expect(res.status).toBe(200);
    const orderIndex = JSON.parse((await env.NAZE_CODES.get('order:3'))!) as string[];
    expect(orderIndex).toHaveLength(1);
    const record = JSON.parse((await env.NAZE_CODES.get(`code:${orderIndex[0]}`))!);
    expect(record.moduleIds).toEqual(['m1']);
  });

  it('issues one code per unit for quantity > 1, never one code for the whole quantity', async () => {
    const env = makeEnv();
    const req = await signedWebhookRequest(
      { id: 4, line_items: [{ id: 30, sku: 'kodomo-ai-m1', quantity: 2 }] },
      env.SHOPIFY_WEBHOOK_SECRET,
    );
    await handleShopifyOrderWebhook(req, env);
    const orderIndex = JSON.parse((await env.NAZE_CODES.get('order:4'))!) as string[];
    expect(orderIndex).toHaveLength(2);
    expect(new Set(orderIndex).size).toBe(2); // distinct codes
  });

  it('is idempotent: a redelivered webhook for the same order never issues a second code', async () => {
    const env = makeEnv();
    const req1 = await signedWebhookRequest(
      { id: 5, line_items: [{ id: 40, sku: 'kodomo-ai-m1', quantity: 1 }] },
      env.SHOPIFY_WEBHOOK_SECRET,
    );
    await handleShopifyOrderWebhook(req1, env);
    const firstIndex = JSON.parse((await env.NAZE_CODES.get('order:5'))!) as string[];

    const req2 = await signedWebhookRequest(
      { id: 5, line_items: [{ id: 40, sku: 'kodomo-ai-m1', quantity: 1 }] },
      env.SHOPIFY_WEBHOOK_SECRET,
    );
    await handleShopifyOrderWebhook(req2, env);
    const secondIndex = JSON.parse((await env.NAZE_CODES.get('order:5'))!) as string[];
    expect(secondIndex).toEqual(firstIndex);
  });
});

describe('handleAdminIssue', () => {
  it('rejects a missing/wrong bearer token', async () => {
    const env = makeEnv();
    const req = new Request('https://worker.example/admin/issue', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
      body: JSON.stringify({ moduleIds: ['m1'] }),
    });
    expect((await handleAdminIssue(req, env)).status).toBe(401);
  });

  it('issues a founder code with the right bearer token', async () => {
    const env = makeEnv();
    const req = new Request('https://worker.example/admin/issue', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ moduleIds: ['m1'], founder: true, note: 'founder family #3' }),
    });
    const res = await handleAdminIssue(req, env);
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^NAZE-/);
    const record = JSON.parse((await env.NAZE_CODES.get(`code:${code}`))!);
    expect(record.founder).toBe(true);
    expect(record.shopifyOrderId).toBeUndefined();
  });

  it('rejects an empty moduleIds array', async () => {
    const env = makeEnv();
    const req = new Request('https://worker.example/admin/issue', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ moduleIds: [] }),
    });
    expect((await handleAdminIssue(req, env)).status).toBe(400);
  });
});

describe('handleUnlock', () => {
  async function issueViaAdmin(env: Env, moduleIds: string[]): Promise<string> {
    const req = new Request('https://worker.example/admin/issue', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ moduleIds }),
    });
    const res = await handleAdminIssue(req, env);
    return ((await res.json()) as { code: string }).code;
  }

  function unlockRequest(code: string, deviceId: string): Request {
    return new Request('https://worker.example/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, deviceId }),
    });
  }

  it('returns not_found for an unknown code', async () => {
    const env = makeEnv();
    const res = await handleUnlock(unlockRequest('NAZE-ZZZZ-ZZZZ', 'device-1'), env);
    expect(res.status).toBe(404);
  });

  it('redeems a known code and reports its module ids', async () => {
    const env = makeEnv();
    const code = await issueViaAdmin(env, ['m1']);
    const res = await handleUnlock(unlockRequest(code, 'device-1'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ moduleIds: ['m1'], founder: false, overCap: false });
  });

  it('is case/whitespace-insensitive on the code the buyer types in', async () => {
    const env = makeEnv();
    const code = await issueViaAdmin(env, ['m1']);
    const res = await handleUnlock(unlockRequest(`  ${code.toLowerCase()}  `, 'device-1'), env);
    expect(res.status).toBe(200);
  });

  it('the same device redeeming twice does not grow the device list', async () => {
    const env = makeEnv();
    const code = await issueViaAdmin(env, ['m1']);
    await handleUnlock(unlockRequest(code, 'device-1'), env);
    await handleUnlock(unlockRequest(code, 'device-1'), env);
    const record = JSON.parse((await env.NAZE_CODES.get(`code:${code}`))!);
    expect(record.devices).toEqual(['device-1']);
  });

  it('never blocks redemption past the soft cap, just flags overCap', async () => {
    const env = makeEnv();
    const code = await issueViaAdmin(env, ['m1']);
    for (let i = 0; i < 6; i++) {
      await handleUnlock(unlockRequest(code, `device-${i}`), env);
    }
    const res = await handleUnlock(unlockRequest(code, 'device-6'), env);
    const body = (await res.json()) as { overCap: boolean };
    expect(res.status).toBe(200);
    expect(body.overCap).toBe(true);
  });
});
