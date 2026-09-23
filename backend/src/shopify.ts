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
  /** AD-14: "log variant_id for audit" — captured alongside the match, never used to decide
   *  isolation itself (that's `sku`, exact-match only, see SKU_TO_MODULE_IDS above). */
  variant_id: number | null;
}

export interface ShopifyOrderPayload {
  id: number;
  line_items: ShopifyLineItem[];
  /** AD-13 §3: read directly off the real `orders/paid` payload now — Shopify always includes
   *  both `email` and `customer.email` (the latter absent only for a genuinely anonymous/guest
   *  checkout with no account and no contact email at all, vanishingly rare for a paid order).
   *  Prefer `customer.email` when present; `email` is the fallback. */
  email?: string | null;
  customer?: { email?: string | null } | null;
}

export interface ShopifyRefundLineItem {
  line_item_id: number;
  quantity: number;
  line_item?: { sku: string | null } | null;
}

/** AD-13 §3: the `refunds/create` webhook payload — a refund references its order only by id, so
 *  the handler must look up `orders/{orderId}` (already recorded by the `orders/paid` handler)
 *  to know which family/entitlement it belongs to. */
export interface ShopifyRefundPayload {
  id: number;
  order_id: number;
  refund_line_items: ShopifyRefundLineItem[];
}

/** The purchaser's email, per AD-13 §3's own preference order. */
export function purchaserEmail(order: ShopifyOrderPayload): string | null {
  return order.customer?.email ?? order.email ?? null;
}

/** Module ids actually refunded, restricted to this integration's own SKU allowlist — a refund
 *  touching only products A-D's line items returns `[]` and the webhook does nothing. */
export function matchRefundedModuleIds(refund: ShopifyRefundPayload): string[] {
  const moduleIds = new Set<string>();
  for (const item of refund.refund_line_items) {
    const sku = item.line_item?.sku;
    if (!sku) continue;
    for (const moduleId of SKU_TO_MODULE_IDS[sku] ?? []) moduleIds.add(moduleId);
  }
  return [...moduleIds];
}

export interface MatchedLineItem {
  lineItemId: number;
  sku: string;
  moduleIds: string[];
  /** One entitlement grant per unit purchased in the sense that quantity > 1 is preserved
   *  through to the caller — never silently collapsed to a single unit. */
  quantity: number;
  /** AD-14: "log variant_id for audit" — carried through so the webhook handler can both log it
   *  and persist it on the OrderDoc, without this module (the pure isolation/matching logic)
   *  taking on any logging or storage concern itself. */
  variantId: number | null;
}

/**
 * Pure. Only ever returns entries whose SKU is in SKU_TO_MODULE_IDS — this IS the isolation
 * boundary between this integration and products A-D; every other line item is dropped here and
 * never reaches entitlement granting, order-note, or fulfillment calls. AD-14: exact-SKU lookup
 * only (`SKU_TO_MODULE_IDS[item.sku]`) — never a title match, never a prefix/`startsWith` check;
 * an unrelated Shopify line item (any SKU not in the table, including a near-miss like
 * `kodomo-ai-m1-v2`) is silently ignored, exactly like every other non-matching product.
 */
export function matchLineItems(order: ShopifyOrderPayload): MatchedLineItem[] {
  const matched: MatchedLineItem[] = [];
  for (const item of order.line_items) {
    if (!item.sku) continue;
    const moduleIds = SKU_TO_MODULE_IDS[item.sku];
    if (!moduleIds) continue;
    matched.push({ lineItemId: item.id, sku: item.sku, moduleIds, quantity: item.quantity, variantId: item.variant_id ?? null });
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
