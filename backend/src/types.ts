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
  /** @deprecated Architect decision (same-origin API via reverse proxy): superseded by
   *  `APP_ORIGINS`/`APP_BASE_URL` below. Kept only as a fallback `passesCsrfCheck`/the email
   *  link-builders read when the newer vars aren't set yet — a live backend whose env still only
   *  carries this one (its config predates the migration) keeps working exactly as before,
   *  rather than regressing the instant this code ships ahead of a manual env-var update on that
   *  service (there is no CI job that deploys the backend — see docs/launch-runbook.md). Never
   *  read directly anywhere new; always through the two fields below's own fallback. */
  APP_ORIGIN?: string;
  /** Architect decision: same-origin API via reverse proxy. The frontend now proxies `/api/*` to
   *  this service itself — a browser never makes a cross-origin request to the backend directly
   *  any more, so credentialed CORS (Access-Control-Allow-*) is no longer needed for the app.
   *  This allowlist is the backend's own remaining defense: `passesCsrfCheck` verifies a
   *  state-changing request's `Origin` header (when present) is one of these — the same
   *  necessity as before, just never emitted as a CORS response header, since nothing depends on
   *  reading it cross-origin any more. One entry today (the canonical frontend origin,
   *  `https://kodomo-ai-421702481956.asia-northeast1.run.app`), a second (`https://domo-ai.com`)
   *  once the custom domain is live — no wildcard, ever. */
  APP_ORIGINS?: string[];
  /** Architect decision: the ONE canonical origin every emailed/redirect link is built from
   *  (welcome/module-activated email, claim email, /login's own default return, and the account
   *  page's own redirects) — `https://kodomo-ai-421702481956.asia-northeast1.run.app` today,
   *  `https://domo-ai.com` once that migration happens. Distinct from `APP_ORIGINS` (a CSRF
   *  allowlist, which may legitimately carry more than one origin during a domain migration)
   *  even though they hold the same value today — a link must always point at the ONE canonical
   *  place, never at whichever alias happened to receive the request. */
  APP_BASE_URL?: string;
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
  /** WO-C5 §7/follow-up: the server-side twin of the frontend build's `VITE_BEGINNER_LAUNCH` —
   *  set (or not) alongside it on every deploy, never independently. `'1'` means the beginner
   *  course (and the Playground access changes that ship with it) is on for every family;
   *  unset/anything else means backend/src/course.ts's `isBeginnerLaunchEnabled` falls back to
   *  the per-family `config/course.allowFamilies` allowlist, same as the frontend's own
   *  `me.courseAllowed` fallback. */
  BEGINNER_LAUNCH?: string;
}
