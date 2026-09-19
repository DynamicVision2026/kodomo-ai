/**
 * Everything Shopify-shaped: webhook signature verification, and the product isolation filter
 * that keeps this integration from ever touching products A/B/C/D's orders.
 *
 * Isolation is a SKU allowlist, not a tag. Shopify's orders/paid webhook payload always
 * includes each line item's `sku` inline (no extra Admin API round-trip needed to decide
 * whether to act); a product *tag* is a property of the Product, not the line item, so
 * checking it would mean an extra fetch per order for no real safety gain here. A line item
 * whose SKU is not in this table is invisible to this Worker — not filtered out, never seen
 * as relevant in the first place. Extend this table when a new module ships; never widen it
 * to a prefix/wildcard match.
 */
import { timingSafeEqual } from './util.js';

export const SKU_TO_MODULE_IDS: Record<string, string[]> = {
  'kodomo-ai-m1': ['m1'],
};

export interface ShopifyLineItem {
  id: number;
  sku: string | null;
  quantity: number;
}

export interface ShopifyOrderPayload {
  id: number;
  line_items: ShopifyLineItem[];
}

export interface MatchedLineItem {
  lineItemId: number;
  sku: string;
  moduleIds: string[];
  /** One family code is issued per unit purchased — a household that buys 2 of the same
   *  module in one order gets 2 separate codes, never one code silently covering both. */
  quantity: number;
}

/** Pure. Only ever returns entries whose SKU is in SKU_TO_MODULE_IDS — this IS the isolation
 *  boundary between this integration and products A-D; every other line item is dropped here
 *  and never reaches code issuance, order-note, or fulfillment calls. */
export function matchLineItems(order: ShopifyOrderPayload): MatchedLineItem[] {
  const matched: MatchedLineItem[] = [];
  for (const item of order.line_items) {
    if (!item.sku) continue;
    const moduleIds = SKU_TO_MODULE_IDS[item.sku];
    if (!moduleIds) continue;
    matched.push({ lineItemId: item.id, sku: item.sku, moduleIds, quantity: item.quantity });
  }
  return matched;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies Shopify's X-Shopify-Hmac-Sha256 header against the RAW request body (must be the
 * exact bytes Shopify sent — never a re-serialized JSON.stringify of a parsed object, which
 * can reorder keys or change whitespace and silently break the signature).
 */
export async function verifyShopifyWebhook(
  rawBody: string,
  headerSignatureBase64: string,
  secret: string,
): Promise<boolean> {
  if (!headerSignatureBase64) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));

  let providedBytes: Uint8Array;
  try {
    providedBytes = Uint8Array.from(atob(headerSignatureBase64), (c) => c.charCodeAt(0));
  } catch {
    return false; // not valid base64 at all -> definitely not a match
  }
  // Compare as hex, not raw bytes/base64 directly — a fixed-length string comparison either
  // way, but this sidesteps ever needing to special-case a length mismatch by hand.
  return timingSafeEqual(toHex(new Uint8Array(digest)), toHex(providedBytes));
}
