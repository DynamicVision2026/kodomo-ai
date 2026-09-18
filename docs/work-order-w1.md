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
| `pipeline/04_lint.ts` — deterministic content lint | **Done** (blocked on the grade table) |
| `pipeline/01,02,03,05,tag_audit` | **Documented stubs**, rules encoded, model calls TODO |
| `src/modules/m1/**` — manifest + Mission 1-1 JSON + facts template | **Done** (facts are placeholders) |
| Tests: 9 passing | **Done** |
| UI templates, LP, print deck, Shopify, Worker | **Not started** |

Two gates fail on purpose right now, and both are correct:
- `gate:claims` fails because `bread/facts.yaml` claims are `status: pending`. **Green means Gate 1 really happened.**
- `lint:content` refuses to run because `data/kyoiku-kanji.json` is absent.

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
