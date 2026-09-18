# Build Work Order — Sprint 1 (5–18 Oct 2026)

Repo: `DynamicVision2026/kodomo-ai` · Spec: `docs/spec-v0.5.md` (source of truth)
Goal: **Mission 1-1 playable, gates green, cohort opens 19 Oct.**

Rules for the implementer:
- Spec ambiguities are **escalated to the architect**, never resolved in code.
- A gate that fails is a signal to fix the source, not the gate.
- Codex (or a second model) reviews each task independently before merge.

---

## Status: what is already committed

| Area | State |
|---|---|
| Repo scaffold (Vite + React + TS, 3 entry points, tsconfig, .gitignore) | **Done** |
| CI gates ×4 + GitHub Actions workflow | **Done, verified firing** |
| `src/engine/types.ts` — content model | **Done** |
| `src/engine/ruby.tsx` + `pipeline/lib/ruby.ts` | **Done, tested** |
| `src/engine/resolver.ts` — tag-matching archetype resolver | **Done, tested** |
| `src/engine/digMachine.ts` — pure dig state machine | **Done, tested** |
| `src/engine/storage.ts`, `entitlements.ts`, `analytics.ts` | **Done** |
| `src/ui/Card.tsx` + `card.css` | **Done** |
| `data/kyoiku-kanji.json` — official MEXT grade table (1,026 chars) | **Done** — provenance + verification in `data/README.md` |
| `pipeline/04_lint.ts` — deterministic content lint | **Done, running** (unblocked; refactored so `lintMission()` is reusable by 03) |
| `pipeline/01_research.ts` — Claude + web search → facts.yaml | **Wired**, not yet run live (no `ANTHROPIC_API_KEY` in this sandbox) |
| `pipeline/02_crosscheck.ts` — GPT-4o re-verifies 01's claims | **Wired**, not yet run live (no `OPENAI_API_KEY`) |
| `pipeline/03_render.ts` — Claude renders approved claims → mission JSON | **Wired**, not yet run live. Deterministic shape assembly + mechanical validation (claim traceability, exactly one `deepen`, runs `lintMission()`) so the model only ever fills in text, never structure |
| `pipeline/05_entail.ts` — GPT-4o entailment check, flags only, non-zero only on "contradicts" | **Wired**, not yet run live |
| `pipeline/tag_audit.ts` — GPT-4o blind tag classification, flags only | **Wired**, not yet run live |
| `src/templates/dig`, `src/templates/slot-assembly` | **Done, tested** — mission 1-1 playable end to end (verified in a real browser) |
| `src/engine/predictions.ts` — resolves a `PredictionPrompt` into display options | **Done, tested** (handles the slot-assembly wildcard-rule case by reusing `resolveArchetype`, not by re-deriving it) |
| `src/templates/prediction-battle`, `src/templates/handoff` | **Done, tested** — child → handoff → parent → reveal, both skippable, solo auto-skip; verified in a real browser as part of the full mission 1-1 playthrough |
| `src/modules/m1/**` — manifest + Mission 1-1 JSON + facts template | **Done** (facts are still placeholders — `bread` was never run through the live pipeline, `gate:claims` still correctly fails on it) |
| `src/shell/MissionShell.tsx` — phase sequencer + wrapper screens + hasAccess gate | **Done, tested** — profile → coop question → phases → きょうのコツ → teach-back (skippable) → おうちトーク → handoff → parent screen, all in one real-browser playthrough |
| `src/shell/ProfilePicker.tsx` + `presets.json` | **Done, tested** — preset avatars (emoji placeholders pending Task 0.5's real mascot art) + preset nicknames, max 6, no PII |
| `SlotAssembly`/`Dig` own their phase/layer's own `predictions` internally | **Done, tested** — the mission shell no longer needs to know phase-internal round/layer timing |
| Storage-blocked resilience | **Tested** — a session with `localStorage.setItem` throwing still completes the mission (component test + reasoning; real-device Safari private-mode check still pending) |
| `src/print/deck` — 9-card sampler, A4, cut lines | **Done, tested** — verified via Chromium print-media emulation + an actual PDF render |
| `src/lp` — parent-voice landing page | **Done (structural), tested** — all 11 spec §10 sections; §1A alignment wording is verbatim from spec's own "draft, pending legal check" list, source links are placeholders (see caveat below); §3 deliberately has no fabricated survey stats |
| Tests: 105 passing | **Done** |
| Task 7 (Shopify order → Worker code issuance/redemption) | **Worker done, tested; live store/Cloudflare config not started** — see `docs/task7-shopify-worker-runbook.md`. `worker/src/` implements the webhook receiver (`/webhooks/shopify/orders-paid`, HMAC-verified, idempotent), `/admin/issue` (founder codes), and `/unlock` (redemption, soft 5-device cap). Isolation from products A-D is a SKU allowlist (`worker/src/shopify.ts#SKU_TO_MODULE_IDS`), not a tag — an unmatched line item is never written to KV, never triggers an Admin API call. Buyer email is a new Shopify Flow workflow (triggered by an order metafield write), not an edit to the shared confirmation/shipping templates A-D also use. 27 tests, all pure/mocked — no live Shopify or Cloudflare credentials exist in this environment, so nothing has run against the real store yet. KOMOJU/PayPal checkout methods themselves are Shopify Payments-side configuration, outside this repo's code. |
| Task 9 (特商法, privacy pages) | **Done (draft)** — `src/legal/tokushoho`, `src/legal/privacy`, real company data confirmed by the founder from soul-id.jp (see `src/legal/company.ts`); still needs the founder's own legal sign-off before publishing, and a real phone number or confirmation that "disclosed on request" is acceptable for this business |
| Worker (family-code entitlement redemption) | **Done, tested (server-side only)** — see Task 7 row above. The `/play/unlock` client-side redemption screen that calls this Worker is not yet built (flagged as a fast-follow in the runbook §5). |
| **Sprint 1-A — stage is now a data concern** (see `docs/work-order-w2-stage-expansion.md`) | **Done, tested** — `pipeline/03_render.ts` renders any of `STAGE_CLAIM_COUNT = {1:2, 2:3, 3:5}` and its prompt now interpolates `STAGE_LIMITS[stage]` instead of hardcoding Stage 2's own rules; `ProfilePicker` takes `defaultStage` instead of a literal `2`; a new `src/shell/missionLibrary.ts#pickNextMission` picks the stage-appropriate, not-yet-done mission for a profile (wired into `MissionShell` via an optional, backward-compatible `missionLibrary` prop, and into `src/main.tsx`); `PrintDeck` takes `deck`/`cardTypes` as props instead of importing `deck.s2.json` directly; a new `src/modules/stage1-test` fixture (mirroring `m2-test`, which already covered Stage 3) proves a Stage 1 mission renders through the unmodified `MissionShell` at `STAGE_LIMITS[1]`'s tight limits. Also fixed in passing: `gate-claims-approved.ts` excluded decks by the literal name `deck.s2.json`, which would have broken on a real `deck.s1.json`/`deck.s3.json` — now a `/deck\.s\d+\.json$/` regex, matching `04_lint.ts`'s own pattern. 143 tests green (was 115); all gates pass/fail exactly as before. Stage 3 content and the Stage 1 spike are separate, not-yet-started work orders in that same document. |
| **Second-opinion provider switched from GPT-4o to DeepSeek** | **Done, tested (no live key yet)** — `pipeline/lib/openai.ts` renamed to `pipeline/lib/secondOpinion.ts` and generalized: `02_crosscheck`, `05_entail`, and `tag_audit` no longer call OpenAI specifically, they call whichever provider `CROSSCHECK_PROVIDER` selects (default now `deepseek`; `openai` still available by setting that env var back). Requires `DEEPSEEK_API_KEY` by default now, not `OPENAI_API_KEY`. Still needs `ANTHROPIC_API_KEY` regardless — DeepSeek cannot run 01's web-search step, that stays Claude-only. Neither key exists in this sandbox; nothing has been run live. |

One gate still fails on purpose, and that's correct:
- `gate:claims` fails because `bread/facts.yaml` claims are `status: pending`. **Green means Gate 1 really happened.** (`lint:content` itself now runs clean — the kanji table unblocked it.)

**Caveat on the LP's §1A section:** the four sentences are copied verbatim from spec's own
"Allowed (draft, pending native and legal check)" list — that check has not happened, and this
section must not be treated as cleared for public launch. Its source-link `href`s are literal
`"#"` placeholders: this session would not guess a specific MEXT URL to cite on a legal/policy
page, since a wrong or unstable link would undermine exactly the trust the section exists to
build. Confirm real, stable URLs before launch.

**Caveat on the five pipeline scripts above:** none has been run against a live model in this
environment — there is no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set here. What's verified
without live keys: full typecheck, unit tests on every pure function (validation, deterministic
mission assembly, text-collection/traversal logic), and for 03 specifically, an end-to-end test
proving a synthetic rendered mission passes the real `lintMission()` with zero issues. Treat
"Wired" as "ready to run, not yet proven against the real API" until someone with keys runs the
DoD commands.

---

## Task 0 — Unblock (day 1, founder)

| # | Task | Owner |
|---|---|---|
| 0.1 | **Make the repo private** until launch | Founder |
| 0.2 | Export the validated 1,026-char grade table from SENJI → `data/kyoiku-kanji.json` (see `data/README.md`). Nothing content-side runs without it | Founder |
| 0.3 | Confirm the product name or keep ナゼホリ as working title; J-PlatPat classes 9/41 + `.jp` | Founder |
| 0.4 | Appoint the native-speaker reviewer (**hard blocker, 12 Oct**) | Founder |
| 0.5 | Commission mascot art: ロボ ×6 expressions, ポン太 ×3, 2 backgrounds | Founder |

---

## Task 1 — Pipeline to working state (5–9 Oct)

**1.1 Wire `01_research.ts`.** Model + web search → `facts.yaml`. Prompt must enforce: 4–6 atomic
claims shallow→deep; every claim has a whitelisted source URL and excerpt; ≥1 adult-level source
per claim; facts only, never copied explanation; claims written language-neutral.
DoD: `npx tsx pipeline/01_research.ts bread "パンは なぜ ふくらむ？"` writes a valid facts.yaml with all claims `pending`.

**1.2 Wire `02_crosscheck.ts`** using a **different provider/model** from 01. Writes
`crosscheck: { verdict, note }` per claim. Never changes `status`.

**1.3 Gate 1 review tooling.** A one-screen CLI or markdown checklist that shows each claim, its
source excerpt and the crosscheck verdict, and writes `status/approvedBy/approvedAt`.
Keep it dull and fast: this is ~5 min × 70 claims of founder time.

**1.4 Wire `03_render.ts`.** Approved claims → stage JSON. Must call `assertAllApproved` first.
Prompt rule: introduce no fact absent from facts.yaml; tag every `robotSays` with claim ids.

**1.5 Wire `05_entail.ts` and `tag_audit.ts`.** Both flag only; `05` exits non-zero on "contradicts".

**1.6 Run the 5-topic pilot** (bread + 4 more). **Log minutes per step and errors caught per gate.**
Escalate if lint+entailment catch under ~70% of what the human finds.

---

## Task 2 — Dig template UI (5–10 Oct)

`src/templates/dig/` renders `digMachine` state. Cross-section-of-earth screen, ふかさメーター
(1→2→3→ねっこ), hand of 3–4 cards via `Card.tsx`, flat replies as ロボ being unhelpful.
「これでOK」 **always visible**; tapping it shows the ポン太 challenge and returns to the dig.
No 正解/不正解 anywhere. Emits `dig_layer_reached`, `early_ok_tapped`, `root_reached`.
DoD: playable from `bread/s2.json` alone; adding a second topic needs **zero code change**.

## Task 3 — Slot-assembly template (5–10 Oct)

Renders slots + hand, calls `resolveArchetype`, plays the archetype reaction. Free retries; each
retry shows what changed. Emits `round_complete` with retry count.

## Task 4 — Prediction battle + handoff (10–13 Oct)

`prediction-battle`: overlay before a reveal — child taps a prediction, 「おとなにわたしてね」 handoff
screen, parent taps, then reveal. Emits `prediction_made` with `who`.
`handoff`: reusable pass-the-device screen. Both must be skippable (solo play, spec pillar 5).

## Task 5 — Mission shell + profiles (10–13 Oct)

Phase sequencer (`slot-assembly` → `dig` → wrapper screens: きょうのコツ, teach-back, おうちトーク,
parent screen). Profile picker: preset avatars + preset nicknames + stage (default 2), max 6,
「おうちの人もいっしょ？」. `hasAccess` consulted for every mission.
**Works with storage blocked.** Parent screen is the only place with parent-voice copy.

## Task 6 — Print deck (13–15 Oct)

`deck.s2.json` (9-card sampler for this sprint) → `/print/deck` via the same `Card.tsx`.
9 per A4 with cut lines. DoD: prints correctly from Chrome **and** Safari, legible in black and white.

## Task 7 — Commerce + legal pages (13–16 Oct)

Shopify listing: ¥4,980, household licence, 創設ファミリー特典, 30-day guarantee, delivery date.
Card + PayPay (KOMOJU) verified with a real test order. 特商法 and privacy pages.
**No pre-order logic in the codebase** — it is an ordinary listing.

## Task 8 — Landing page (15–18 Oct, last)

Built with real screenshots. Grade-band picker (`grade_pick`), A/B headline persisted in storage
and attached to every event, section 7A alignment map with source links.
**Every policy claim must match an "Allowed" line in spec §1A** and pass the legal wording check.

---

## Sprint DoD (19 Oct, cohort opens)

- [ ] Mission 1-1 end to end on iPad Safari, Chrome (Win/Chromebook), phone — storage blocked included
- [ ] 1-1 **cannot** be finished with one question (test already asserts this)
- [ ] Dummy `src/modules/m2-test` with a new card type + dummy `s3.json` render without touching `/engine`
- [ ] All four gates green, including `gate:claims` on **real approved** claims
- [ ] Native-review stamp on 1-1 and all LP copy
- [ ] Sampler prints on A4, legible in B&W
- [ ] Test purchase completes with card and PayPay
- [ ] Legal wording check done (price display + §1A claims)

## Escalate immediately if

- The grade table cannot be exported from SENJI by 7 Oct
- The native reviewer is not appointed by 12 Oct
- Pilot topic time exceeds ~150 min/topic (plan assumes ~105)
- More than 1 of the 5 pilot topics cannot be told truthfully at Stage 2 depth
- Any task tempts you to add runtime AI, a text input, or any stored personal data
