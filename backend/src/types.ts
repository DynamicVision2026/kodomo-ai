import type { Db } from './db.js';
import type { EmailSender } from './email.js';

export interface Env {
  db: Db;
  email: EmailSender;
  /** Shared secret Shopify signs webhook bodies with (Admin -> Settings -> Notifications). */
  SHOPIFY_WEBHOOK_SECRET: string;
  /** Bearer token guarding every `/admin/*` route. */
  ADMIN_TOKEN: string;
  /** AD-13 §2: HMAC key for `loginCodes.codeHmac` and every stored session-token hash. Never the
   *  same value as ADMIN_TOKEN or the Shopify secret. */
  AUTH_PEPPER: string;
  /** AD-13 §1 "Domain requirement": the frontend's own origin, e.g. `https://app.<domain>` —
   *  used both as the CORS allow-origin for every cookie-bearing route and as the base URL the
   *  welcome/login-code emails link to. Unset until the custom domain (Option A/B) is chosen and
   *  DNS is live — see the launch blockers list; every route that needs it fails closed (never
   *  falls back to `*`) until it is. */
  APP_ORIGIN?: string;
  /** e.g. "soul-id-2.myshopify.com" — used for the optional order note/fulfillment calls, and as
   *  the host of the AD-16 §1 purchase-intent cart permalink. */
  SHOPIFY_SHOP_DOMAIN?: string;
  /** Admin API access token, only needed if attachCodeToOrder/fulfillment calls are enabled. */
  SHOPIFY_ADMIN_API_TOKEN?: string;
  /** AD-16 §1: moduleId -> Shopify variant id, for building a purchase-intent cart permalink
   *  (`/cart/{variantId}:1?attributes[domo_pt]=...`). Unset until the real product/variant exists
   *  in Shopify Admin — `POST /purchase-intents` answers `not_configured` until it is. */
  SHOPIFY_VARIANT_IDS?: Record<string, string>;
  /** AD-16 §8: IAP's own resource audience for the `kodomo-ai-admin` service, e.g.
   *  `/projects/123456789/apps/kodomo-ai-admin` — required for the admin service only; the
   *  public backend never reads this. */
  IAP_AUDIENCE?: string;
}
