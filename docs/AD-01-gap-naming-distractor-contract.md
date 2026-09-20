# AD-01 — Gap Naming Distractor Contract (Stage 2)

ナゼホリ（仮）· 20 Sep 2026 · Architecture decision, unblocks WO-03
Scope: the minimum contract only. Does not touch WO-04, blind-first, toolbox, scoring or semantic evaluation.

---

## 0. Why distractors exist at all

There is no correctness feedback in this step, so it is worth being explicit about what the alternatives are for. **The learning is the discrimination, not the answer.** A single "what's missing" button is a tap. Three choices force the child to read the answer they just received and ask which hole is actually in *this* line.

The consequence of a poor choice lives in the dig, not in a verdict. A child who misreads the gap is no better oriented when the hand appears, and is likelier to play a card that does not deepen. ロボ's flat reply is the feedback. Nothing marks the gap choice itself.

This is why distractors must be plausible. An absurd alternative is eliminated without reading, which removes the entire value of the step.

---

## 1. Source — authored per Dig layer

**Decision: authored per layer. No shared bank.**

Rejected: a module- or domain-level gap bank. A gap is a statement about what one specific answer left open. A bank would force generic phrasing (「りゆうが わからない」), and generic alternatives do not discriminate — the child can pick one without reading the answer, which defeats the step. The authoring cost of two strings per layer is small; the cost of a vague choice set is the mechanic itself.

---

## 2. Schema

`gap: string` is **unchanged**. The two accepted WO-01 values stay exactly as they are. Add one sibling field:

```jsonc
{
  "robotSays": "…",
  "gap": "…",                       // unchanged — the target gap
  "gapDistractors": [               // NEW — exactly two, one of each kind
    { "text": "…", "kind": "answered"    },
    { "text": "…", "kind": "other-layer" }
  ]
}
```

TypeScript:

```ts
export type GapDistractorKind = 'answered' | 'other-layer';

export interface GapDistractor {
  text: string;
  kind: GapDistractorKind;
}

export interface DigLayer {
  // …existing fields
  gap: string;
  gapDistractors: [GapDistractor, GapDistractor];
}
```

**Why distractors sit in a separate field rather than one combined `gaps` array with roles:** a combined array would require migrating the accepted `gap: string`, and that work is signed off. Keeping `gap` as the single source of the target also means the runtime can never lose track of which entry is the target when the set is shuffled.

**Why `kind` is stored even though no lint can verify it semantically:** no deterministic check can decide whether a distractor is genuinely already answered. The field is there so the fact gate and the native reviewer have something concrete to check against, and so a future mission writer must consciously pick a kind rather than inventing an arbitrary third option.

### Lint rules (deterministic, add to `04_lint.ts`)

1. `gapDistractors` present on every layer that has `gap`; exactly **2** entries.
2. Exactly one `kind: "answered"` and exactly one `kind: "other-layer"`.
3. All three strings (`gap` + both `text`) **distinct within the layer**.
4. Each `text` passes the same child-facing rules as any other line: stage kanji grade, ruby, sentence length, banned words, PII words.
5. Non-empty after trimming.

Cross-layer reuse of a string is **permitted and sometimes correct** — see layer 1's `other-layer` distractor below.

---

## 3. Choice count — three

One target plus two distractors, at every layer where gap naming runs.

Three is already what the accepted v0.6 architecture specifies, and it holds up: two well-chosen distractors cover both failure modes the step exists to catch (didn't read the answer; lost track of the chain). A fourth adds reading load to a 10–12 minute session without adding a third kind of discrimination.

Gap naming runs **only at layers where the child answers 「いいえ」**. It does not run at the root, where 「はい」 completes the mission. Bread therefore needs two sets, one per layer.

---

## 4. Authoring rule

A distractor must be a **real-sounding gap that this particular line does not leave open.** The two kinds are the only permitted forms:

| Kind | Definition | What it catches |
|---|---|---|
| `answered` | **This layer's own `robotSays` does address it.** The child who reads the line carefully eliminates it | Not reading the answer |
| `other-layer` | A genuine gap **elsewhere in this chain** — resolved by an earlier layer, or opening only at a later one | Losing track of where the dig has got to |

Five binding rules for mission writers:

1. **Never absurd.** If an adult would eliminate it without reading the answer, it is not a distractor.
2. **Never equally true.** If a distractor is also genuinely open at this layer, there is no target and the step is broken. Exactly one option is the gap in this line.
3. **Same register as the target.** Same sentence shape, same length band, same vocabulary level. A distractor that is visibly shorter, odder or more childish is a positional tell.
4. **Stay inside the chain.** Never off-topic. 「パンは おいしいのか わからない」 is an off-topic *card*, not a gap. Gaps are always about what the answer failed to explain.
5. **No negations, no double gaps.** One missing thing per option, stated plainly.

---

## 5. Runtime behaviour (minimum, to keep WO-03 bounded)

- Choice set = `[gap, ...gapDistractors]`, **shuffled on each presentation** so position is never a tell. Order is stable within one presentation.
- The child's choice is **recorded** (`gap_named` with the chosen kind or `target`), then the hand is shown.
- **The hand is not filtered, highlighted or altered by the gap choice.** Every card the layer authored remains available. Any consequence lives in the dig, as designed.
- **No feedback of any kind** on the gap choice: no mark, no colour change, no sound difference, no ロボ reaction, no retry prompt.
- One gap choice per 「いいえ」. No re-ask loop.

Whether the target gap should later highlight a card is a separate decision and is **not in scope for WO-03**.

---

## 6. Bread content — both layers

Provided so WO-03 can be implemented and tested without the implementer inventing pedagogical content. All strings are Stage 2 draft and still require Gate 2 native review, like any child-facing line.

### Layer 0
`robotSays`: 「イーストが はたらくからだよ。」

```jsonc
"gap": "イーストが はたらく しくみが わからない",
"gapDistractors": [
  { "text": "なにが パンを ふくらませるのか わからない", "kind": "answered" },
  { "text": "ポン太の パンが ぺちゃんこだった りゆうが わからない", "kind": "other-layer" }
]
```

- **answered** — the line names イースト as what does the work. A child who read it eliminates this.
- **other-layer** — genuinely unresolved, but it is the *mission's* question, not what this line left open. It is answered only at the ねっこ. This teaches the distinction between "what is still unknown overall" and "what did this answer leave out," which is the diagnostic skill itself.

### Layer 1
`robotSays`: 「イーストが さとうを たべて、ガスを 出すんだ。」

```jsonc
"gap": "出た ガスが パンを ふくらませる しくみが わからない",
"gapDistractors": [
  { "text": "イーストが なにを たべるのか わからない", "kind": "answered" },
  { "text": "イーストが はたらく しくみが わからない", "kind": "other-layer" }
]
```

- **answered** — the line says さとう。
- **other-layer** — this is layer 0's target verbatim, now resolved. Deliberate reuse: a child tracking the chain recognises 「それは さっき わかった」. This is the clearest possible instance of the `other-layer` kind, and it is why cross-layer string reuse is permitted by lint rule 3.

Kanji check: 太 (G2), 出 (G1) are the only kanji, both bare-legal at Stage 2. All strings are under 35 characters.

---

## 7. What this decision does not settle

- Highlighting or filtering the hand from the gap choice — out of scope.
- Whether gap icons are pictorial or textual at Stage 2 — a UI decision for WO-03, with no schema consequence.
- Hiding the gap step at higher rungs — WO-04 territory.
- ~~The f4 move assignment, still with the architect.~~ **Status clarification (WO-03 resume amendment):** this note was stale by the time WO-03 resumed. `f4`'s move was already resolved and accepted in WO-01 — `f4` is `follow-naze` (commit `7e7f95f`). Not reopened or modified by WO-03.
