# Task 7 — Shopify Integration & Automated Code Delivery: runbook

Repo: `DynamicVision2026/kodomo-ai` · Store: `https://soul-id-2.myshopify.com/`
Backend target: **Google Cloud Run** (moved off Cloudflare Workers — see the "Platform history"
note at the bottom for what changed and why nothing about the isolation logic itself did).

For the full ordered start-to-finish sequence (backend deploy → Pages/static-site deploy →
this document's Shopify steps → content pipeline), see `docs/launch-runbook.md`. This document
is the deep-dive on the Shopify integration specifically — the *why* behind each design choice.

**What this session built:** `backend/src/` — the platform-neutral webhook receiver, code
issuer, and redemption endpoint (Web-standard `Request`/`Response`, no framework or cloud
provider baked in) — plus `backend/server/` (the Express + Firestore + Secret Manager glue that
runs it on Cloud Run), a `Dockerfile`, and 46+ tests (`tests/backend*.test.ts`,
`tests/worker*.test.ts` — see the platform-history note for the naming). Also the
`/play/unlock` client screen (`src/parent/unlock/`) that actually calls it.

**What this session could not do, and why:** this is a code session with no Shopify Admin
access to `soul-id-2.myshopify.com` and no Google Cloud project access — no such credentials or
tools exist here. Every step below that touches the live store or a live GCP project needs
someone with real access to actually execute. This document is written so that person doesn't
have to make any additional design decisions — just follow it.

---

## 0. The isolation guarantee, stated once

Products A, B, C, D must never be touched by any of this. The mechanism (verified by
`tests/workerShopify.test.ts`, "matchLineItems: the actual isolation boundary from products
A-D" — this test file's own name predates the Cloud Run migration; the logic it tests, in
`backend/src/shopify.ts`, did not change):

- `backend/src/shopify.ts`'s `SKU_TO_MODULE_IDS` is an **allowlist**, not a tag or a
  filter-out list. A line item whose SKU isn't a key in that table is never seen as relevant —
  no store write, no Admin API call, for that line item, ever. Today it contains exactly one
  entry: `'kodomo-ai-m1': ['m1']` (matching `src/modules/m1/module.json`'s own `sku` field).
- The buyer email is delivered by a **brand-new Shopify Flow workflow** (§4 below), not by
  editing the shared "Order confirmation" or "Shipping confirmation" templates products A-D
  already rely on. There is no shared template to accidentally break.
- The webhook handler always returns `200` for an order with no matched line items (an A-D-only
  order) — it does nothing, but it also never errors or retries in a way that could affect
  those orders' own processing.

None of this depends on which cloud the backend happens to run on — it's a property of
`backend/src/shopify.ts` and `backend/src/handlers/webhook.ts`, both unchanged by the platform
switch.

---

## 1. Shopify: product listing

Create the product for this module (repeat per module as more ship):

- **Title / description:** per spec v0.5 §9/§10 (¥4,980 tax incl., one-time, household
  licence, 30-day guarantee — no struck-through prices, no pre-order-specific wording).
- **SKU:** `kodomo-ai-m1` — **must exactly match** `backend/src/shopify.ts`'s
  `SKU_TO_MODULE_IDS` key and `src/modules/m1/module.json`'s `"sku"` field. This is the whole
  isolation mechanism; a typo here means the webhook silently ignores every real purchase.
- **Tag (defense in depth, optional but recommended):** add a product tag such as
  `naze-family-code` for your own admin-side filtering/reporting. The backend itself does not
  read tags — SKU is the enforced boundary — so this tag is a convenience for you, not a
  requirement for the integration to work.
- Leave products A-D completely alone. Nothing here requires touching them.

## 2. Deploy the backend to Cloud Run

Full command sequence: `docs/launch-runbook.md` Part 1. Summary of what you end up with:

- A Cloud Run service built from the repo's `Dockerfile` (`backend/src/` + `backend/server/`
  only — the Dockerfile's `.dockerignore` keeps the React app and content pipeline out of this
  image entirely).
- A Firestore collection (`naze_kv` by default) as the persistent store — Cloud Run instances
  are stateless and can scale to more than one, so, unlike the old Cloudflare KV setup, this
  is not optional: `backend/server/kvStore.ts` will fall back to an in-memory store with a
  loud warning if no GCP project is detected, and that fallback is correct for local dev only.
- Three secrets (`ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_ADMIN_API_TOKEN`) set via
  `gcloud run deploy --set-secrets=...`, which mounts them as ordinary env vars — no SDK code
  needed for the primary path (`backend/server/secrets.ts` also supports fetching them
  directly from Secret Manager at startup as a fallback, if you'd rather rotate a secret
  without a redeploy — see its own doc comment).

`gcloud run deploy` prints the service's URL, e.g.
`https://naze-family-code-backend-<hash>-an.a.run.app` — **save it**, you need it for step 3
below and for `docs/launch-runbook.md` Part 2 (`VITE_UNLOCK_API_URL`).

## 3. Shopify: webhook subscription

Admin → **Settings → Notifications** → scroll to **Webhooks** → **Create webhook**:

- **Event:** `Order payment` (`orders/paid`) — fires once payment actually clears, not at
  checkout start. Do not use `orders/create`.
- **Format:** JSON.
- **URL:** `https://<your-cloud-run-url>/webhooks/shopify/orders-paid`
- **API version:** any current stable version (the payload fields this backend reads — `id`,
  `line_items[].id/sku/quantity` — have been stable for years).

Saving it shows a **signing secret once** — that's the value for `SHOPIFY_WEBHOOK_SECRET`.
If you deployed before creating the webhook, update it with:
```sh
gcloud run services update naze-family-code-backend \
  --update-secrets=SHOPIFY_WEBHOOK_SECRET=shopify-webhook-secret:latest
```
(assuming you stored it in Secret Manager under that name — see `docs/launch-runbook.md` Part 1
for the full secret-creation commands). This deploys a new revision; no code change needed.

## 4. Shopify: automated buyer email (Shopify Flow, not a template edit)

Why Flow and not customizing the order-confirmation email: Shopify's default confirmation
email can fire before this webhook's Admin API call finishes writing the code (it's triggered
by `orders/paid`, not by the metafield write) — editing that shared template risks sometimes
mailing a blank code, and it would mean editing a template products A-D's orders also render
through. Flow avoids both problems: it triggers off the metafield write itself, so it cannot
run before the code exists, and it is an entirely new, separate workflow — nothing shared with
A-D to break. (This part of the design is unrelated to which cloud runs the backend, and
didn't change with the migration.)

Admin → **Apps → Flow** → **Create workflow**:

- **Trigger:** "Order metafield updated" (or "Metafield updated" depending on your Flow
  version) → namespace `naze`, key `family_code`.
- **Action:** "Send custom email" (or "Send email" — naming varies by Flow version) →
  - To: `{{order.customer.email}}`
  - Subject: something like `ナゼホリ（仮）— ご購入ありがとうございます`
  - Body: include `{{order.metafields.naze.family_code}}` (this is the code the backend
    wrote — `backend/src/shopifyAdmin.ts#attachCodesToOrderMetafield`). If Flow's variable
    picker shows a different path for the same metafield, use whatever it resolves to; the
    metafield's `namespace`/`key` (`naze`/`family_code`) are the values that must match what
    the backend writes.
- If an order matched **more than one unit** (quantity > 1, or two different modules), the
  metafield value is a comma-separated list of all codes issued for that order (e.g.
  `NAZE-AB3D-9KTP, NAZE-QP7M-2XCV`) — the email body will show all of them as one string. A
  fancier per-code layout would need a custom app block instead of Flow; out of scope here.

This workflow only ever fires for orders where the `naze.family_code` metafield gets written —
which only happens for a matched line item (§0). Products A-D's orders never have that
metafield, so this workflow structurally never fires for them.

**Fallback if the metafield write failed** (`backend/src/shopifyAdmin.ts` logs this as a
best-effort failure, never blocking code issuance): the code still exists and is redeemable —
look it up in Firestore (console, or `gcloud firestore documents describe`, or the Firebase
console's Firestore data tab) under the `naze_kv` collection, document id `order:<order id>` —
and resend manually.

## 5. The app's redemption screen — built, but needs the backend's real URL

`/play/unlock` (`src/parent/unlock/`) is done: takes the buyer's typed code + a per-device id
already generated into `AppState.deviceId` (`src/engine/storage.ts`, non-PII), POSTs to the
backend's `/unlock`, and on success grants `${moduleId}:full` via `applyRedemption()`
(`src/engine/entitlements.ts`) — reusing `hasAccess()` unchanged. Lives under `src/parent`
(same gate-exempt zone as `src/lp`/`src/legal`) since it's an adult-only action, never
something a child operates.

**One thing this still needs from you:** it reads the backend's URL from
`VITE_UNLOCK_API_URL` at *build* time (a Vite env var, set wherever you build the static site
— see `docs/launch-runbook.md` Part 2). Until it's set, the page shows a "not live yet"
message and never calls `fetch` at all — that's deliberate, not a bug, so a not-yet-deployed
backend can't produce a confusing network-error message instead of an honest one.

## 6. Testing before going live

1. `npx vitest run tests/backend*.test.ts tests/worker*.test.ts tests/redeemCode.test.ts
   tests/entitlements.test.ts tests/UnlockPage.test.tsx` — 65+ tests total (isolation/HMAC/
   idempotency logic, the Firestore/in-memory store adapters, the Secret Manager loader, the
   Express↔Fetch adapter, and the client screen's not-configured/success/soft-cap-note/
   not-found states), all pure/mocked, no live credentials needed. Already green as of this
   commit — including a real end-to-end smoke test run against the compiled server via plain
   `node` + `curl`/raw HTTP requests (not just the automated suite) before this was called done.
2. Shopify Admin → the webhook's detail page → **Send test notification** — sends a sample
   payload (a *fake* order with placeholder SKUs, not `kodomo-ai-m1`) so you can confirm the
   backend responds `200` without erroring. It will NOT exercise the real code-issuance path
   (the sample SKU won't match the allowlist) — that only happens with a real or a manually
   crafted matching payload.
3. A real ¥4,980 test purchase (spec v0.5's own DoD, work-order-w1.md's Sprint DoD: "test
   purchase completes with card and PayPay") is the actual end-to-end proof: buy → webhook
   fires → Firestore has a new code → Flow email arrives with it → `/play/unlock` accepts it
   and grants access. Refund it after via the existing 30-day guarantee.
4. Confirm products A-D's own confirmation/shipping emails are byte-for-byte unchanged after
   all of the above — nothing in this integration should have touched their templates.

---

## Env vars / secrets reference

| Name | Where it's set | Purpose |
|---|---|---|
| `SHOPIFY_WEBHOOK_SECRET` | `gcloud run deploy --set-secrets` (backed by Secret Manager) | Verifies the webhook actually came from Shopify |
| `ADMIN_TOKEN` | `gcloud run deploy --set-secrets` | Bearer token guarding `POST /admin/issue` (founder codes) |
| `SHOPIFY_ADMIN_API_TOKEN` | `gcloud run deploy --set-secrets` | Lets the backend write the `naze.family_code` order metafield |
| `SHOPIFY_SHOP_DOMAIN` | `gcloud run deploy --set-env-vars` (not secret) | Which shop the Admin API calls target |
| `GOOGLE_CLOUD_PROJECT` | Set automatically by Cloud Run | Tells `backend/server/kvStore.ts` to use Firestore, not the in-memory dev fallback |
| `FIRESTORE_COLLECTION` | Optional, `gcloud run deploy --set-env-vars` | Overrides the default `naze_kv` collection name |
| `VITE_UNLOCK_API_URL` | Wherever the static site is built — NOT a backend secret | The deployed backend's base URL, read by `/play/unlock` at build time |

---

## Platform history

This integration originally targeted Cloudflare Workers + KV (its first implementation). The
founder later decided to move the backend and webhook deployment target to Google Cloud Run —
this document, `docs/launch-runbook.md`, and the code under `backend/` (renamed from `worker/`)
all reflect that change. What carried over unchanged: `backend/src/` was already written
against the Web-standard `Request`/`Response` API rather than any Cloudflare-specific module
convention, so the entire isolation/HMAC/idempotency/redemption logic, and every test proving
it, moved to the new platform with zero behavioral changes — only `backend/server/` (new) and
the Dockerfile are Cloud-Run-specific. A few test files (`tests/worker*.test.ts`) still carry
their original name; they test `backend/src/` code, the name just predates the rename and
wasn't worth the extra diff to change along with everything else.
