# WO-11 Implementation Notes — Questioning Pillar & Adult Trap Redefinition

ナゼホリ（仮）· 20 Sep 2026, corrected 20 Sep 2026 (WO-11C) · Builder implementation notes

> ⚠ **This is NOT the authoritative AD-02 / AD-02A architecture decision document.** It is
> Builder's own working note recording two Founder decisions (WO-11 decisions 7 and 8) verbatim,
> for traceability from `docs/spec-v0.5.md`'s supersession markers. It must not be cited as, or
> mistaken for, the Architect's own AD-02A source, which is not present in this repository.

## Decision 7 — Adult Trap, new definition

Transmitted verbatim in WO-11:

> A familiar everyday rule or practice the parent follows but cannot readily explain, not a
> science fact the adult gets wrong.

This replaces the old, implicit definition in `docs/spec-v0.5.md` (a science fact outside most
adults' recall — the spec's own example is 「なぜ冬は寒い？」at its old §4.2 mission-1-4 row and
§10's LP-copy mention). Both old-definition passages are marked historical, not deleted, in
`docs/spec-v0.5.md`'s supersession markers, since they accurately describe what mission 1-1
(bread, now `archived`) actually shipped with.

No new Adult Trap example under the new definition is authored by WO-11 or this note — that is
future content-commissioning work.

## Decision 8 — "Questioning is not argument training"

Transmitted verbatim in WO-11: **"Questioning is not argument training."** WO-11's own ticket
text cites this as "AD-02A §4" and asks that it be "adopted as a product pillar." No further
elaboration of the sentence, and no fuller AD-02A document containing an actual §4, was
transmitted with WO-11 — this note records the one sentence given, at face value, without
inventing supporting rationale, and flags that the citation "AD-02A §4" refers to a document this
repository does not hold.

**What this constrains, in plain terms:** the existing north-star pillar in `docs/spec-v0.5.md`
§1 ("深掘り: never stop at the first answer") trains a child to keep probing an answer. Decision 8
draws a boundary around what that probing is for — finding out what's underneath an answer, not
winning a disagreement or proving someone wrong. This is a framing constraint for future content
review, not a change to any existing Dig mechanic, gap-naming behavior, or milestone semantics.

## Open dependency

The Architect's own AD-02A document — if it exists with an actual §1 through §6 (or whatever its
real structure is) beyond these two decisions — is not present in this repository. A future
ticket needing more of it than decisions 7 and 8 should request that material rather than treat
this note as a substitute.
