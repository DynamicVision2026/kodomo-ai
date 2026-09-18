# Task 7 — Shopify Integration & Automated Code Delivery: runbook

Repo: `DynamicVision2026/kodomo-ai` · Store: `https://soul-id-2.myshopify.com/`

**What this session built:** the Cloudflare Worker at `worker/src/` — webhook receiver, code
issuer, redemption endpoint — plus `wrangler.toml` and 27 tests (`tests/worker*.test.ts`); and,
in a follow-up pass, the `/play/unlock` client screen (`src/parent/unlock/`) that actually
calls it, plus 19 more tests. 46 tests total for this integration, all green.

**What this session could not do, and why:** this is a code session with no Shopify Admin
access to `soul-id-2.myshopify.com` and no Cloudflare account access — no such credentials or
tools exist here. Every step below that touches the live store or a live Cloudflare account
needs someone with real access to actually execute. This document is written so that person
doesn't have to make any additional design decisions — just follow it.

---

## 0. The isolation guarantee, stated once

Products A, B, C, D must never be touched by any of this. The mechanism (verified by
`tests/workerShopify.test.ts`, "matchLineItems: the actual isolation boundary from products
A-D"):

- `worker/src/shopify.ts`'s `SKU_TO_MODULE_IDS` is an **allowlist**, not a tag or a
  filter-out list. A line item whose SKU isn't a key in that table is never seen as relevant —
  no KV write, no Admin API call, for that line item, ever. Today it contains exactly one
  entry: `'kodomo-ai-m1': ['m1']` (matching `src/modules/m1/module.json`'s own `sku` field).
- The buyer email is delivered by a **brand-new Shopify Flow workflow** (§4 below), not by
  editing the shared "Order confirmation" or "Shipping confirmation" templates products A-D
  already rely on. There is no shared template to accidentally break.
- The webhook handler always returns `200` for an order with no matched line items (an A-D-only
  order) — it does nothing, but it also never errors or retries in a way that could affect
  those orders' own processing.

---

## 1. Shopify: product listing

Create the product for this module (repeat per module as more ship):

- **Title / description:** per spec v0.5 §9/§10 (¥4,980 tax incl., one-time, household
  licence, 30-day guarantee — no struck-through prices, no pre-order-specific wording).
- **SKU:** `kodomo-ai-m1` — **must exactly match** `worker/src/shopify.ts`'s
  `SKU_TO_MODULE_IDS` key and `src/modules/m1/module.json`'s `"sku"` field. This is the whole
  isolation mechanism; a typo here means the webhook silently ignores every real purchase.
- **Tag (defense in depth, optional but recommended):** add a product tag such as
  `naze-family-code` for your own admin-side filtering/reporting. The Worker itself does not
  read tags — SKU is the enforced boundary — so this tag is a convenience for you, not a
  requirement for the integration to work.
- Leave products A-D completely alone. Nothing here requires touching them.

## 2. Cloudflare: KV namespace + secrets

From a machine with Cloudflare account access, in this repo:

```sh
npx wrangler kv namespace create NAZE_CODES
# copy the returned "id" into wrangler.toml's kv_namespaces[0].id

npx wrangler secret put SHOPIFY_WEBHOOK_SECRET
# paste the signing secret Shopify shows you in step 3 below

npx wrangler secret put ADMIN_TOKEN
# any long random string YOU generate — this guards POST /admin/issue (founder codes, reissues)

npx wrangler secret put SHOPIFY_ADMIN_API_TOKEN
# a custom app Admin API access token, scope: write_orders (needed for the metafield write in §4)

npx wrangler deploy
```

`wrangler.toml` already sets `SHOPIFY_SHOP_DOMAIN = "soul-id-2.myshopify.com"` as a non-secret
var. Deploy gives you the Worker's URL (`https://naze-family-code-worker.<subdomain>.workers.dev`
by default, or your own custom domain if you route one) — you need it for step 3.

## 3. Shopify: webhook subscription

Admin → **Settings → Notifications** → scroll to **Webhooks** → **Create webhook**:

- **Event:** `Order payment` (`orders/paid`) — fires once payment actually clears, not at
  checkout start. Do not use `orders/create`.
- **Format:** JSON.
- **URL:** `https://<your-worker-domain>/webhooks/shopify/orders-paid`
- **API version:** any current stable version (the payload fields this Worker reads —
  `id`, `line_items[].id/sku/quantity` — have been stable for years).

Saving it shows a **signing secret once** — that's the value for `SHOPIFY_WEBHOOK_SECRET` in
step 2. If you deployed before creating the webhook, re-run `wrangler secret put
SHOPIFY_WEBHOOK_SECRET` after and no redeploy is needed (secrets apply immediately).

## 4. Shopify: automated buyer email (Shopify Flow, not a template edit)

Why Flow and not customizing the order-confirmation email: Shopify's default confirmation
email can fire before this webhook's Admin API call finishes writing the code (it's triggered
by `orders/paid`, not by the metafield write) — editing that shared template risks sometimes
mailing a blank code, and it would mean editing a template products A-D's orders also render
through. Flow avoids both problems: it triggers off the metafield write itself, so it cannot
run before the code exists, and it is an entirely new, separate workflow — nothing shared with
A-D to break.

Admin → **Apps → Flow** → **Create workflow**:

- **Trigger:** "Order metafield updated" (or "Metafield updated" depending on your Flow
  version) → namespace `naze`, key `family_code`.
- **Action:** "Send custom email" (or "Send email" — naming varies by Flow version) →
  - To: `{{order.customer.email}}`
  - Subject: something like `ナゼホリ（仮）— ご購入ありがとうございます`
  - Body: include `{{order.metafields.naze.family_code}}` (this is the code the Worker wrote —
    `worker/src/shopifyAdmin.ts#attachCodesToOrderMetafield`). If Flow's variable picker shows
    a different path for the same metafield, use whatever it resolves to; the metafield's
    `namespace`/`key` (`naze`/`family_code`) are the values that must match what the Worker
    writes.
- If an order matched **more than one unit** (quantity > 1, or two different modules), the
  metafield value is a comma-separated list of all codes issued for that order (e.g.
  `NAZE-AB3D-9KTP, NAZE-QP7M-2XCV`) — the email body will show all of them as one string. A
  fancier per-code layout would need a custom app block instead of Flow; out of scope here.

This workflow only ever fires for orders where the `naze.family_code` metafield gets written —
which only happens for a matched line item (§0). Products A-D's orders never have that
metafield, so this workflow structurally never fires for them.

**Fallback if the metafield write failed** (`worker/src/shopifyAdmin.ts` logs this as a
best-effort failure, never blocking code issuance): the code still exists and is redeemable —
look it up via the Worker's KV (`wrangler kv key get --namespace-id=<id> "order:<order id>"`
gives you the code(s) for that order) and resend manually.

## 5. The app's redemption screen — built, but needs the Worker's real URL

`/play/unlock` (`src/parent/unlock/`) is done: takes the buyer's typed code + a per-device id
already generated into `AppState.deviceId` (`src/engine/storage.ts`, non-PII), POSTs to the
Worker's `/unlock`, and on success grants `${moduleId}:full` via `applyRedemption()`
(`src/engine/entitlements.ts`) — reusing `hasAccess()` unchanged. Lives under `src/parent`
(same gate-exempt zone as `src/lp`/`src/legal`) since it's an adult-only action, never
something a child operates.

**One thing this still needs from you:** it reads the Worker's URL from
`VITE_UNLOCK_API_URL` at *build* time (a Vite env var, not a Worker secret — set it wherever
you run `npm run build`, e.g. in Cloudflare Pages' own project environment variables if that's
what serves the static site). Until it's set, the page shows a "not live yet" message and
never calls `fetch` at all — that's deliberate, not a bug, so a not-yet-deployed Worker can't
produce a confusing network-error message instead of an honest one.

## 6. Testing before going live

1. `npx vitest run tests/worker*.test.ts tests/redeemCode.test.ts tests/entitlements.test.ts
   tests/UnlockPage.test.tsx` — 46 tests total (webhook/issue/unlock on the Worker side; the
   client screen's not-configured/success/soft-cap-note/not-found states on the app side), all
   pure/mocked, no live credentials needed. Already green as of this commit. The app-side
   tests were also confirmed in a real Chromium render (not just jsdom) with a mocked Worker
   response before this was called done.
2. Shopify Admin → the webhook's detail page → **Send test notification** — sends a sample
   payload (a *fake* order with placeholder SKUs, not `kodomo-ai-m1`) so you can confirm the
   Worker responds `200` without erroring. It will NOT exercise the real code-issuance path
   (the sample SKU won't match the allowlist) — that only happens with a real or a manually
   crafted matching payload.
3. A real ¥4,980 test purchase (spec v0.5's own DoD, work-order-w1.md's Sprint DoD: "test
   purchase completes with card and PayPay") is the actual end-to-end proof: buy → webhook
   fires → KV has a new code → Flow email arrives with it → `/play/unlock` accepts it and
   grants access. Refund it after via the existing 30-day guarantee.
4. Confirm products A-D's own confirmation/shipping emails are byte-for-byte unchanged after
   all of the above — nothing in this integration should have touched their templates.

---

## Env vars / secrets reference

| Name | Where it's set | Purpose |
|---|---|---|
| `SHOPIFY_WEBHOOK_SECRET` | `wrangler secret put` | Verifies the webhook actually came from Shopify |
| `ADMIN_TOKEN` | `wrangler secret put` | Bearer token guarding `POST /admin/issue` (founder codes) |
| `SHOPIFY_ADMIN_API_TOKEN` | `wrangler secret put` | Lets the Worker write the `naze.family_code` order metafield |
| `SHOPIFY_SHOP_DOMAIN` | `wrangler.toml` `[vars]` (not secret) | Which shop the Admin API calls target |
| `VITE_UNLOCK_API_URL` | Wherever the static site is built (e.g. Cloudflare Pages project env vars) — NOT a Worker secret | The deployed Worker's base URL, read by `/play/unlock` at build time |
