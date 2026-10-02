# ナゼホリ brand email — reference implementation

**Written for:** Task 0 of `brand-dispatcher-builder-ticket.md` ("document the ナゼホリ sender...
do not build a second pattern next to it"). Answers the spec's eight questions against the actual
code, with exact citations. No dispatcher code has been written yet — see the open findings at the
bottom, which the ticket itself asks to resolve before Tasks 1-3 proceed.

---

## 1. What triggers the send?

The `orders/paid` Shopify webhook, handled end-to-end in one request —email send included — by
`handleShopifyOrderWebhook`. There is no separate app-internal event or scheduled job; the send
happens synchronously inside the webhook handler, after the Firestore transaction that grants
entitlement commits (`backend/src/handlers/webhook.ts:227-236`).

`refunds/create` (`handleShopifyRefundWebhook`, same file, lines 250-302) never sends an email —
it only revokes entitlement and updates the order's refund state.

## 2. Where does the code live?

| Concern | File | Function |
|---|---|---|
| Webhook entry point | `backend/src/handlers/webhook.ts` | `handleShopifyOrderWebhook`, `handleShopifyRefundWebhook` |
| Product isolation (SKU, not vendor) | `backend/src/shopify.ts` | `matchLineItems`, `SKU_TO_MODULE_IDS` |
| HMAC verification | `backend/src/shopify.ts` | `verifyShopifyWebhook` |
| Email templates (plain TS, no engine) | `backend/src/email.ts` | `moduleActivatedEmail`, `claimYourPurchaseEmail`, `loginCodeEmail`, `deviceEvictedEmail`, `emailChangedEmail` |
| Consent gate (every send goes through this) | `backend/src/emailGate.ts` | `sendEmailWithConsent` |
| Real HTTP client | `backend/server/postmarkEmail.ts` | `PostmarkEmailSender` |
| Sender wiring (env -> client) | `backend/server/buildEnv.ts` | lines 25-39 |
| Manual resend (the only retry path) | `backend/src/adminRouter.ts` | `resend-welcome` (182), `resend-claim` (302) |

## 3. Which provider, which account?

**Postmark**, transactional stream, tracking off (`TrackOpens:false`, `TrackLinks:'None'` —
`backend/server/postmarkEmail.ts:36-37`). Account is whatever `EMAIL_API_KEY` resolves to in
Secret Manager (`gcloud secrets create email-api-key`, `docs/launch-runbook.md:92`).

When `EMAIL_API_KEY`/`EMAIL_FROM` are unset, `buildEnv.ts` falls back to `LoggingEmailSender`,
which only logs — no send attempted, no error (`backend/src/email.ts:32-36`,
`backend/server/buildEnv.ts:39`). Every test and local dev without those two env vars uses
`FakeEmailSender` instead, which just records messages in memory (`backend/src/email.ts:25-30`).

## 4. What is the From header?

Exactly `"ナゼホリ" <no-reply@domo-ai.com>`, reply-to `info@domo-ai.com` — set as deploy-time env
vars in `.github/workflows/ci.yml` (lines 116-118, 276-278, confirmed identical in both the
staging and production deploy jobs):
```
EMAIL_FROM: no-reply@domo-ai.com
EMAIL_FROM_NAME: ナゼホリ
EMAIL_REPLY_TO: info@domo-ai.com
```
`PostmarkEmailSender` builds the actual header as `"${fromName}" <${from}>` when `fromName` is set
(`backend/server/postmarkEmail.ts:29`). **Note:** `docs/launch-runbook.md:100`'s own manual
`gcloud run deploy` example only sets a bare `EMAIL_FROM=<verified-sender@yourdomain>`, with no
`EMAIL_FROM_NAME`/`EMAIL_REPLY_TO` — that line is stale/illustrative only; the real CI deploy
workflow is the source of truth and does set all three.

## 5. Which DNS records authenticate it?

Already in place for `domo-ai.com`, per `docs/launch-runbook.md:434-440`: existing MX, DKIM,
Return-Path (CNAME under `pm-bounces.` or similar) and DMARC (`_dmarc.`) records, explicitly
called out as **must-not-touch** when the unrelated Part 2C domain-mapping DNS work happens
("Postmark's sending domain for `no-reply@domo-ai.com` depends on those staying exactly as they
are"). I have not independently verified these resolve (`dig`/Gmail "Show original") — that's
acceptance test row 10/9 territory, not something I can run from here.

## 6. What payload does the template receive?

No shared `BrandLetterPayload` type — each template function takes its own positional args, built
directly as subject/text/html string literals (see `backend/src/email.ts`):

| Function | Params | Sent to |
|---|---|---|
| `moduleActivatedEmail` | `to, loginUrl, beginnerLaunch: boolean` | the **family account** email (resolved via `familyId`, never the raw purchaser email directly — see AD-16 note in the file) |
| `claimYourPurchaseEmail` | `to, orderName, claimUrl, beginnerLaunch: boolean` | the **purchaser** email, when no family could be auto-bound |
| `loginCodeEmail` | `to, code, appBaseUrl` | login flow, not purchase-triggered |

`EmailMessage` itself (the one truly shared type, `backend/src/email.ts:8-17`): `{ to: string;
subject: string; text: string; html?: string }`. `html` is additive — every sender must still
carry a true plain-text `text` body, never HTML-only.

## 7. How are failures handled?

**No automated retry, no dead-letter queue, no automated alerting.** `sendEmailWithConsent`
(`backend/src/emailGate.ts:62-82`) catches a thrown Postmark error and returns the string
`'send_failed'` instead of letting it propagate — this exists specifically so a real send failure
can't crash the webhook response after the entitlement write already committed (see that file's
own "Item 11" comment, lines 38-49). The only consequence of `'send_failed'` is one
`console.error` line and a return value. **The only recovery mechanism is a human**: admin
dashboard buttons `resend-welcome` and `resend-claim` (`backend/src/adminRouter.ts:182,302`),
triggered manually by staff.

## 8. How is replay handled?

**Not by `X-Shopify-Webhook-Id`.** The real idempotency key is the **Shopify order id** itself,
via Firestore document existence: `handleShopifyOrderWebhook` reads `orderPath(orderId)` first
(`backend/src/handlers/webhook.ts:94`); if that document already exists, the handler returns
immediately and **never re-sends an email, regardless of `webhookId`** (lines 95-104, with the
comment "A replay never re-sends an email"). `webhookIds: string[]` on `OrderDoc` is appended for
audit/tracking only (line 97) — it is not the dedup gate.

---

## Findings that affect Tasks 1-3 — please confirm before I write dispatcher code

Per the ticket's own instruction ("I would rather adjust the spec than have you work around it"),
flagging these now rather than silently working around them:

1. **"Fix failure handling first" applies.** Per question 7, there is no retry/backoff/DLQ/alert
   today — only a manual admin resend. The ticket's Task 4 asks for exactly that
   (retry+backoff+DLQ+alert) for the *new* dispatcher. Should this also be retrofitted onto
   ナゼホリ's existing send path, or is Task 4's design meant to apply only to the new code, leaving
   ナゼホリ's manual-resend-only pattern as an accepted, separate gap?

2. **No templating engine exists to "convert to."** Task 3 step 1 says "Convert the Handlebars
   syntax to whatever engine ナゼホリ already uses." ナゼホリ uses no engine at all — hand-written
   TypeScript functions returning string literals (table above). The Densha template will need to
   become the same kind of function, not a port to some library; flagging so nobody goes looking
   for a Handlebars/Mustache dependency that was never there.

3. **Isolation is SKU, not vendor — two allow-lists must now stay in sync.** ナゼホリ's own
   existing entitlement/isolation boundary is `SKU_TO_MODULE_IDS` (`backend/src/shopify.ts:15-17`),
   not `line_items[].vendor`. The new dispatcher's entire design keys on `vendor`
   (`BRAND_ROUTES["ナゼホリ"]`). These are two independently-maintained lists that must agree on
   "which line items are ナゼホリ's" — a new ナゼホリ SKU added to Shopify without the matching
   vendor string (or vice versa) would silently desync entitlement from email routing. Worth a
   test that asserts the two can't drift, once both exist in one place.

4. **Consent gating has no equivalent in the new spec.** Every ナゼホリ send — including the
   purchase-triggered ones — goes through `sendEmailWithConsent`, which requires **verified
   consent** tied to a family record (`backend/src/emailGate.ts`), a legal/consent requirement
   specific to this being a children's service. The new multi-brand spec and the Densha template
   have no consent concept at all. Confirming this is intentional: 漢字でんしゃ's and 魂の銘's
   transactional purchase emails are **not** meant to be gated behind a family consent record the
   way ナゼホリ's are, since neither of those brands has that consent system. (If they should be,
   that's new work the spec doesn't currently describe.)

5. **"One endpoint, all brands" does not exist today, and building it raises a Shopify Admin
   question.** Both existing webhook handlers — this one and Dynamic-Densha's
   `src/routes/api/webhooks/shopify.ts` — already filter to their own brand's line items and
   silently ignore everything else (`matchLineItems` returns `[]` for a non-NazeHori SKU here;
   Dynamic-Densha's handler returns early whenever `kd_token` is absent). Neither can see another
   brand's line items in a mixed order today. A dispatcher that reads `vendor` across the WHOLE
   order (needed for acceptance row 5, "two letters, each from its own domain, each listing only
   its own items") needs a webhook subscription that receives the *entire* order body — which
   means either a **third** Shopify webhook subscription (new URL, registered in Shopify Admin
   against `orders/paid`/`refunds/create`/`orders/cancelled`), separate from the two
   entitlement-granting ones already registered, or retrofitting the new dispatch logic into one
   of the two existing handlers without touching their entitlement logic. The ticket's "Admin side
   is done" note (vendors, notification branding, sender) doesn't mention webhook subscriptions —
   worth confirming a new one is registered, and where it should point, before Task 2 is written.

6. **Where should the new dispatcher live?** Task 3 step 1 says to drop
   `densha-welcome-email.html` "into the repo beside the ナゼホリ template" — the ナゼホリ templates
   live in this repo (`kodomo-ai`, a Cloudflare-Workers-style backend over Firestore), not in
   Dynamic-Densha (a TanStack Start app over Postgres). That reads as "build the new dispatcher
   here, in kodomo-ai" rather than in Dynamic-Densha. Confirming that's the intended home before
   I start Task 1, since `BRAND_ROUTES`/the dispatcher/the DLQ all need one authoritative repo.
