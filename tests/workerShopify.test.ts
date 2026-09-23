/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { matchLineItems, verifyShopifyWebhook, type ShopifyOrderPayload } from '../backend/src/shopify';

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('matchLineItems: the actual isolation boundary from products A-D', () => {
  const order: ShopifyOrderPayload = {
    id: 1001,
    line_items: [
      { id: 1, sku: 'product-a-sku', quantity: 1, variant_id: 9001 },
      { id: 2, sku: 'kodomo-ai-m1', quantity: 1, variant_id: 5555 },
      { id: 3, sku: 'product-b-sku', quantity: 2, variant_id: 9002 },
      { id: 4, sku: null, quantity: 1, variant_id: null },
    ],
  };

  it('only returns the line item whose SKU is in the module allowlist', () => {
    const matched = matchLineItems(order);
    expect(matched).toHaveLength(1);
    expect(matched[0]).toEqual({ lineItemId: 2, sku: 'kodomo-ai-m1', moduleIds: ['m1'], quantity: 1, variantId: 5555 });
  });

  it('drops every other product\'s line items entirely, quantity included', () => {
    const matched = matchLineItems(order);
    expect(matched.some((m) => m.sku === 'product-a-sku')).toBe(false);
    expect(matched.some((m) => m.sku === 'product-b-sku')).toBe(false);
  });

  it('returns nothing at all for an order made up entirely of other products', () => {
    const otherOnly: ShopifyOrderPayload = {
      id: 1002,
      line_items: [
        { id: 5, sku: 'product-c-sku', quantity: 1, variant_id: 1 },
        { id: 6, sku: 'product-d-sku', quantity: 3, variant_id: 2 },
      ],
    };
    expect(matchLineItems(otherOnly)).toEqual([]);
  });

  it('preserves quantity > 1 for a matched item (multiple units of the same module)', () => {
    const twoUnits: ShopifyOrderPayload = { id: 1003, line_items: [{ id: 7, sku: 'kodomo-ai-m1', quantity: 2, variant_id: 5555 }] };
    expect(matchLineItems(twoUnits)[0]!.quantity).toBe(2);
  });
});

describe('AD-14 — exact SKU only, never title or prefix', () => {
  it('a near-miss SKU (prefix of the real one) is never matched', () => {
    const order: ShopifyOrderPayload = { id: 2001, line_items: [{ id: 1, sku: 'kodomo-ai-m1-v2', quantity: 1, variant_id: 1 }] };
    expect(matchLineItems(order)).toEqual([]);
  });

  it('a product whose TITLE happens to mention the real SKU is still ignored — SKU only, never title', () => {
    const order = {
      id: 2002,
      line_items: [{ id: 1, sku: 'unrelated-sku', quantity: 1, variant_id: 1, title: 'kodomo-ai-m1 bonus sticker' }],
    } as unknown as ShopifyOrderPayload;
    expect(matchLineItems(order)).toEqual([]);
  });

  it('carries variant_id through for every matched line item, for audit logging downstream', () => {
    const order: ShopifyOrderPayload = { id: 2003, line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 1, variant_id: 77777 }] };
    expect(matchLineItems(order)[0]!.variantId).toBe(77777);
  });

  it('a null variant_id (malformed/legacy payload) never throws — surfaced as null, not dropped', () => {
    const order: ShopifyOrderPayload = { id: 2004, line_items: [{ id: 1, sku: 'kodomo-ai-m1', quantity: 1, variant_id: null }] };
    expect(matchLineItems(order)[0]!.variantId).toBeNull();
  });
});

describe('verifyShopifyWebhook', () => {
  const secret = 'shhh-webhook-secret';
  const body = JSON.stringify({ id: 42, line_items: [] });

  it('accepts a correctly-signed body', async () => {
    const signature = await sign(body, secret);
    expect(await verifyShopifyWebhook(body, signature, secret)).toBe(true);
  });

  it('rejects a tampered body even with the original signature', async () => {
    const signature = await sign(body, secret);
    const tampered = body.replace('42', '43');
    expect(await verifyShopifyWebhook(tampered, signature, secret)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const wrongSignature = await sign(body, 'a-different-secret');
    expect(await verifyShopifyWebhook(body, wrongSignature, secret)).toBe(false);
  });

  it('rejects a missing signature header outright', async () => {
    expect(await verifyShopifyWebhook(body, '', secret)).toBe(false);
  });

  it('rejects garbage that is not valid base64 instead of throwing', async () => {
    expect(await verifyShopifyWebhook(body, 'not-base64-!!!', secret)).toBe(false);
  });
});
