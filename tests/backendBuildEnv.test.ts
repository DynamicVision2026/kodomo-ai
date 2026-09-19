/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@google-cloud/firestore', () => {
  class Firestore {
    constructor(public opts: { projectId: string }) {}
  }
  return { Firestore };
});

const { buildEnv, REQUIRED_SECRET_NAMES } = await import('../backend/server/buildEnv');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const name of REQUIRED_SECRET_NAMES) delete process.env[name];
  delete process.env.SHOPIFY_SHOP_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_API_TOKEN;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.FIRESTORE_PROJECT_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('buildEnv', () => {
  it('throws, naming every missing required secret, rather than starting half-configured', () => {
    expect(() => buildEnv()).toThrow(/ADMIN_TOKEN.*SHOPIFY_WEBHOOK_SECRET|SHOPIFY_WEBHOOK_SECRET.*ADMIN_TOKEN/);
  });

  it('throws naming only the specific secret(s) actually missing', () => {
    process.env.ADMIN_TOKEN = 'test-admin';
    expect(() => buildEnv()).toThrow(/SHOPIFY_WEBHOOK_SECRET/);
    expect(() => buildEnv()).not.toThrow(/ADMIN_TOKEN/);
  });

  it('builds a complete Env once both required secrets are present', () => {
    process.env.ADMIN_TOKEN = 'test-admin';
    process.env.SHOPIFY_WEBHOOK_SECRET = 'test-webhook';
    const env = buildEnv();
    expect(env.ADMIN_TOKEN).toBe('test-admin');
    expect(env.SHOPIFY_WEBHOOK_SECRET).toBe('test-webhook');
    expect(env.NAZE_CODES).toBeDefined();
  });

  it('carries the optional Shopify Admin API fields through when present', () => {
    process.env.ADMIN_TOKEN = 'test-admin';
    process.env.SHOPIFY_WEBHOOK_SECRET = 'test-webhook';
    process.env.SHOPIFY_SHOP_DOMAIN = 'soul-id-2.myshopify.com';
    process.env.SHOPIFY_ADMIN_API_TOKEN = 'shpat_test';
    const env = buildEnv();
    expect(env.SHOPIFY_SHOP_DOMAIN).toBe('soul-id-2.myshopify.com');
    expect(env.SHOPIFY_ADMIN_API_TOKEN).toBe('shpat_test');
  });

  it('leaves the optional fields undefined when absent, rather than empty strings', () => {
    process.env.ADMIN_TOKEN = 'test-admin';
    process.env.SHOPIFY_WEBHOOK_SECRET = 'test-webhook';
    const env = buildEnv();
    expect(env.SHOPIFY_SHOP_DOMAIN).toBeUndefined();
    expect(env.SHOPIFY_ADMIN_API_TOKEN).toBeUndefined();
  });
});
