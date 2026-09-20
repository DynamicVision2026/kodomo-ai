# WO-11 Implementation Notes — Content Classification & Commissioning

ナゼホリ（仮）· 20 Sep 2026, corrected 20 Sep 2026 (WO-11C) · Builder implementation notes

> ⚠ **This is NOT the authoritative AD-02 / AD-02A architecture decision document.** It is
> Builder's own working note, describing what the WO-11 code migration implements against the
> numbered Founder decisions transmitted in the WO-11 ticket text. It must not be cited, linked,
> or treated as if it were the Architect's own AD-02/AD-02A source.
>
> **The authoritative AD-02 and AD-02A documents are not present in this repository.** That is a
> reported dependency, not something this note substitutes for. If/when the Architect's own
> AD-02/AD-02A documents are added to the repository, this note should be reconciled against them
> or retired — and any code comment or spec passage currently citing "AD-02 §N" should be treated
> as citing *WO-11's own numbered decision list*, not a section of a document that exists here.

WO-11's ticket transmitted eleven numbered Founder decisions. This note records, decision by
decision, what the code now does — it does not add, generalize, or interpret beyond what was
explicitly stated, and it flags plainly wherever a decision was referenced by name (the T1–T6
gates) without its content being supplied.

---

## Decisions 2, 4, 5, 6 — implemented in code and covered by this note

**Decision 2 — root types.** Exactly three accepted values: しくみ / めあて / わかれ, no quotas.
Implemented as a closed set in `scripts/lib/rootType.ts` (`ROOT_TYPES`, `parseRootType`) and
enforced by `checkMissions()` in `scripts/lib/moduleClassification.ts`: any mission that declares
a `rootType` outside those three values fails `gate:claims` outright. `Mission.rootType` in
`src/engine/types.ts` is typed `string` (not a Japanese literal union) purely because
`gate:no-hardcoded-copy` reserves Japanese string literals under `src/` for module JSON content,
never engine source — the closed set itself lives in `scripts/lib/rootType.ts`, outside that
gate's scan root, where it can be a real, enforced enum. See `tests/rootType.test.ts` for the
adversarial proof that a fourth value is rejected.

**Decisions 4 & 5 — `archived` content class.** `ContentClass = 'release' | 'synthetic' |
'archived'`, declared per mission file. `archived` preserves whatever genuine Gate 1/Gate 2
approval history a mission already carries, is excluded from ongoing release-approval
requirements, is not synthetic, and must never be family-reachable — enforced by
`checkMissions()` the same way `synthetic` reachability is enforced (a production import of an
archived topic folder fails the gate). Full mechanism and rationale in the header comment of
`scripts/lib/moduleClassification.ts`.

**Decision 6 — `fact` / `practice` claim types.** `ClaimType = 'fact' | 'practice'` on each
`facts.yaml` claim (`pipeline/01_research.ts`). A `fact` claim still requires a `sourceUrl` from
the pipeline's source whitelist, a verbatim `excerpt`, and `adultLevelSource: true` — unchanged.
A `practice` claim is not forced through that source-citation path; `01_research.ts`'s
`validateDraftClaims()` only requires the source/excerpt/adultLevelSource fields for `fact`
claims. Both types still require real Gate 1 (Founder) and, for release content, Gate 2
(native-speaker) approval before `status` may become `approved` — nothing about the claim-type
split changes who approves a claim or how; it only changes what evidence a `practice` claim must
cite to reach that approval.

---

## Decisions transmitted but not implemented — deliberately

**Decision 1 — T1–T6 mandatory commissioning gates.** WO-11 states T1–T6 are mandatory gates a
future topic must pass before commissioning, but did not transmit what T1–T6 individually check.
**No T1–T6 criteria exist anywhere in this repository.** Nothing here invents them. Commissioning
C-03 (or any future release topic) against T1–T6 requires the Architect's own text for those six
gates first — this is a hard, currently-unmet prerequisite, not a detail this implementation can
infer from context.

**Decisions 3, 9, 10, 11** (bread/ice no longer release curriculum; old topic universe superseded;
no auto-grandfathering; C-03「ちゃんと」as next candidate) are product/process statements, not
schema or gate mechanics. They are reflected in `docs/spec-v0.5.md`'s supersession markers (added
alongside this note) and in the fact that bread and ice are both `archived` in this repository —
but the decisions themselves are the Founder's, not something this note or any code comment
restates as if it were independently authoritative.

**Decisions 7 and 8** (Adult Trap redefinition; questioning is not argument training) are covered
in `docs/WO-11-implementation-notes-questioning-adult-trap.md`, under the same non-authoritative
framing as this note.

---

## What would resolve this note's open dependency

The Architect's own AD-02 and AD-02A source documents, added to this repository. Until then, any
future ticket that needs T1–T6's actual criteria, or a fuller AD-02A structure beyond decisions 7
and 8, should stop and request that material rather than treat this note — or any of its
predecessor commit's now-renamed files — as a substitute.
