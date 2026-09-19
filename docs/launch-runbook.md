# Launch runbook — deploy, connect, go live

Repo: `DynamicVision2026/kodomo-ai` · Branch: `claude/sprint-1-setup-ok4oym` · Store: `https://soul-id-2.myshopify.com/`

This is the single, ordered checklist from "code merged" to "a real family can buy, get a
code, and play." Every step below needs an account or credential this session does not have —
Cloudflare, Shopify Admin, Anthropic, DeepSeek. Nothing here has been run live; this is written
so whoever has that access can follow it top to bottom with no further decisions to make.

Do the four parts **in this order** — 2 depends on 1's output, 3 depends on 1 and 2, and 4 is
independent (do it whenever, including in parallel with 1-3).

```
1. Deploy the Worker + KV  ──┐
                              ├──> 3. Shopify webhook + Flow + test order
2. Deploy the Pages app  ────┘
                                    (needs 1's URL as an env var, and 2 deployed to receive it)

4. Content pipeline keys ──> real Mission content (independent of 1-3)
```

---

## Part 1 — Deploy the Unlock Worker + KV

Full detail and the *why* behind each design choice: `docs/task7-shopify-worker-runbook.md`.
This section is the condensed, ordered command sequence.

**Prerequisite:** a Cloudflare account with Workers + KV enabled, and `wrangler` (Cloudflare's
CLI) available — `npx wrangler` fetches it on demand, nothing to install ahead of time.

```sh
# 1. Authenticate wrangler against your Cloudflare account (opens a browser once).
npx wrangler login

# 2. Create the KV namespace the Worker stores codes in.
npx wrangler kv namespace create NAZE_CODES
# Copy the "id" it prints into wrangler.toml's kv_namespaces[0].id (currently the placeholder
# "REPLACE_WITH_REAL_KV_NAMESPACE_ID") and commit that change.

# 3. Set the three secrets (never in wrangler.toml — these are asked for interactively).
npx wrangler secret put SHOPIFY_WEBHOOK_SECRET   # value comes from Part 3, step 2 below —
                                                   # if you haven't done Part 3 yet, use any
                                                   # placeholder now and re-run this after.
npx wrangler secret put ADMIN_TOKEN               # any long random string YOU generate —
                                                   # save it somewhere; you'll need it to issue
                                                   # founder codes via POST /admin/issue.
npx wrangler secret put SHOPIFY_ADMIN_API_TOKEN    # a custom app Admin API token, scope:
                                                   # write_orders (Shopify Admin -> Settings ->
                                                   # Apps and sales channels -> Develop apps).

# 4. Deploy.
npx wrangler deploy
```

`wrangler deploy` prints the Worker's URL — by default
`https://naze-family-code-worker.<your-subdomain>.workers.dev`, or your own domain if you route
one in the Cloudflare dashboard afterward. **Save this URL** — Part 2 needs it.

**Sanity check before moving on:**
```sh
curl -i -X POST https://<your-worker-url>/unlock \
  -H 'content-type: application/json' \
  -d '{"code":"NAZE-0000-0000","deviceId":"smoke-test"}'
```
Expect `404` with `{"error":"not_found"}` — that's correct (no such code exists yet), and it
proves the Worker is actually deployed and routing requests rather than erroring or timing out.

**Issue yourself a real test code** (needs the `ADMIN_TOKEN` from step 3):
```sh
curl -s -X POST https://<your-worker-url>/admin/issue \
  -H "authorization: Bearer <ADMIN_TOKEN>" \
  -H 'content-type: application/json' \
  -d '{"moduleIds":["m1"],"founder":true,"note":"deploy smoke test"}'
```
Returns `{"code":"NAZE-XXXX-XXXX"}` — keep this one for Part 2's end-to-end check.

---

## Part 2 — Deploy the Cloudflare Pages app

Not built or configured anywhere yet — there is no existing Pages project, and the GitHub
Actions workflow (`.github/workflows/ci.yml`) only runs the test/gate suite, it does not
deploy. This is the simplest path (Cloudflare's Git-integration dashboard, no new GitHub
secrets needed):

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect
   to Git** → select this repo (`DynamicVision2026/kodomo-ai`), branch
   `claude/sprint-1-setup-ok4oym` (or `main` once this branch is merged — your call).
2. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (repo root)
3. **Environment variables** (Pages project settings, not `wrangler.toml` — these are baked in
   at *build* time, not runtime secrets):

   | Variable | Value |
   |---|---|
   | `VITE_UNLOCK_API_URL` | The Worker URL from Part 1 step 4, e.g. `https://naze-family-code-worker.<subdomain>.workers.dev` |

   This is the **only** env var the client build reads (`src/parent/unlock/UnlockPage.tsx`).
   Without it, `/play/unlock` shows "この機能はまだ準備中です" and never calls the Worker —
   deploy Part 1 first, or this step is pointless.
4. Save and deploy. Cloudflare builds and gives you a `*.pages.dev` URL (route your own domain
   afterward if you want one — separate Cloudflare dashboard step, not covered here).

**Sanity check:**
- `https://<your-pages-url>/` — the LP loads, headline + trust banner visible.
- `https://<your-pages-url>/play` — Mission 1-1 (bread) is playable end to end.
- `https://<your-pages-url>/play/unlock` — paste the test code from Part 1's last step, submit,
  confirm it shows "登録が完了しました" (not the "not live yet" message — if you see that,
  `VITE_UNLOCK_API_URL` didn't take; re-check step 3 and redeploy).
- `https://<your-pages-url>/print/deck` and `/legal/tokushoho` / `/legal/privacy` all load.

**Before this URL goes anywhere public:** `gate:no-llm` (already green in CI) only checks the
build output has no LLM/API hostnames baked in — it does not check for the two content
caveats already flagged in `docs/work-order-w1.md`: no native-speaker review stamp on Mission
1-1 or the LP copy yet, and the LP's §1A alignment claims + legal pages are still founder-review
drafts. Don't route real traffic here until those are cleared.

---

## Part 3 — Shopify: webhook, Flow automation, real order test

Full detail (why SKU over tag, why Flow over a template edit): `docs/task7-shopify-worker-runbook.md`
§0, §1, §4. Condensed sequence:

1. **Product listing.** Create (or confirm) the product with **SKU `kodomo-ai-m1`** — must
   match `worker/src/shopify.ts`'s `SKU_TO_MODULE_IDS` key exactly, this is the entire
   isolation mechanism. ¥4,980, household licence, 30-day guarantee wording per spec v0.5 §9.
   Products A-D need zero changes.
2. **Webhook.** Admin → **Settings → Notifications** → **Webhooks** → **Create webhook**:
   - Event: **Order payment** (`orders/paid`) — not `orders/create`.
   - Format: JSON.
   - URL: `https://<your-worker-url>/webhooks/shopify/orders-paid` (from Part 1).
   - Save — Shopify shows a **signing secret once**. That's the real value for
     `SHOPIFY_WEBHOOK_SECRET` — go back to Part 1 step 3 and re-run
     `npx wrangler secret put SHOPIFY_WEBHOOK_SECRET` with it (secrets apply immediately, no
     redeploy needed).
3. **Buyer email — Shopify Flow.** Admin → **Apps → Flow** → **Create workflow**:
   - Trigger: **Order metafield updated**, namespace `naze`, key `family_code`.
   - Action: **Send custom email** → to `{{order.customer.email}}`, body includes
     `{{order.metafields.naze.family_code}}`.
   - This is a brand-new workflow, not an edit to any existing template — products A-D's
     confirmation/shipping emails are untouched by construction.
4. **Test the webhook without a real order.** Shopify Admin → the webhook's detail page →
   **Send test notification**. This uses placeholder SKUs (not `kodomo-ai-m1`), so it proves
   the Worker responds `200` and doesn't error — it will NOT issue a code (the SKU won't match
   the allowlist, which is correct behavior, not a bug).
5. **Test with a real order** (the actual proof, and spec v0.5's own DoD): buy the product for
   real (¥4,980, real card or PayPay) → confirm the webhook fired (Cloudflare dashboard → your
   Worker → **Logs**, or check `wrangler tail`) → confirm the Flow email arrived with a code →
   paste that code into `/play/unlock` on the Pages site from Part 2 → confirm it unlocks.
   Refund the order after, via the existing 30-day guarantee — no special-cased refund logic
   exists in code, it's an ordinary Shopify refund.
6. **Confirm isolation held.** Check products A-D's own confirmation/shipping emails are
   byte-for-byte unchanged, and that nothing about their orders looks different. (They should
   be — nothing in this integration ever calls the Admin API for a non-`kodomo-ai-m1` order —
   but this is the step that actually proves it against your real store, not just the 46 tests
   that prove it against fakes.)

---

## Part 4 — Content pipeline: inject API keys, run Task 1

**Independent of Parts 1-3** — do this whenever, in parallel if you like. This produces real
Mission content (replacing/joining the one hand-authored `bread` topic); it has no dependency
on the Worker or Shopify.

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
change). Once you have real content ready, re-deploy Part 2 (Cloudflare Pages) to publish it —
Pages redeploys automatically on a push to the connected branch if you used Git integration.

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
