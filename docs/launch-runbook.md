# Launch runbook — deploy, connect, go live

Repo: `DynamicVision2026/kodomo-ai` · Branch: `claude/sprint-1-setup-ok4oym` · Store: `https://soul-id-2.myshopify.com/`

This is the single, ordered checklist from "code merged" to "a real family can log in, buy, and
play." Google Cloud project `kodomo-ai` (region `asia-northeast1`) already exists with two live
services — `kodomo-ai` (public frontend) and `kodomo-ai-backend` — so most of Part 1/Part 2 below
is now a description of what's already running plus how it stays current, not a from-scratch
bootstrap; Part 2B (`kodomo-ai-admin`) and the CI/CD pipeline are the newer pieces. Whoever has
Google Cloud / Shopify Admin / Anthropic / DeepSeek access follows whichever parts are still
outstanding, top to bottom, no further decisions needed except the one flagged Architect
decision (Part 2's own "CI/CD one-time setup").

**AD-16 §5 architecture — three Cloud Run services, one Firestore database, no Firebase
Hosting:**
- **Public frontend** — Cloud Run service `kodomo-ai` (`Dockerfile.frontend`) — the LP, `/play`,
  `/login`, `/account`, `/claim`, print deck/kit, legal pages. A plain static file server, no
  product code of its own. Never create a second service for this (e.g. `kodomo-ai-frontend`) —
  deploys always update this one existing service.
- **Public backend** — Cloud Run service `kodomo-ai-backend` (`Dockerfile`) — the Shopify
  webhooks, Family Account auth/session API, purchase-intent/claim API, `/units/{id}/open`.
  `--allow-unauthenticated`; its own HMAC/session checks are the real security boundary (see
  `backend/src/router.ts`).
- **`kodomo-ai-admin`** (`Dockerfile.admin`) — the staff dashboard (search/family/order+refund/
  queues/audit log) and its `/admin-api/*`. Deployed behind Google Identity-Aware Proxy, never
  `--allow-unauthenticated`; nothing here is reachable from the other two services' origins, and
  nothing admin-related ships in either of them.
- **Firestore (Native mode)** — the one production database, shared by the public backend and
  `kodomo-ai-admin`; families, sessions, orders, purchase intents, claims, the `staff/` allowlist,
  and the append-only audit log (`backend/src/schema.ts`).
- **Firebase** is used ONLY for Firestore rules/indexes deployment (`firebase.json` today has no
  `hosting` block at all) — Firebase *Hosting* is abandoned. Do not add one back.

Do the parts **in this order** — 2 and 2B depend on 1's output, 3 depends on 1 and 2, and 4 is
independent (do it whenever, including in parallel with 1-3).

```
1. Deploy the Cloud Run backend            ──┐
                                              ├──> 3. Shopify webhook + real order test
2. Deploy the public frontend to Cloud Run ──┘
                                              (needs 1's URL as a build arg, and 2 deployed to receive it)
                                              Both already live today; Part 2's own CI/CD
                                              pipeline is what keeps 2 current from here on —
                                              a normal push, once the one-time setup is done.

2B. Deploy kodomo-ai-admin (IAP) ── independent of 2, needs 1's Firestore project

4. Content pipeline keys ──> real Mission content (independent of 1-3)
```

---

## Part 1 — Deploy the public backend to Cloud Run

Backend source: `backend/src/` (platform-neutral — webhook/HMAC/session/entitlement logic,
`backend/src/router.ts` is the actual route table) + `backend/server/` (Express + Firestore +
Secret Manager, the Cloud-Run-specific glue). Builds via the repo-root `Dockerfile`.
`docs/task7-shopify-backend-runbook.md` documents the ORIGINAL (pre-AD-13) unlock-code design in
detail and is useful background on the Shopify-isolation mechanism (still true today: exact-SKU
matching, `backend/src/shopify.ts`), but its own concrete routes/curl examples describe a system
this repo no longer runs — this Part is the current, accurate one.

**Prerequisite:** a Google Cloud project with the Cloud Run, Artifact Registry, Firestore, and
Secret Manager APIs enabled, and the `gcloud` CLI authenticated (`gcloud auth login`,
`gcloud config set project <PROJECT_ID>`).

```sh
# 1. Create the Firestore database, once per project (Native mode — not Datastore mode; AD-13
#    §1/AD-16 confirm Firestore Native is the one production database, shared with kodomo-ai-admin).
gcloud firestore databases create --location=asia-northeast1
# Pick whatever region you'll also deploy Cloud Run into — same-region keeps latency low.

# 2. Create the three REQUIRED secrets (backend/server/buildEnv.ts's own REQUIRED_SECRET_NAMES —
#    the container refuses to start, and refuses a placeholder value, without all three).
echo -n "<a long random string YOU generate>" | \
  gcloud secrets create admin-token --data-file=-          # legacy CLI-only bearer surface, backend/src/handlers/admin.ts
echo -n "<a long random string YOU generate — never reused elsewhere>" | \
  gcloud secrets create auth-pepper --data-file=-           # HMACs every login code/session/purchase token
echo -n "<placeholder for now>" | \
  gcloud secrets create shopify-webhook-secret --data-file=-
# real value comes from Part 3 step 2 below — update it after with:
#   echo -n "<real value>" | gcloud secrets versions add shopify-webhook-secret --data-file=-

# 3. Optional secrets — only if/when you have them; the backend degrades honestly without them
#    (no Shopify Admin API calls, no email actually sent — see backend/server/buildEnv.ts's own
#    LoggingEmailSender fallback) rather than crashing.
echo -n "<a custom app Admin API token, scope: write_orders>" | \
  gcloud secrets create shopify-admin-api-token --data-file=-
echo -n "<Postmark/SES API key>" | gcloud secrets create email-api-key --data-file=-

# 4. Build and deploy directly from source — gcloud builds the Dockerfile in Cloud Build and
#    deploys the result, no separate docker build/push needed.
gcloud run deploy kodomo-ai-backend \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars=SHOPIFY_SHOP_DOMAIN=soul-id-2.myshopify.com,APP_ORIGIN=https://<your-public-frontend-url>,EMAIL_FROM=<verified-sender@yourdomain> \
  --set-secrets=ADMIN_TOKEN=admin-token:latest,AUTH_PEPPER=auth-pepper:latest,SHOPIFY_WEBHOOK_SECRET=shopify-webhook-secret:latest,SHOPIFY_ADMIN_API_TOKEN=shopify-admin-api-token:latest,EMAIL_API_KEY=email-api-key:latest
```

`--allow-unauthenticated` is required — Shopify's webhook and a family's browser both need to
reach this service without a Google-issued auth token. The service is still safe: every webhook
route checks Shopify's HMAC signature, every `/api/v1/*` route is session/CSRF-checked, and the
legacy `/admin/*` bearer routes check `ADMIN_TOKEN` (`backend/src/router.ts`,
`backend/src/handlers/admin.ts`). `APP_ORIGIN` matters for two separate reasons: it's the one
origin `/api/v1/*` answers CORS for at all (`backend/src/router.ts#corsHeaders` — unset means no
browser can use the API), and it's baked into every email link (`/login`, `/claim?token=...`),
so it must be set to the PUBLIC FRONTEND's own URL (Part 2), not this backend's own URL.

`gcloud run deploy` prints the service's URL — something like
`https://kodomo-ai-backend-<hash>-an.a.run.app`, or your own domain if you map one afterward
(`gcloud run domain-mappings create`). **Save this URL** — Part 2 needs it as
`VITE_FAMILY_API_URL`.

**Sanity check before moving on:**
```sh
curl https://<your-cloud-run-url>/healthz
# expect a bare 200 "ok"

curl -i -X POST https://<your-cloud-run-url>/api/v1/auth/request \
  -H 'content-type: application/json' -H 'origin: https://<your-public-frontend-url>' \
  -d '{"email":"smoke-test@example.com"}'
# expect 200 (AD-13 §5: always the same response, known or unknown email — "no enumeration").
# If EMAIL_API_KEY isn't set yet, the code is only LOGGED (Cloud Run console → Logs), never sent —
# that's the honest not-yet-configured fallback, not a bug.

curl -i -X POST https://<your-cloud-run-url>/api/v1/auth/request \
  -H 'content-type: application/json' -H 'origin: https://evil.example.com' \
  -d '{"email":"smoke-test@example.com"}'
# expect 403 — confirms the CORS/origin check is actually live against the real APP_ORIGIN value.
```

**If you'd rather build/push the image yourself** instead of `--source .` (e.g. to inspect it
first, or wire it into your own CI):
`docker build -t <region>-docker.pkg.dev/<project>/<repo>/kodomo-ai-backend .`,
`docker push` that tag, then `gcloud run deploy kodomo-ai-backend --image <that tag> ...` with
the same `--set-env-vars`/`--set-secrets` flags. The Dockerfile itself doesn't change either
way.

---

## Part 2 — Deploy the public frontend to Cloud Run

**Firebase Hosting is abandoned** (WO-22B: Firebase CLI auth was blocked on the original
deployment machine; the founder never revisited it once Cloud Run worked, and AD-16 §5 makes it
official — Firebase is used only for Firestore rules/indexes now, `firebase.json` carries no
`hosting` block at all). This is a **multi-page static site, not a client-side-routed SPA** —
serve it with a plain static file server, never a catch-all rewrite to `index.html` (that would
silently serve the landing page for `/play`, `/legal/privacy`, etc.). `Dockerfile.frontend`
already does this correctly (`serve`, no `-s`/`--single` flag) — see its own header comment.

**The EXISTING service name is `kodomo-ai`** (this repo's own frontend service, already live —
never `kodomo-ai-frontend`; nothing in this runbook or the CI/CD pipeline below ever creates a
second service).

### Normal path — CI/CD, no manual commands

Once the one-time setup below has been done, **a normal push to the production branch is the
entire deploy process** — `.github/workflows/ci.yml`'s own `deploy-frontend` job runs the full
gate/test suite, builds `Dockerfile.frontend`, pushes it to Artifact Registry, deploys it to
`kodomo-ai` with `--no-traffic`, smoke-tests the candidate revision against the exact routes
listed below, and only THEN shifts production traffic to it. A failed test/gate/build/smoke-test
never touches production — the previous revision keeps serving 100% of traffic the whole time,
and stays available afterward for an instant rollback (`gcloud run services update-traffic
kodomo-ai --region asia-northeast1 --to-revisions=<previous-revision>=100`). See "CI/CD one-time
setup" below for what the Founder does once to enable this.

### Manual path — first bootstrap, or emergency-only

Before the pipeline exists (or if GitHub Actions itself is down and something urgent needs
shipping), the equivalent manual command:

```sh
# VITE_FAMILY_API_URL (Part 1's URL) and VITE_SHOPIFY_PRODUCT_URL are BUILD ARGS, not container
# env vars — Vite inlines import.meta.env.* into the static bundle at build time
# (src/family/api.ts, src/lp/LandingPage.tsx). Neither is a secret (both end up in the public
# bundle regardless) — never store either as a GitHub Actions "secret"; VITE_FAMILY_API_URL is
# resolved live from kodomo-ai-backend's own Cloud Run URL by the CI/CD job below rather than
# hand-typed anywhere, precisely so it can't drift.
gcloud run deploy kodomo-ai \
  --source . \
  --dockerfile Dockerfile.frontend \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --build-env-vars=VITE_FAMILY_API_URL=https://<kodomo-ai-backend-url>,VITE_SHOPIFY_PRODUCT_URL=https://soul-id-2.myshopify.com/products/kodomo-ai-m1
```

`--dockerfile Dockerfile.frontend` is REQUIRED — this repo has three Dockerfiles now
(`Dockerfile` for the backend, `Dockerfile.frontend`, `Dockerfile.admin`), and `gcloud run
deploy --source .` only auto-detects the one literally named `Dockerfile` otherwise (the backend
image — wrong, and the proximate cause of a real production build failure: "TS5083: Cannot read
file '/app/tsconfig.json'", from Cloud Build using `.dockerignore`'s old backend-only exclude
list against a frontend build it never named explicitly; both are fixed now — see `.dockerignore`
and `Dockerfile.frontend`'s own header comments).

Or build/push the image yourself: `docker build -f Dockerfile.frontend -t
asia-northeast1-docker.pkg.dev/kodomo-ai/kodomo-ai/kodomo-ai --build-arg
VITE_FAMILY_API_URL=... --build-arg VITE_SHOPIFY_PRODUCT_URL=... .`, `docker push`, then `gcloud
run deploy kodomo-ai --image <that tag> --region asia-northeast1 --allow-unauthenticated`.

If this is the very first deploy (the `kodomo-ai` service doesn't exist yet at all): **save the
printed URL** and go back to Part 1 to redeploy the backend with `APP_ORIGIN` set to it (a
circular dependency between the two services is normal here). The CI/CD pipeline never needs
this step again once both services exist, since it resolves `VITE_FAMILY_API_URL` live on every
run.

### Sanity check / smoke test

Every real route `vite.config.ts`'s own multi-page `input` map builds — the CI/CD pipeline
checks these seven automatically against the candidate revision before promoting traffic; the
same list to check by hand after a manual deploy:
- `https://<your-site-url>/` — the LP loads, headline + trust banner visible.
- `https://<your-site-url>/play/` — Mission 1-1 is playable as a guest, no login prompt yet
  (client-side `hasAccess` still passes a free mission before any server call — AD-16 §6's real
  gate only engages once `VITE_FAMILY_API_URL` is actually configured, which it now is).
- `https://<your-site-url>/login/` — request a code, confirm the email arrives (needs Part 1's
  `EMAIL_API_KEY` configured) or check Cloud Run logs for the logged code otherwise, log in.
- `https://<your-site-url>/account/` — while logged in, shows the device list and (AD-16 §1) a
  purchase button.
- `https://<your-site-url>/claim/` — with no `?token=` query param, shows the honest "invalid
  link" message rather than an error page (AD-16 §2).
- `https://<your-site-url>/legal/privacy/` and `/legal/tokushoho/` both load.
- An unrelated path (e.g. `/nonsense`) 404s — confirms there's no accidental SPA catch-all
  silently swallowing bad links.

**Before this URL goes anywhere public:** `gate:no-llm` (already green in CI) only checks the
build output has no LLM/API hostnames baked in — it does not check for the two content
caveats already flagged in `docs/work-order-w1.md`: no native-speaker review stamp on Mission
1-1 or the LP copy yet, and the LP's §1A alignment claims + legal pages are still founder-review
drafts. Don't route real traffic here until those are cleared. The LP's own "no account
required" framing (`src/lp/LandingPage.tsx`'s trust banner) is also now stale against the real
AD-15/16 account-first trial model — a parent has to log in before Mission 1-1's own trial
clock can start server-side — and needs a founder-approved copy pass before launch; this runbook
does not silently rewrite marketing copy.

### CI/CD one-time setup (do this once, before the first automated deploy)

`.github/workflows/ci.yml`'s `deploy-frontend` job authenticates to GCP via Workload Identity
Federation — no long-lived JSON key ever stored in GitHub. Run `scripts/bootstrap-gcp-ci.sh`
once (from a machine already `gcloud auth login`'d against the `kodomo-ai` project — the
Founder's own Mac is fine for this ONE-TIME step; it is never needed again afterward, that's the
whole point) to create the deploy service account, the Workload Identity Pool/Provider scoped to
exactly this repo, and the Artifact Registry Docker repository. It prints two values; add them
as GitHub repository secrets (repo Settings → Secrets and variables → Actions):
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

Optionally also add the (non-secret, public) repository **variable** `VITE_SHOPIFY_PRODUCT_URL`
once the Shopify listing is live — the pipeline runs without it, the LP just keeps its existing
honest "pending" fallback until then.

**ARCHITECT DECISION NEEDED — production branch/trigger:** this repository has no `main` or
other durable release branch. `.github/workflows/ci.yml`'s `deploy-frontend` job currently
triggers on push to `claude/sprint-1-setup-ok4oym` (the branch presumed to be driving today's
live `kodomo-ai`/`kodomo-ai-backend` revisions, per the work order that requested this pipeline)
— a working default, not an invented one, but also not a durable naming convention: a future
session working from a differently-named branch would silently stop triggering production
deploys, and nothing prevents a second branch from also claiming to be "production" later. The
recommended fix is to create a real `main` branch from the current production lineage, retarget
`ci.yml`'s `PRODUCTION_BRANCH` env var to it, and treat `claude/*` branches as ephemeral
work-in-progress branches going forward, same as any other feature branch — but this is a
release-process decision for the Architect/Founder to confirm, not something to silently change
here.

---

## Part 2B — Deploy `kodomo-ai-admin` to Cloud Run, behind Identity-Aware Proxy

AD-16 §8's staff dashboard — search / family / order+refund / queues / audit log. A THIRD,
separate Cloud Run service; never merge this into Part 1 or Part 2's own deploy.

```sh
# 1. Deploy the service itself — never --allow-unauthenticated; IAP is what protects it.
gcloud run deploy kodomo-ai-admin \
  --source . \
  --dockerfile Dockerfile.admin \
  --region asia-northeast1 \
  --no-allow-unauthenticated \
  --set-env-vars=IAP_AUDIENCE=/projects/<PROJECT_NUMBER>/apps/kodomo-ai-admin \
  --set-secrets=ADMIN_TOKEN=admin-token:latest,AUTH_PEPPER=auth-pepper:latest,SHOPIFY_WEBHOOK_SECRET=shopify-webhook-secret:latest,SHOPIFY_ADMIN_API_TOKEN=shopify-admin-api-token:latest,EMAIL_API_KEY=email-api-key:latest
# (Same required secrets as Part 1 — backend/server/adminIndex.ts loads the same REQUIRED_SECRET_NAMES
# via the same buildEnv(); ADMIN_TOKEN/SHOPIFY_WEBHOOK_SECRET are unused by this service's own
# routes but still required to start, since buildEnv() doesn't distinguish which service calls it.)

# 2. Enable Identity-Aware Proxy for this Cloud Run service (console: Security → Identity-Aware
#    Proxy → find kodomo-ai-admin → toggle on) — this is what actually protects it; the service
#    itself trusts the x-goog-iap-jwt-assertion header it only ever sees once IAP is in front of
#    it (backend/src/iap.ts). Grant "IAP-secured Web App User" (roles/iap.httpsResourceAccessor)
#    to each staff member's own Google account — IAP is WHO, this grant is "may reach the app at
#    all"; the staff/ Firestore allowlist below is "may this dashboard actually do anything."
#    The exact IAP_AUDIENCE value (/projects/<NUMBER>/apps/<SERVICE>, note PROJECT NUMBER not
#    project id) is shown on that same IAP settings page once enabled — set it as an env var
#    (redeploy step 1 with the real value once you have it).

# 3. Seed the staff/ allowlist — one Firestore doc per staff member, role 'viewer' or 'operator'.
#    No UI for this yet (AD-16 §8 doesn't build one) — gcloud/console directly:
gcloud firestore documents create staff/you@yourdomain.com \
  --fields role=operator
# (or add the doc via the Firestore console — collection "staff", document id is the exact
# lower-cased email IAP will report, field "role" is the string "viewer" or "operator")
```

**Sanity check:**
- Visiting the service's own URL while NOT logged into the granted Google account redirects to
  Google sign-in (IAP's own behavior) — never shows any dashboard content.
- Logging in as a granted-but-unseeded account (no `staff/` doc yet) reaches the dashboard shell
  but shows "アクセス権を確認できませんでした" — confirms the allowlist check is live, not just
  IAP alone.
- Once seeded, `検索`/`キュー`/`監査ログ` all load; a `viewer` role sees masked family emails and
  no mutating buttons anywhere; an `operator` role sees the real thing and every write requires
  typing a reason first.

---

## Part 3 — Shopify: webhooks, purchase-intent variant, real order test

AD-14/AD-16 replaced the original unlock-code design's Shopify Flow / metafield / custom-email
approach entirely — the backend now sends its own emails directly (`backend/src/email.ts`) and
binds a purchase to a family via a token, an existing account's email, or a claim link
(`backend/src/handlers/webhook.ts`, AD-16 §1/§2). `docs/task7-shopify-backend-runbook.md`'s own
Flow/metafield steps no longer apply — do not follow them.

1. **Product listing.** Create (or confirm) the product with **SKU `kodomo-ai-m1`** — must
   match `backend/src/shopify.ts`'s `SKU_TO_MODULE_IDS` key exactly, this is the entire
   isolation mechanism (exact SKU only, never a title/prefix match — AD-14). ¥4,980, household
   licence (profiles capped at 3 — AD-15). Products A-D (`KD-*`, `SOULID-*`) need zero changes;
   the webhook writes nothing at all for an order that doesn't include `kodomo-ai-m1`. The
   refund-window wording (AD-16 §7: 10-day voluntary window, contingent on whether paid content
   was actually opened) is still pending final legal copy — don't publish specific refund terms
   on the product page yet.
2. **Record the variant ID** — `backend/server/buildEnv.ts` reads `SHOPIFY_VARIANT_IDS` as a
   JSON map (`{"m1":"<numeric variant id>"}`), needed for the purchase-intent cart permalink
   (AD-16 §1, `POST /api/v1/purchase-intents`) to point at a real product. Set it on the
   backend service:
   ```sh
   gcloud run services update kodomo-ai-backend --region asia-northeast1 \
     --update-env-vars=SHOPIFY_VARIANT_IDS='{"m1":"<the real numeric variant id>"}'
   ```
   Until this is set, the "purchase" button on `/account` answers `not_configured` rather than a
   broken link — a direct storefront purchase (no purchase-intent token) still works either way.
3. **Orders webhook.** Admin → **Settings → Notifications** → **Webhooks** → **Create webhook**:
   - Event: **Order payment** (`orders/paid`) — not `orders/create`.
   - Format: JSON.
   - URL: `https://<your-backend-cloud-run-url>/webhooks/shopify/orders-paid` (Part 1).
   - Save — Shopify shows a **signing secret once**. That's the real value for
     `SHOPIFY_WEBHOOK_SECRET`:
     ```sh
     echo -n "<the real signing secret>" | \
       gcloud secrets versions add shopify-webhook-secret --data-file=-
     gcloud run services update kodomo-ai-backend --region asia-northeast1   # picks up the new version
     ```
4. **Refunds webhook.** Same Notifications page, a second webhook:
   - Event: **Refund create** (`refunds/create`).
   - URL: `https://<your-backend-cloud-run-url>/webhooks/shopify/refunds-create`.
   - Same signing secret as step 3 (Shopify signs every webhook on the store with the one
     secret shown when notifications were first configured — confirm this in the Shopify docs
     for your API version before assuming it, rather than guessing).
5. **Test each webhook without a real order.** Shopify Admin → each webhook's detail page →
   **Send test notification**. This uses placeholder SKUs (not `kodomo-ai-m1`), so it proves
   the backend responds `200` and writes nothing — it will NOT bind or grant anything (the SKU
   won't match the allowlist, which is correct, not a bug).
6. **Test with a real order** (the actual proof): have a parent log in on the public frontend
   FIRST (Part 2's `/login`), then buy the product for real using the purchase-intent link from
   their own `/account` page → confirm the webhook fired (Cloud Run console → `kodomo-ai-backend`
   → **Logs**, or `gcloud run services logs read kodomo-ai-backend`) → confirm the "モジュール1が
   使えるようになりました" email arrived and the module unlocked on `/account`/`/play`. Then, as a
   SECOND real order, buy directly from the storefront with NO purchase-intent link and an email
   that has never logged in before → confirm it lands in `awaiting_claim` (visible in
   `kodomo-ai-admin`'s Queues page, Part 2B) and the "ご購入の受け取り" claim email arrives with a
   working `/claim?token=...` link. Issue a real refund on one of the two test orders afterward →
   confirm the entitlement is revoked (account/progress must remain untouched — AD-16 §7).
7. **Confirm isolation held.** Check products A-D's own confirmation/shipping emails are
   byte-for-byte unchanged, and that nothing about their orders looks different — nothing in
   this integration ever calls the Admin API for a non-`kodomo-ai-m1` order, but this is the
   step that actually proves it against your real store, not just the tests that prove it
   against fakes.

---

## Part 4 — Content pipeline: inject API keys, run Task 1

**Independent of Parts 1-3** — do this whenever, in parallel if you like. This produces real
Mission content (replacing/joining the one hand-authored `bread` topic); it has no dependency
on the backend or Shopify. It also does not run inside the Cloud Run service — the pipeline is
a separate CLI tool (`pipeline/`), never bundled into the backend's Docker image.

### 4.1 — Keys

Set these as actual environment variables in whatever machine/session runs the pipeline (a
`.env` file only works if the tool loading it is actually reading from this same filesystem —
if you're doing this from a fresh Claude Code session or your own terminal, export them there
directly):

| Variable | Powers | Get it from |
|---|---|---|
| `ANTHROPIC_API_KEY` | `01_research.ts` (Claude + web search), `03_render.ts` (Claude render) | console.anthropic.com |
| `DEEPSEEK_API_KEY` | `02_crosscheck.ts`, `05_entail.ts`, `tag_audit.ts` (default second-opinion provider as of this sprint) | platform.deepseek.com |

`DEEPSEEK_API_KEY` is the default now (`pipeline/lib/secondOpinion.ts`); set
`CROSSCHECK_PROVIDER=openai` and `OPENAI_API_KEY` instead if you'd rather use GPT-4o for that
role — both are supported, nothing else in the pipeline changes either way.

If you'd rather run the pipeline from a GCP-hosted environment (a Cloud Build job, a Cloud Run
Job, a Compute Engine box) instead of a laptop, you can store these two keys in Secret Manager
the same way Part 1 stores the backend's secrets and load them into that environment's own
process — `backend/server/secrets.ts`'s `loadMissingSecrets()` helper is generic (it takes a
list of secret names) and would work for this too, though nothing currently calls it from the
pipeline scripts; that's a small addition if you want it, not something this pass built.

### 4.2 — Run the pipeline, one topic at a time

```sh
# 1. Research: drafts 4-6 atomic claims with sources, all status: pending. Never auto-approves.
npx tsx pipeline/01_research.ts <topic-slug> "<question in Japanese>"
# writes src/modules/m1/topics/<topic-slug>/facts.yaml

# 2. Cross-check: a DIFFERENT model (DeepSeek by default) re-verifies each claim against its
#    source, writes a verdict. Never changes status — flags only.
npx tsx pipeline/02_crosscheck.ts <topic-slug>
```

### 4.3 — Gate 1: approve the claims (manual — no review tool exists yet)

This was flagged as a TODO in `docs/work-order-w1.md` Task 1.3 ("a one-screen CLI or markdown
checklist") and was never built. Right now, Gate 1 is: open
`src/modules/m1/topics/<topic-slug>/facts.yaml` in a text editor, read each claim + its
`crosscheck.verdict`/`note`, and for every claim you approve, hand-edit:

```yaml
status: approved
approvedBy: "<your name>"
approvedAt: "2026-01-15"   # ISO date
```

`03_render.ts` refuses to run (`assertAllApproved`) until every claim in the file is
`approved` — there is no partial-render path, by design.

### 4.4 — Render, lint, entail, tag-audit

```sh
# 3. Render: approved claims -> stage mission JSON. Deterministic shape, model fills text only.
npx tsx pipeline/03_render.ts <topic-slug> --stage 2
# writes src/modules/m1/topics/<topic-slug>/s2.json — refuses to overwrite an existing file.
# (--stage 1 / --stage 3 also work now, Sprint 1-A — Stage 1's own claim count is still a
# placeholder pending its own design spike, see docs/work-order-w2-stage-expansion.md §4.)

# 4. Deterministic lint — already run inside 03_render, but confirm explicitly:
npm run lint:content

# 5. Entailment check: does each line say ONLY what its claim ids support? Flags, never edits.
npx tsx pipeline/05_entail.ts <topic-slug> --stage 2
# exits non-zero ONLY on a "contradicts" verdict — review src/modules/m1/topics/<topic-slug>/entail-report.json

# 6. Tag audit: a second model blind-classifies every follow-up card, flags a mismatch.
npx tsx pipeline/tag_audit.ts <topic-slug> --stage 2
# review src/modules/m1/topics/<topic-slug>/tag-audit-report.json
```

### 4.5 — Gate 2: native-speaker review (manual — also no tooling yet)

Have your native-speaker reviewer read the rendered `sN.json` against the entailment/tag-audit
reports. Once they sign off, add the review stamp directly to that JSON file (matches
`Mission['review']` in `src/engine/types.ts`):

```json
"review": { "by": "<reviewer name>", "date": "2026-01-16" }
```

`gate:claims` only *requires* this stamp when run with `RELEASE=1` (`npm run gate:claims` with
`RELEASE=1` set) — that's the flag that distinguishes "still drafting" from "ready to ship."

### 4.6 — Repeat, then re-deploy

Each new topic/mission needs `main.tsx`'s and/or `module.json`'s `missionOrder` updated to
include it (see `src/shell/missionLibrary.ts#pickNextMission` — Sprint 1-A already made mission
selection stage-generic, so wiring in a second real mission is a content change, not a code
change). Once you have real content ready, commit and push it to the production branch — Part 2's
own CI/CD pipeline builds and deploys it automatically; no manual `gcloud run deploy` needed once
that pipeline exists (Part 2's own manual command is the fallback for before it does).

---

## Final go-live checklist

Pulled from `docs/work-order-w1.md`'s own Sprint DoD — repeated here so it's in the same place
as the deploy steps:

- [ ] Mission 1-1 end to end on iPad Safari, Chrome (Windows/Chromebook), and phone — including
      a private-mode/storage-blocked pass.
- [ ] `RELEASE=1 npm run gate:claims` green (real approved claims + native-review stamps, not
      just the structural gate).
- [ ] Native-review stamp on every shipped mission AND all LP copy (§1A alignment claims
      especially — currently marked "draft, pending native and legal check").
- [ ] Founder's own legal sign-off on `/legal/tokushoho` and `/legal/privacy` (real company
      data is already in, per `src/legal/company.ts` — the review itself hasn't happened).
- [ ] A real ¥4,980 test purchase completes with both card and PayPay, and the module unlocks
      via the purchase-intent path AND the claim-email path (Part 3, step 6 above).
- [ ] Products A-D's own order flow confirmed untouched (Part 3, step 7 above).
- [ ] `docs/spec-v0.5.md` §1A's four "Allowed" alignment sentences get real, stable MEXT source
      URLs (currently literal `#` placeholders in `src/lp/LandingPage.tsx` — this session
      would not guess a specific government URL to cite on a trust-sensitive section).
- [ ] AD-16 §7's refund policy (10-day voluntary window, contingent on paid-content use) gets its
      final server-side wording and Japanese legal copy before any real refund request is
      recorded through `kodomo-ai-admin` — the data model is ready (`OrderDoc.refund`); the
      policy text a family actually reads is not.
- [ ] The LP's "no account required" trust-banner framing is reconciled with the real AD-15/16
      account-first trial model (a parent must log in before Mission 1-1's trial clock can start)
      — founder/legal copy decision, not something this runbook or its code changes silently.

---

## Platform history

Parts 1 and 3 originally targeted Cloudflare Workers + KV; the founder later moved the backend
and webhook deployment target to Google Cloud Run (`backend/` was `worker/` before that — see
`docs/task7-shopify-backend-runbook.md`'s own "Platform history" note for what did and didn't
change in the code itself). Part 2 first documented Cloudflare Pages as a low-effort option,
then Firebase Hosting for one-console consistency, then (WO-22B, once Firebase CLI auth turned
out to be blocked on the deployment machine) Cloud Run — the same static-`serve` packaging this
runbook's own Part 2 now documents, unchanged since.

Separately, AD-13 replaced the entire original product model this document once described: a
single anonymous "redeem a unlock code at `/play/unlock`" flow, issued by Shopify Flow emailing
a metafield-stored code, redeemed against a KV/Firestore code store with a soft per-device cap.
AD-13 through AD-16 replaced all of it with Family Accounts (email OTP login, Firestore-backed
family/profile/session/entitlement records), server-authoritative purchase binding (purchase
intents, claim links — AD-16 §1/§2), and a separate IAP-protected `kodomo-ai-admin` staff
dashboard (AD-16 §8, Part 2B above) — this Part 1/2/2B/3 rewrite reflects that; anything else in
this repo (`docs/task7-shopify-backend-runbook.md` and `docs/work-order-w1.md` in particular)
that still describes the unlock-code flow is describing a system this repo no longer runs.
