/**
 * Minimal structural KV interface — not @cloudflare/workers-types. Cloudflare's real
 * KVNamespace satisfies this shape at runtime; keeping it hand-rolled means tests can use a
 * plain in-memory fake with no extra dependency, and the type-checker still catches misuse.
 */
export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  /** One namespace, two key shapes: `code:<CODE>` -> IssuedCode, `order:<orderId>` -> string[]
   *  of codes already issued for that order (webhook idempotency). */
  NAZE_CODES: KVNamespaceLike;
  /** Shared secret Shopify signs webhook bodies with (Admin -> Settings -> Notifications). */
  SHOPIFY_WEBHOOK_SECRET: string;
  /** Bearer token guarding POST /admin/issue. Never the same value as anything Shopify holds. */
  ADMIN_TOKEN: string;
  /** e.g. "soul-id-2.myshopify.com" — only used for the optional order note/fulfillment calls. */
  SHOPIFY_SHOP_DOMAIN?: string;
  /** Admin API access token, only needed if attachCodeToOrder/fulfillment calls are enabled. */
  SHOPIFY_ADMIN_API_TOKEN?: string;
}

/** What a redeemable code actually unlocks. Spec v0.5 §7: "maps code -> module ids, counts
 *  activations (soft cap 5 devices)." */
export interface IssuedCode {
  code: string;
  moduleIds: string[];
  founder: boolean;
  /** Distinct device ids that have redeemed this code, deduplicated. Soft cap: redemption is
   *  never blocked once over the cap, spec says "soft" — devices past 5 are just visible for
   *  the founder to notice, not denied. */
  devices: string[];
  maxDevices: number;
  issuedAt: string;
  /** Present only for a code issued from a real Shopify order (absent for founder codes issued
   *  directly via /admin/issue). */
  shopifyOrderId?: string;
  note?: string;
}
