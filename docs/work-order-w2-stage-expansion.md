# Work Order — Grades 1–6 Expansion (Sprint 1-A + Stage 3/1 content plans)

Repo: `DynamicVision2026/kodomo-ai` · Spec: `docs/spec-v0.5.md` (source of truth)
Predecessor: `docs/work-order-w1.md` (Sprint 1, Mission 1-1 / Stage 2 — done, 115 tests green)

Goal: make **stage** a data concern, not a code concern (Sprint 1-A), then use that to write
real work orders for Stage 3 (spec already gives design parameters) and a **spike** — not yet
a work order — for Stage 1 (spec does not).

Same rules as w1: spec ambiguities are escalated, never resolved in code; a gate that fails is
a signal to fix the source, not the gate.

One correction before this starts: the request that produced this document referred to
"audio pipelines... as proposed in your evaluation." I hadn't proposed that anywhere earlier
in this session — I'm raising it fresh in §4 below because Stage 1's own kanji/length limits
make it a real open question, not because I'd already recommended it. Flagging this now so it
isn't mistaken for a decision already made.

---

## 1. Current-state audit: where "stage" already is data, and where it still isn't

This determines exactly what Sprint 1-A needs to touch. Three pipeline files are **already
stage-generic** — no change needed:

| File | Why it's already fine |
|---|---|
| `pipeline/lib/kanji.ts` | `STAGE_LIMITS` already has real entries for stages 1, 2, **and** 3 (`bareUpTo`/`allowedUpTo`/`maxSentence`). Only stage 2's has ever been exercised against real content. |
| `pipeline/04_lint.ts` | `lintMission()`/`lintDeck()` take `stage: number` and just look up `STAGE_LIMITS[stage]` — no stage-2-only branch anywhere. |
| `pipeline/05_entail.ts`, `pipeline/tag_audit.ts` | Both already take `--stage` on the CLI and build their file paths as `topics/<topic>/s${stage}.json` — no hardcoded `s2`. |

Four places are **not** yet stage-generic — this is the real Sprint 1-A scope:

| # | File : line(s) | The problem |
|---|---|---|
| A | `pipeline/03_render.ts:54` | `const STAGE_CLAIM_COUNT: Record<number, number> = { 2: 3 };` — only stage 2 has a claim-count mapping. `render()` (line ~287) throws "not yet supported... escalate before adding another stage" for anything else. This was a deliberate guard, not an oversight — it's exactly the switch Sprint 1-A needs to flip. |
| B | `pipeline/03_render.ts:97–100` | The model prompt **hardcodes** Stage 2's own rules as prose: `"Every sentence <= 35 characters"` and `"Kanji at Grade 1-2 may appear bare... NEVER use kanji above Grade 4"`. These numbers must come from `STAGE_LIMITS[stage]`, not be typed literally — as written, rendering a Stage 1 or Stage 3 mission today would still tell the model Stage 2's limits regardless of `stage`, and only the separate deterministic lint would catch the mismatch after the fact. |
| C | `src/shell/ProfilePicker.tsx:50` | `onCreate({ ..., stage: 2, ... })` — every new profile is hardcoded to stage 2. Spec's own wording is "stage (**default** 2)" (§5 step 0), i.e. this was always meant to be a default, not a constant. |
| D | `src/print/deck/PrintDeck.tsx:2` | `import deck from '../../modules/m1/deck.s2.json';` — a static import of one specific stage's deck file. Fine for a single-stage sprint; wrong for three. |

And one gap that isn't a "stage" bug so much as a missing layer, surfaced by trying to plan
this expansion at all:

| # | Gap | Why it matters |
|---|---|---|
| E | No mission library / selection | `src/main.tsx` imports exactly one mission JSON and hands it to `MissionShell` as a prop. There is no code anywhere that looks at a profile's `stage` and picks a stage-appropriate mission from `module.json`'s `missionOrder`. Stage 1/3 content can be perfectly correct and still be **unreachable** by a real profile without this. |

Two things that will need **new UI kinds, not engine changes** — same pattern already proven
by `src/modules/m2-test` (Sprint 1's extensibility fixture): Stage 3's power-up slots
(だれのために / じょうけん / おてほん) and its two new follow-moves (どうしてそういえるの？/
もし〜なら？) are just new `CardKind` entries in `src/ui/Card.tsx` plus new `slotTypes`/
`followMoves`/`cardTypes` entries in `module.json`. `SlotId` is already `type SlotId = string`
and `DigCard`/`SlotCard` already carry an open `tag: string` — nothing under `src/engine`
needs to know these new kinds exist, exactly like `m2-test`'s "check" kind didn't.

---

## 2. Sprint 1-A — stage as a first-class parameter (~3 days)

### 2.1 `pipeline/03_render.ts` — parametrize the claim count and the prompt itself

- Replace the single-entry map with one row per shipped stage. Proposed starting values
  (Stage 1's is provisional — see §4, it depends on the spike, not on this sprint):

  ```ts
  const STAGE_CLAIM_COUNT: Record<number, number> = { 1: 2, 2: 3, 3: 5 };
  ```

  Depth follows directly from the existing `claims.length - 1` layers `+ 1` root math already
  in `assembleMission()` — no change needed there. `N=2` → 1 layer + root (depth 2, a
  deliberately shallow Stage 1 shape). `N=3` → depth 3 (unchanged, today's Mission 1-1 shape).
  `N=5` → depth 5, landing exactly on spec §3's "Reserved for Stage 3... depth 4–5."
- Keep the `if (!claimCount) throw` guard — it's the right behavior for a stage nobody has
  designed yet — but generate the message from `Object.keys(STAGE_CLAIM_COUNT)` instead of a
  literal "only Stage 2", so it stays true as the table grows.
- Rewrite `buildSystemPrompt()`'s two hardcoded rule lines to interpolate
  `STAGE_LIMITS[stage].maxSentence` / `.bareUpTo` / `.allowedUpTo` (imported from
  `pipeline/lib/kanji.ts`, already imported elsewhere in this file). This is the one change in
  this whole sprint most likely to cause a silent content bug if skipped — the deterministic
  lint would still catch a violation, but only after a wasted model call and a failed render.
- **Verification, not new code:** `assembleMission()`'s claim→layer mapping, the lint
  dispatch, and the mechanical validation (`lintMission` call before writing) are already
  stage-parametric. The existing `tests/pipeline03Render.test.ts` fixture is Stage-2-shaped;
  add one more fixture at a different claim count (e.g. 5) purely to prove the layer/root math
  still holds — this is a test-only addition, not a logic change.

### 2.2 `src/shell/ProfilePicker.tsx` — stage becomes a prop-driven default, not a constant

- `ProfilePickerProps` gains `defaultStage: Stage` (or a small `availableStages: Stage[]`,
  see below). `confirm()` uses that instead of the literal `2`.
- Decide (this is the one real design choice in this sub-task, small enough to make here
  rather than escalate): does the picker ever let a family **choose** a stage at profile
  creation, or does it always default and let the mission-library layer (§2.4) offer
  stage-appropriate content regardless? Given spec's own "everyone may play" stance on the
  LP's grade picker (§10), the same principle should probably hold here — default to the
  module's primary stage, never gate creation on it. Recommendation: keep profile creation
  stage-blind (just carry the default), and let §2.4's library do the actual stage-matching.
  Flag this recommendation to the founder before building it — it's cheap to reverse now,
  expensive after real profiles exist with a stage baked in.

### 2.3 Stage-specific linting

Nothing to build — §1 already confirmed `STAGE_LIMITS[1]` and `STAGE_LIMITS[3]` exist and
`lintMission`/`lintDeck` already key off whatever `stage` they're given. The Sprint 1-A task
here is purely **verification**: extend `tests/pipeline04Lint.test.ts` with a Stage 1 fixture
(very tight: `bareUpTo:0` means even Grade 1 kanji needs ruby, `maxSentence:20`) and a Stage 3
fixture (`allowedUpTo:6`, `maxSentence:50`) to prove the existing rules behave as intended at
the extremes, not just at Stage 2's middle ground.

### 2.4 Mission library — the missing layer (§1, gap E)

Smallest version that unblocks everything else: a pure function,
`pickNextMission(module, profile): string | null`, that reads `module.json`'s
`missionOrder` + each mission's own `stage` field (already on every rendered `Mission`) and
returns the first mission at the profile's stage that isn't yet `done` in
`profile.progress`. `src/main.tsx` calls it instead of importing one fixed mission, and
`MissionShell` is unchanged — it already just takes whatever `mission` prop it's given.
This is new code, not a refactor of anything Sprint 1 built.

- Needs each `Mission` to actually carry the stage it was rendered for so the picker can
  filter on it — already true (`Mission.stage`, checked by `gate:no-hardcoded` unaffected).
- Out of scope for 1-A: a visual "choose your mission" screen, cross-module browsing. One
  auto-advancing picker per module is enough to prove Stage 1/3 content is reachable at all.

### 2.5 `src/print/deck/PrintDeck.tsx` — deck per stage

Recommendation: make `PrintDeck` accept its deck data as a **prop** rather than importing
`deck.s2.json` directly, and give each stage its own thin Vite entry (`print/deck-s1/`,
`print/deck-s3/`, mirroring the existing `print/deck/` pattern) whose `main.tsx` imports that
stage's `deck.sN.json` and passes it down. One component, parametrized — not three copies of
the rendering logic. `pipeline/04_lint.ts`'s `DECK_FILENAME` regex already matches
`deck.s1.json`/`deck.s3.json` with no change.

### 2.6 Sprint 1-A acceptance criteria

- [ ] `pipeline/03_render.ts` renders a mission at claim count ≠ 3 (e.g. a fixture with 5
      claims) and the resulting mission passes `lintMission()` at that stage, matching
      `tests/pipeline03Render.test.ts`'s existing "passes the deterministic content lint" test
      but for a non-Stage-2 shape.
- [ ] The render prompt's style-rule text is generated from `STAGE_LIMITS[stage]`, verified by
      a test asserting the prompt string changes when `stage` changes (a snapshot-style check
      is enough — this doesn't need a live model call).
- [ ] A new profile's `stage` comes from a prop, not a literal, and a unit test constructs a
      `ProfilePicker` with `defaultStage: 3` and asserts the created profile carries it.
- [ ] `pickNextMission()` is unit-tested against a fake two-stage module + a profile that has
      completed the Stage 2 mission, and returns the Stage 3 one.
- [ ] `m2-test`-style fixture repeated at Stage 1 and Stage 3 (two more dummy missions, same
      pattern as `src/modules/m2-test`) renders through the real, unmodified `MissionShell` —
      re-confirming spec §13's "no `/engine` changes" promise now holds across all three
      stages, not just Stage 2.
- [ ] All existing 115 tests plus the new ones green; all gates still pass/fail exactly as
      before (this sprint changes no content-approval state).

---

## 3. Stage 3 (Grades 5–6) content work order — topic-spine model

Spec already gives real design parameters here (§3's "Reserved for Stage 3" row), so this can
be a real work order, not a spike.

**The cost-saving model, made concrete:** `01_research.ts` already targets 4–6 claims per
topic (`MIN_CLAIMS`/`MAX_CLAIMS` in `pipeline/01_research.ts`) — that range was sized, whether
anyone said so at the time or not, to cover exactly this reuse: Stage 2 renders claims 1–3,
Stage 3 renders up to all of them. **`01_research.ts` and `02_crosscheck.ts` never re-run for
a stage bump.** Only `03_render.ts` (different claim count → different mission JSON),
`04_lint.ts` (cheap, deterministic), `05_entail.ts`, and `tag_audit.ts` (both re-run against
the new rendered output) touch a topic a second time. For N already-approved Stage 2 topics,
producing their Stage 3 counterpart costs roughly one Claude render call + two GPT-4o audit
calls each — no new web research, no new crosscheck, no new Gate 1 founder review of the
underlying facts (they were already approved; Stage 3 just uses more of them).

### Tasks

1. **Depends on Sprint 1-A §2.1–2.3** (claim count, prompt parametrization, lint verification)
   landing first — Stage 3 rendering is the first real user of that code.
2. **New card kinds** (`src/ui/Card.tsx`) for the three power-up slots (だれのために /
   じょうけん / おてほん) and two new follow-moves (どうしてそういえるの？/ もし〜なら？),
   plus their `slotTypes`/`followMoves`/`cardTypes` entries in `module.json` — same shape as
   the Sprint 1 "check" kind added for `m2-test`, so low risk.
3. **`assembleMission()` review**: today's slot-assembly phase always renders exactly one slot
   ("what") with a fixed clear/vague/offtopic shape. Stage 3's power-up slots imply a mission
   *may* want more than one slot filled per round. Check whether `SlotAssembly.tsx`'s existing
   multi-slot support (it already iterates `phase.slots` generically — see
   `SlotAssembly.tsx`'s render loop) is sufficient as-is, or whether `assembleMission()`
   itself needs to grow beyond its current single-slot assumption. This is implementation
   work, not a design question — spec already says what the slots are.
4. **Pilot, once Task 1 (live pipeline) is unblocked:** re-render 2 already-Gate-1-approved
   Stage 2 topics at Stage 3 depth from the same `facts.yaml`, run `05_entail`/`tag_audit`
   against the results, and log: did the deeper claims (4th–5th) hold up as genuinely
   independent, checkable facts, or did the original research chain thin out toward the end
   (spec's own §6 warning: "truncation is not always valid simplification" cuts both ways —
   a chain built assuming a 3-claim cut may not extend cleanly to 5). This pilot is the actual
   validation of the topic-spine model's savings claim, not just an assumption.
5. **Native review** of the Stage 3-specific power-up slot / move card *type labels* (not
   full content review — that's Gate 2 as usual) before they ship, since these are new
   vocabulary not yet seen by a native speaker.
6. **Deck**: `deck.s3.json` sampler (same 9-card structure as Sprint 1's, using the new card
   kinds) once §2.5 lands.

---

## 4. Stage 1 (Grades 1–2) — spike, not yet a work order

Unlike Stage 3, spec gives Stage 1 almost nothing to build against: it exists in the roadmap
(§2) and gets one sentence in §1A ("A future Stage 1 must use 生活科 language instead"). There
is no §3-equivalent table of slots/moves/depth for Stage 1. Writing a real work order against
that little would mean *me* inventing Stage 1's actual game design, which is exactly the kind
of thing this project's own rule says to escalate rather than resolve in code.

`STAGE_LIMITS[1]` already exists (`bareUpTo: 0, allowedUpTo: 2, maxSentence: 20`) and is
brutal by design: **zero bare kanji** — even Grade 1 kanji needs ruby — and a 20-character
sentence ceiling. That constraint is almost certainly *why* an architect would end up
considering audio narration for Stage 1, but — correction from the top of this document — I
had not actually proposed that yet; I'm surfacing it here as the first open question, not as
settled direction.

### Open questions a spike should answer (architect/founder decision, not mine to make)

1. **Reading path.** Can real content be written that's both age-3–4 (i.e. Grade-1–2)
   engaging and satisfies `bareUpTo:0, maxSentence:20`? Or does Stage 1 need a fundamentally
   different information channel — audio narration for ロボ's lines and card prompts — to be
   viable at all? If audio: is it pre-generated at build time (TTS, kept out of the runtime —
   consistent with "no LLM at runtime") or professionally voice-recorded? Either has a real
   cost and pipeline shape neither this document nor spec has designed yet.
2. **Depth and mechanic simplification.** Should Stage 1's dig go shallower than the proposed
   `STAGE_CLAIM_COUNT[1] = 2` (1 layer + root) — or does the whole slot-assembly → dig shape
   need rethinking for pre-fluent readers, rather than just running the existing mechanic at
   lower depth?
3. **Solo-completability vs. audio cost.** Pillar 5 (spec §1) requires every stage stay
   solo-completable. A G1–2 child's practical reading independence is lower than G3–4's even
   with ruby, which pulls toward *more* required parent involvement — in tension with the
   pillar. Does an audio solution resolve this tension (a child who can't yet read fluently
   can still listen independently), or does Stage 1 need its own, explicit exception/adaptation
   of pillar 5?
4. **Content bank fit.** Do the same everyday-science/social-studies topics used for Stage 2/3
   work for Grade 1–2 framing, or does Stage 1 need its own topic bank entirely (closer to
   生活科's concrete, immediate-environment framing than 総合's inquiry framing)?

### Proposed spike (time-boxed, ~2–3 days, before any Stage 1 work order gets written)

1. A short architect design note answering questions 1–4 above — prose, not code.
2. If audio is the direction: a throwaway prototype only — pre-generate 5–10 lines via TTS,
   wire a play button into a modified copy of the `Dig` harness (not the real component), and
   get a rough cost-per-mission and latency read. Explicitly not production code.
3. One topic hand-authored directly at the proposed Stage 1 constraints (bypassing the full
   01–05 pipeline) to pressure-test whether `bareUpTo:0, maxSentence:20` content can actually
   carry a "one more question" moment, or whether the constraint needs revisiting before real
   production starts.
4. Founder/architect review of (1)–(3) together. Only after that does a real Stage 1 work
   order — parallel in structure to §3 above — get written.

---

## 5. Sequencing

```
Sprint 1-A (stage-generic architecture)
   │
   ├──> Stage 3 work order (spec already has the design — proceed once 1-A lands)
   │        └──> pilot re-render blocked on Task 1 (live ANTHROPIC_API_KEY/OPENAI_API_KEY)
   │
   └──> Stage 1 SPIKE (design + prototype, independent of 1-A's code, can start in parallel)
            └──> architect sign-off ──> real Stage 1 work order (not written yet)
```

Task 1 (the live pipeline run) and Task 7 (Shopify wiring) remain exactly as blocked as
`docs/work-order-w1.md` already recorded — nothing in this document changes either.

## 6. Escalate before building (this session will not decide these unilaterally)

- Whether profile creation ever offers a stage choice, or always defers to the mission
  library (§2.2) — I have a recommendation above, not a decision.
- `STAGE_CLAIM_COUNT[1] = 2` is a placeholder guess for Sprint 1-A's plumbing, not a Stage 1
  design decision — the spike (§4) owns the real number.
- Whether Stage 1 needs audio at all, and if so, TTS vs. recorded voice, and who owns that
  pipeline's cost.
- Whether Stage 1's topic bank should differ from Stage 2/3's (生活科 vs. 総合 framing, per
  spec §1A's own note).
