# Launch runbook — deploy, connect, go live

Repo: `DynamicVision2026/kodomo-ai` · Branch: `claude/sprint-1-setup-ok4oym` · Store: `https://soul-id-2.myshopify.com/`

This is the single, ordered checklist from "code merged" to "a real family can buy, get a
code, and play." Every step below needs an account or credential this session does not have —
Google Cloud, Shopify Admin, Anthropic, DeepSeek. Nothing here has been run live; this is
written so whoever has that access can follow it top to bottom with no further decisions to
make.

**Architecture, standardized on one console:** Firebase Hosting (frontend — the LP, `/play`
app, print deck, legal pages) + Cloud Run (backend — the Shopify webhook, code issuance,
redemption API) + Firestore (persistent family-code store) + Secret Manager (backend secrets),
all in the same Google Cloud/Firebase project.

Do the four parts **in this order** — 2 depends on 1's output, 3 depends on 1 and 2, and 4 is
independent (do it whenever, including in parallel with 1-3).

```
1. Deploy the Cloud Run backend         ──┐
                                           ├──> 3. Shopify webhook + Flow + test order
2. Deploy to Firebase Hosting  ───────────┘
                                           (needs 1's URL as an env var, and 2 deployed to receive it)

4. Content pipeline keys ──> real Mission content (independent of 1-3)
```

---

## Part 1 — Deploy the backend to Cloud Run

Full detail and the *why* behind each design choice: `docs/task7-shopify-backend-runbook.md`.
This section is the condensed, ordered command sequence. Backend source: `backend/src/` (the
platform-neutral logic — webhook/HMAC/isolation/redemption, unchanged from its original
design) + `backend/server/` (Express + Firestore + Secret Manager, the Cloud-Run-specific
glue). Builds via the repo-root `Dockerfile`.

**Prerequisite:** a Google Cloud project with the Cloud Run, Artifact Registry, Firestore, and
(if you want the optional runtime-fetch path in `backend/server/secrets.ts`) Secret Manager
APIs enabled, and the `gcloud` CLI authenticated (`gcloud auth login`,
`gcloud config set project <PROJECT_ID>`).

```sh
# 1. Create the Firestore database, once per project (Native mode — not Datastore mode).
gcloud firestore databases create --location=asia-northeast1
# Pick whatever region you'll also deploy Cloud Run into — same-region keeps latency low.

# 2. Create the three secrets in Secret Manager (values, not names, are what's private here).
echo -n "<a long random string YOU generate>" | \
  gcloud secrets create admin-token --data-file=-
echo -n "<placeholder for now>" | \
  gcloud secrets create shopify-webhook-secret --data-file=-
# real value comes from Part 3 step 2 below — update it after with:
#   echo -n "<real value>" | gcloud secrets versions add shopify-webhook-secret --data-file=-
echo -n "<a custom app Admin API token, scope: write_orders>" | \
  gcloud secrets create shopify-admin-api-token --data-file=-

# 3. Build and deploy directly from source — gcloud builds the Dockerfile in Cloud Build and
#    deploys the result, no separate docker build/push needed.
gcloud run deploy naze-family-code-backend \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars=SHOPIFY_SHOP_DOMAIN=soul-id-2.myshopify.com \
  --set-secrets=ADMIN_TOKEN=admin-token:latest,SHOPIFY_WEBHOOK_SECRET=shopify-webhook-secret:latest,SHOPIFY_ADMIN_API_TOKEN=shopify-admin-api-token:latest
```

`--allow-unauthenticated` is required — Shopify's webhook and a buyer's browser both need to
reach this service without a Google-issued auth token. The service is still safe: the webhook
route checks Shopify's HMAC signature, and `/admin/issue` checks `ADMIN_TOKEN` — see
`docs/task7-shopify-backend-runbook.md` section 0 for the actual security model.

`gcloud run deploy` prints the service's URL — something like
`https://naze-family-code-backend-<hash>-an.a.run.app`, or your own domain if you map one
afterward (`gcloud run domain-mappings create`). **Save this URL** — Part 2 needs it.

**Sanity check before moving on:**
```sh
curl -i -X POST https://<your-cloud-run-url>/unlock \
  -H 'content-type: application/json' \
  -d '{"code":"NAZE-0000-0000","deviceId":"smoke-test"}'
```
Expect `404` with `{"error":"not_found"}` — that's correct (no such code exists yet), and it
proves the service is actually deployed and routing requests rather than erroring or timing
out. Also try `curl https://<your-cloud-run-url>/healthz` — expect a bare `200 ok`.

**Issue yourself a real test code** (needs the `ADMIN_TOKEN` from step 2):
```sh
curl -s -X POST https://<your-cloud-run-url>/admin/issue \
  -H "authorization: Bearer <ADMIN_TOKEN>" \
  -H 'content-type: application/json' \
  -d '{"moduleIds":["m1"],"founder":true,"note":"deploy smoke test"}'
```
Returns `{"code":"NAZE-XXXX-XXXX"}` — keep this one for Part 2's end-to-end check.

**If you'd rather build/push the image yourself** instead of `--source .` (e.g. to inspect it
first, or wire it into your own CI):
`docker build -t <region>-docker.pkg.dev/<project>/<repo>/naze-family-code-backend .`,
`docker push` that tag, then `gcloud run deploy naze-family-code-backend --image <that tag> ...`
with the same `--set-env-vars`/`--set-secrets` flags. The Dockerfile itself doesn't change
either way.

---

## Part 2 — Deploy the static site to Firebase Hosting

Not built or configured anywhere yet — there is no existing hosting project for it, and the
GitHub Actions workflow (`.github/workflows/ci.yml`) only runs the test/gate suite, it does
not deploy. Standardized on Firebase Hosting (not Cloudflare Pages) so the whole stack —
Hosting + Cloud Run + Firestore + Secret Manager — lives in one Google Cloud/Firebase project,
one console, one `gcloud`/`firebase` auth session.

`firebase.json` and `.firebaserc` already exist at the repo root — **verified against this
repo's actual build** (not just written from memory): ran a real `npm run build`, served the
resulting `dist/` through the Firebase Hosting emulator, and confirmed every route this app
has resolves correctly:

```json
// firebase.json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "cleanUrls": true,
    "trailingSlash": false,
    "headers": [
      {
        "source": "/assets/**",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  }
}
```

**Why there's no `rewrites` block** — the one thing almost every Firebase Hosting tutorial
tells you to add, and the one thing that would break this specific app: this is a **multi-page**
static build, not a client-side-routed single-page app. Vite already emits a real
`index.html` at every route this app has (`dist/index.html`, `dist/play/index.html`,
`dist/play/unlock/index.html`, `dist/print/deck/index.html`,
`dist/legal/tokushoho/index.html`, `dist/legal/privacy/index.html` — confirmed by listing the
actual build output). Firebase Hosting's own default file resolution (try the exact path, then
`path + ".html"`, then `path + "/index.html"`) already serves every one of those correctly with
zero configuration. Adding the usual SPA catch-all (`"source": "**", "destination": "/index.html"`)
would instead serve the *landing page* for every route — `/play`, `/legal/privacy`, all of it —
which is exactly backwards. `cleanUrls: true` is what makes `/play/unlock` (no `.html`, no
trailing slash) resolve at all; without it you'd need the literal `/play/unlock/index.html`
URL, which nothing in this app links to.

```json
// .firebaserc — replace the placeholder with your real Firebase project id
{
  "projects": {
    "default": "REPLACE_WITH_REAL_FIREBASE_PROJECT_ID"
  }
}
```

Use the **same GCP project** Part 1 deployed the Cloud Run backend into if you want the
one-console setup the whole point of this migration was for — `firebase projects:addfirebase
<PROJECT_ID>` turns an existing GCP project into a Firebase one in place, no new project needed.

```sh
# 1. One-time: log in and confirm the CLI sees your project.
npx firebase-tools login
npx firebase-tools projects:list

# 2. Build with the backend's real URL baked in (from Part 1 step 3).
VITE_UNLOCK_API_URL=https://<your-cloud-run-url> npm run build

# 3. Deploy.
npx firebase-tools deploy --only hosting
```

`firebase deploy` prints the hosting URL — `https://<project-id>.web.app` and
`https://<project-id>.firebaseapp.com` both work out of the box; map a custom domain afterward
with `firebase hosting:sites` / the Firebase console if you want one (separate step, not
covered here).

**Sanity check** (the exact six routes this repo actually builds — verified locally against
the emulator before this runbook was written, confirm the same against the real deployment):
- `https://<your-site-url>/` — the LP loads, headline + trust banner visible.
- `https://<your-site-url>/play` — Mission 1-1 (bread) is playable end to end.
- `https://<your-site-url>/play/unlock` — paste the test code from Part 1's last step, submit,
  confirm it shows "登録が完了しました" (not the "not live yet" message — if you see that,
  `VITE_UNLOCK_API_URL` wasn't set before the build in step 2; rebuild and redeploy).
- `https://<your-site-url>/print/deck` and `/legal/tokushoho` / `/legal/privacy` all load.
- An unrelated path (e.g. `/nonsense`) returns Firebase's own 404, not the LP — confirms there's
  no accidental catch-all rewrite silently swallowing bad links.

**Before this URL goes anywhere public:** `gate:no-llm` (already green in CI) only checks the
build output has no LLM/API hostnames baked in — it does not check for the two content
caveats already flagged in `docs/work-order-w1.md`: no native-speaker review stamp on Mission
1-1 or the LP copy yet, and the LP's §1A alignment claims + legal pages are still founder-review
drafts. Don't route real traffic here until those are cleared.

**Continuous deploy (optional):** `firebase init hosting:github` wires a GitHub Actions
workflow that runs `npm run build` + `firebase deploy` on every push to a chosen branch —
worth doing once this branch is merged and stable, not required for a first manual deploy.

---

## Part 3 — Shopify: webhook, Flow automation, real order test

Full detail (why SKU over tag, why Flow over a template edit):
`docs/task7-shopify-backend-runbook.md` sections 0, 1, 4. Condensed sequence:

1. **Product listing.** Create (or confirm) the product with **SKU `kodomo-ai-m1`** — must
   match `backend/src/shopify.ts`'s `SKU_TO_MODULE_IDS` key exactly, this is the entire
   isolation mechanism. ¥4,980, household licence, 30-day guarantee wording per spec v0.5 §9.
   Products A-D need zero changes.
2. **Webhook.** Admin → **Settings → Notifications** → **Webhooks** → **Create webhook**:
   - Event: **Order payment** (`orders/paid`) — not `orders/create`.
   - Format: JSON.
   - URL: `https://<your-cloud-run-url>/webhooks/shopify/orders-paid` (from Part 1).
   - Save — Shopify shows a **signing secret once**. That's the real value for
     `SHOPIFY_WEBHOOK_SECRET` — go back and run:
     ```sh
     echo -n "<the real signing secret>" | \
       gcloud secrets versions add shopify-webhook-secret --data-file=-
     ```
     Cloud Run picks up the new secret version on its next revision — redeploy (even a no-op
     `gcloud run services update naze-family-code-backend --region asia-northeast1`) to pick
     it up immediately rather than waiting for a natural restart.
3. **Buyer email — Shopify Flow.** Admin → **Apps → Flow** → **Create workflow**:
   - Trigger: **Order metafield updated**, namespace `naze`, key `family_code`.
   - Action: **Send custom email** → to `{{order.customer.email}}`, body includes
     `{{order.metafields.naze.family_code}}`.
   - This is a brand-new workflow, not an edit to any existing template — products A-D's
     confirmation/shipping emails are untouched by construction.
4. **Test the webhook without a real order.** Shopify Admin → the webhook's detail page →
   **Send test notification**. This uses placeholder SKUs (not `kodomo-ai-m1`), so it proves
   the backend responds `200` and doesn't error — it will NOT issue a code (the SKU won't match
   the allowlist, which is correct behavior, not a bug).
5. **Test with a real order** (the actual proof, and spec v0.5's own DoD): buy the product for
   real (¥4,980, real card or PayPay) → confirm the webhook fired (Cloud Run console → your
   service → **Logs**, or `gcloud run services logs read naze-family-code-backend`) → confirm
   the Flow email arrived with a code → paste that code into `/play/unlock` on the site from
   Part 2 → confirm it unlocks. Refund the order after, via the existing 30-day guarantee — no
   special-cased refund logic exists in code, it's an ordinary Shopify refund.
6. **Confirm isolation held.** Check products A-D's own confirmation/shipping emails are
   byte-for-byte unchanged, and that nothing about their orders looks different. (They should
   be — nothing in this integration ever calls the Admin API for a non-`kodomo-ai-m1` order —
   but this is the step that actually proves it against your real store, not just the 65+ tests
   that prove it against fakes.)

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
change). Once you have real content ready, re-deploy Part 2 (`npm run build` +
`firebase deploy --only hosting`, or automatically if you set up the GitHub Actions integration
mentioned there) to publish it.

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
- [ ] A real ¥4,980 test purchase completes with both card and PayPay, and the family code
      arrives and redeems (Part 3, step 5 above).
- [ ] Products A-D's own order flow confirmed untouched (Part 3, step 6 above).
- [ ] `docs/spec-v0.5.md` §1A's four "Allowed" alignment sentences get real, stable MEXT source
      URLs (currently literal `#` placeholders in `src/lp/LandingPage.tsx` — this session
      would not guess a specific government URL to cite on a trust-sensitive section).

---

## Platform history

Parts 1 and 3 originally targeted Cloudflare Workers + KV; the founder later moved the backend
and webhook deployment target to Google Cloud Run (`backend/` was `worker/` before that — see
`docs/task7-shopify-backend-runbook.md`'s own "Platform history" note for what did and didn't
change in the code itself). Part 2 first documented Cloudflare Pages as a low-effort option,
never a requirement, then was standardized on Firebase Hosting for one-console consistency with
the rest of the stack — this only ever changed documentation and the two Firebase config files
(`firebase.json`, `.firebaserc`); the built app itself (`dist/`) is identical either way.
