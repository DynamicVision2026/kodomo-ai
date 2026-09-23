/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@google-cloud/firestore', () => {
  class Firestore {
    constructor(public opts: { projectId: string }) {}
  }
  return { Firestore };
});

const { buildEnv, REQUIRED_SECRET_NAMES } = await import('../backend/server/buildEnv');
const { MemoryDb } = await import('../backend/server/memoryDb');
const { FakeEmailSender } = await import('../backend/src/email');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const name of REQUIRED_SECRET_NAMES) delete process.env[name];
  delete process.env.SHOPIFY_SHOP_DOMAIN;
  delete process.env.SHOPIFY_ADMIN_API_TOKEN;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.FIRESTORE_PROJECT_ID;
  delete process.env.EMAIL_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.APP_ORIGIN;
  delete process.env.STORE_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function setRequired() {
  process.env.ADMIN_TOKEN = 'test-admin';
  process.env.SHOPIFY_WEBHOOK_SECRET = 'test-webhook';
  process.env.AUTH_PEPPER = 'test-pepper';
}

describe('buildEnv', () => {
  it('throws, naming every missing required secret, rather than starting half-configured', () => {
    expect(() => buildEnv()).toThrow(/ADMIN_TOKEN/);
    expect(() => buildEnv()).toThrow(/SHOPIFY_WEBHOOK_SECRET/);
    expect(() => buildEnv()).toThrow(/AUTH_PEPPER/);
  });

  it('throws naming only the specific secret(s) actually missing', () => {
    process.env.ADMIN_TOKEN = 'test-admin';
    expect(() => buildEnv()).not.toThrow(/ADMIN_TOKEN/);
    expect(() => buildEnv()).toThrow(/SHOPIFY_WEBHOOK_SECRET/);
  });

  it('builds a complete Env once every required secret is present', () => {
    setRequired();
    const env = buildEnv();
    expect(env.ADMIN_TOKEN).toBe('test-admin');
    expect(env.SHOPIFY_WEBHOOK_SECRET).toBe('test-webhook');
    expect(env.AUTH_PEPPER).toBe('test-pepper');
    expect(env.db).toBeInstanceOf(MemoryDb); // no GCP project configured in this test
    expect(env.email).toBeInstanceOf(FakeEmailSender); // no EMAIL_API_KEY/EMAIL_FROM either
  });

  it('carries the optional Shopify Admin API and launch-config fields through when present', () => {
    setRequired();
    process.env.SHOPIFY_SHOP_DOMAIN = 'soul-id-2.myshopify.com';
    process.env.SHOPIFY_ADMIN_API_TOKEN = 'shpat_test';
    process.env.APP_ORIGIN = 'https://app.example.com';
    process.env.STORE_URL = 'https://store.example.com';
    const env = buildEnv();
    expect(env.SHOPIFY_SHOP_DOMAIN).toBe('soul-id-2.myshopify.com');
    expect(env.SHOPIFY_ADMIN_API_TOKEN).toBe('shpat_test');
    expect(env.APP_ORIGIN).toBe('https://app.example.com');
    expect(env.STORE_URL).toBe('https://store.example.com');
  });

  it('leaves the optional fields undefined when absent, rather than empty strings', () => {
    setRequired();
    const env = buildEnv();
    expect(env.SHOPIFY_SHOP_DOMAIN).toBeUndefined();
    expect(env.SHOPIFY_ADMIN_API_TOKEN).toBeUndefined();
    expect(env.APP_ORIGIN).toBeUndefined();
  });

  // WO-30 §10 (still enforced): known historical placeholder values must NOT be accepted for
  // release — the exact literal text docs/launch-runbook.md's own setup commands use.
  describe('placeholder secret rejection', () => {
    it('refuses to start with the runbook\'s own literal "<placeholder for now>" webhook secret', () => {
      setRequired();
      process.env.SHOPIFY_WEBHOOK_SECRET = '<placeholder for now>';
      expect(() => buildEnv()).toThrow(/SHOPIFY_WEBHOOK_SECRET.*placeholder/is);
    });

    it('refuses an admin token still carrying the runbook\'s own "<...>" template text', () => {
      setRequired();
      process.env.ADMIN_TOKEN = '<a long random string YOU generate>';
      expect(() => buildEnv()).toThrow(/ADMIN_TOKEN/);
    });

    it('refuses a Shopify Admin API token left as "changeme"', () => {
      setRequired();
      process.env.SHOPIFY_ADMIN_API_TOKEN = 'changeme';
      expect(() => buildEnv()).toThrow(/SHOPIFY_ADMIN_API_TOKEN/);
    });

    it('still accepts an ordinary short local-dev value — this is a placeholder-wording check, not a length/entropy check', () => {
      setRequired();
      expect(() => buildEnv()).not.toThrow();
    });
  });
});
