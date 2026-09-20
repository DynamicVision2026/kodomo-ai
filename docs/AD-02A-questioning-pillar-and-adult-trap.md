# AD-02A — Questioning Pillar & Adult Trap Redefinition

ナゼホリ（仮）· 20 Sep 2026 · Architecture decision, ships with WO-11
Scope: what "questioning" trains and what an Adult Trap is, going forward. Does not define new
Dig mechanics, UI, or content — both changes are framing/definition decisions for content
commissioning and product-pillar review, not new runtime behavior.

**Provenance note, stated once and binding for the rest of this document:** like AD-02 (see its
own provenance note), this file is the Coordinator's/implementer's write-up of two Founder
decisions transmitted in WO-11's ticket (decisions 7 and 8), written in AD-01's durable-spec form
so the repository has one place that states them. The section numbering below (§1–§4) is this
implementer's own organization of those two decisions, not a reproduction of a pre-existing
"S-1 through S-6" document — WO-11 refers to "AD-02A §4" and to applying "AD-02A S-1 through S-6"
to the spec-of-record, but no S-1–S-6 text or a fuller AD-02A source was transmitted to this
implementation. Only decisions 7 and 8 were given in full, and only those two are written up here.
If the Architect holds the complete AD-02A document with its own S-1–S-6 structure, this file
should be reconciled against it — in particular its §4 designation for the questioning-pillar
decision is chosen to match WO-11's own citation ("AD-02A §4") on the assumption that this
implementer's §4 and the Architect's are the same decision, not verified against the source.

---

## 1. Adult Trap — old definition (superseded)

Implicit in `docs/spec-v0.5.md`, an Adult Trap was a **science fact the adult might get wrong** —
the spec's own example, at its §4.2 mission table (mission 1-4), is 「なぜ冬は寒い？」, and a
second mention appears in the LP-copy planning text at §10 ("the winter adult-trap"). Both are
concrete instances of this old definition: a factual question outside most adults' immediate
recall, used to level the parent and child ("same starting line", pillar 2).

## 2. Adult Trap — new definition (decision 7, current)

> A familiar everyday rule or practice the parent follows but cannot readily explain, not a
> science fact the adult gets wrong.

This is decision 7 of WO-11, reproduced verbatim above. The distinction is the *kind* of gap the
trap exposes: not "the parent doesn't happen to know this fact" but "the parent does this every
day and has never had to put the reason into words." This is the same shift the `practice` claim
type (AD-02 §5) exists to support — a trap built on a `practice` claim doesn't need an external
citation the way the old science-fact traps did; it needs the parent to notice they've never
articulated something they do without thinking.

`docs/spec-v0.5.md`'s two old-definition passages (§4.2's mission-1-4 row, §10's "winter
adult-trap" line) are marked as superseded alongside this document, not deleted — they remain an
accurate record of what was actually built for the archived bread mission.

**Not settled here:** no new Adult Trap example under the new definition is authored by this
decision. That is content-commissioning work for a future ticket (C-03 or later), not this one.

---

## 3. Questioning is not argument training

Decision 8 of WO-11: **"Questioning is not argument training."** This is adopted as a product
pillar. No further elaboration of this sentence was transmitted with WO-11; it is recorded here at
face value rather than expanded with invented reasoning.

## 4. Product pillar (AD-02A §4)

The north-star pillar in `docs/spec-v0.5.md` §1 ("深掘り: never stop at the first answer") trains
the child to keep probing an answer. §3's one-sentence decision draws a boundary around what that
probing is *for*: the product trains a child to ask "why" again, not to win a disagreement, catch
someone out, or argue a point. A mission or dig layer that starts to read as "prove the answer
wrong" rather than "find out what's underneath the answer" is outside this pillar.

This does not change any existing Dig mechanic, gap-naming behavior (AD-01), or milestone
semantics — it is a framing constraint for how future content (and any future revision of the
existing pillars list) is written and reviewed, not a new runtime check.

---

## 5. What this decision does not settle

- Any new Adult Trap example under the new definition — future content-commissioning work.
- The full AD-02A source text and its own S-1–S-6 structure, if one exists beyond decisions 7 and
  8 — not transmitted to this implementation; §1–§4 above are this write-up's own organization.
- Any change to Dig behavior, UI, gates, or milestone semantics — none is made by this decision.
