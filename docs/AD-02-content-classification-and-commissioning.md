# AD-02 — Content Classification & Commissioning Architecture

ナゼホリ（仮）· 20 Sep 2026 · Architecture decision, ships with WO-11
Scope: what a mission file's `contentClass` means and what the gates do with it; the accepted
root-type and claim-type contracts for future content; what is superseded and what is not yet
decided. Does not itself author or commission any topic.

**Provenance note, stated once and binding for the rest of this document:** AD-02 was accepted by
the Founder as a set of numbered decisions transmitted in WO-11's ticket, not as a pre-existing
external document. This file is the Coordinator's/implementer's write-up of those decisions into
the same durable-spec form AD-01 used, so the repository has one place that states the accepted
architecture instead of only a ticket. Anywhere this document is silent or a decision was
referenced by name but not given in full (the T1–T6 commissioning gates, §3 below, are the one
case), that gap is flagged explicitly rather than invented. If the Architect holds a fuller
source document for AD-02, this file should be reconciled against it rather than treated as the
independent original.

---

## 1. Why a three-way classification, not two

WO-11's predecessor ticket introduced a fail-closed `release | synthetic` split so release content
and synthetic engine-test fixtures could never be confused by `gate:claims`. That split had no
way to represent content that is real — it passed genuine Gate 1 (founder) and, where applicable,
Gate 2 (native-speaker) review — but is no longer the release curriculum. Forcing such content into
`release` would keep it family-reachable and subject to release gates it no longer needs to answer
to. Forcing it into `synthetic` would falsify its history: synthetic fixtures must never carry real
approval, and this content genuinely was approved.

`archived` is the third value this decision adds, specifically for that case.

---

## 2. The three values

```ts
export type ContentClass = 'release' | 'synthetic' | 'archived';
```

Declared per **mission** (a Stage's `sN.json` file — see §2A on why the unit is the mission, not
the module), not per module. There is no default; an absent or unrecognised value fails
`gate:claims` outright.

| Value | Meaning | Family-reachable? | Approval requirements | Gate 1 / Gate 2 status |
|---|---|---|---|---|
| `release` | Live curriculum, shipping to families | Yes | Every `facts.yaml` claim it cites must be `status: approved`; in `RELEASE=1` (strict) mode it must also carry a native-review stamp (`mission.review.by`) | Must be real and complete before this class is truthful |
| `synthetic` | Engine/CI test fixture — exists to exercise the pipeline and gates, not to teach anything | No | Must **never** carry an approved claim or a review stamp — that would misrepresent a fixture as reviewed content | Forbidden, by construction |
| `archived` | Genuine historical content that previously passed real human gates (or, in principle, genuinely never did) but is no longer release curriculum | No | None enforced — archived content is exempt from both the release approval requirement and the synthetic no-approval requirement | Whatever it genuinely has is preserved untouched; nothing is added or removed to make it "look" archived |

`archived` is not a weaker `release` and not a disguised `synthetic`. It is its own thing:
content that is being kept as an honest historical record, not held to either bar going forward.

### 2A. Why the classification unit is the mission, not the module

The predecessor ticket classified whole modules. This decision moves the field onto each mission
file individually, for two reasons discovered while implementing it:

1. WO-11's own language is consistently about "release **topics**" — a module can, in general,
   contain missions in more than one state (this repository's `m1` module now holds two archived
   missions and, as of this ticket, zero release ones; a future module could hold a mix).
2. Module-level classification would force `src/print/deck/main.tsx`'s legitimate imports of
   `m1/module.json` (for card-type metadata) and `m1/deck.s2.json` (a generic printable sampler
   deck) to be reasoned about as "importing archived content," even though neither file is mission
   curriculum in the sense this classification governs. Mission-level classification removes that
   false positive without any change to the print entry point.

Production reachability is still checked automatically: `scripts/lib/moduleClassification.ts`
scans every `.tsx?` file under `src/` for `modules/<id>/topics/<id>/` import paths and fails the
gate if any `synthetic` or `archived` topic folder is referenced from production source.

---

## 3. Commissioning gates T1–T6 (mandatory, text pending)

AD-02 decision 1 establishes that **T1 through T6 are mandatory commissioning gates** — every
future topic (starting with C-03) must pass all six before it may be authored as `release`
content. **This document does not define what T1–T6 individually check.** Only the fact that six
mandatory gates exist, and that they gate commissioning, was given to this implementation; their
individual criteria were not transmitted in WO-11 and are not invented here.

This is recorded as an open item, not filled in with placeholder criteria, because a fabricated
T1–T6 would be worse than an honest gap: it would look authoritative to whoever commissions C-03
next. **The Architect's full T1–T6 text is a hard prerequisite for commissioning C-03** and should
be supplied before that ticket begins.

---

## 4. Root types — しくみ / めあて / わかれ

```ts
export type RootType = 'しくみ' | 'めあて' | 'わかれ';
```

Three accepted values for what a topic's ねっこ (root) resolves into. **No quotas** — a topic is
whichever type genuinely fits its causal chain; the library is not filled to a ratio across the
three. This decision does not define the three types' individual criteria beyond their names, nor
does it require any existing or future topic to declare one yet.

`Mission.rootType?` (`src/engine/types.ts`) is added as an optional field carrying this contract in
the schema. It is not read or branched on anywhere in the engine, pipeline, or gates as of this
ticket — recorded so C-03 (or whichever ticket first commissions new release content) has one typed
contract to author against, instead of inventing its own field or vocabulary.

---

## 5. Claim verification paths — fact / practice

```ts
export type ClaimType = 'fact' | 'practice';
```

- **`fact`** — a claim about how the world works. Requires the existing evidentiary path
  unchanged: a `sourceUrl` from the pipeline's whitelist, a verbatim `excerpt`, and
  `adultLevelSource: true`.
- **`practice`** — a claim stating a familiar everyday rule or practice rather than an assertion
  about the world. Does not inherently require an external source; instead it is validated by
  Founder Gate 1 and native-speaker Gate 2, the same two human gates every claim already passes,
  just without the source-citation requirement being the thing Gate 1 is checking.

`Claim.type?` (`pipeline/01_research.ts`) is added as an optional field. It is not yet enforced or
branched on by any pipeline step or gate — `01_research`'s prompt, `02_crosscheck`, and
`gate-claims-approved.ts` are all unchanged by this ticket and continue to treat every claim as
requiring the existing `fact` evidentiary path regardless of this field's value. This is
deliberate: WO-11 records the contract only ("if implementing those fields in runtime/schema now
is necessary for repository consistency, make the smallest additive change") and leaves relaxing
the source requirement for `practice` claims to whichever ticket first needs to author one.

**Discovered dependency, not resolved here:** `pipeline/01_research.ts`'s `SOURCE_WHITELIST`
(`nhk.or.jp`, `kids.gakken.co.jp`, `jma.go.jp`, `jaxa.jp`, `kahaku.go.jp`, `go.jp`, `ac.jp`,
`britannica.com`) is a list of science/education domains, tied to the old everyday-science topic
framing this decision supersedes (§6). It has not been reconsidered for `practice`-type claims,
which by definition may not need a source at all, or may need a different kind of source (e.g. a
practice's own stated rationale rather than a research citation). Left as-is pending a ticket that
actually authors a `practice` claim.

---

## 6. The old topic universe is superseded

The topic universe implicit in `docs/spec-v0.5.md` §3's "Topics" row and §4.2's mission table —
"everyday science, how things work, simple 社会" as the governing frame for what Stage 2 content
is about — is superseded by AD-02. It is not deleted from the spec (it remains an accurate
historical record of what mission 1-1's bread topic and the bank's ice topic were, and both are
now `archived` precisely so that history is kept honest), but it is no longer authoritative
guidance for what a Builder should build next. See `docs/spec-v0.5.md`'s supersession markers,
added alongside this document, at each passage this affects.

**No automatic grandfathering:** old perspective/topic ideas that existed under the superseded
framing (anything from spec-v0.5.md §4.2's mission table beyond the two topics already authored,
or §4.3's ナゼホリ bank concept) do not carry forward as pre-approved candidates. Any of them that
resurfaces as a future commissioning candidate must pass T1–T6 (§3) like any new idea — being an
old idea earns it no exemption.

---

## 7. Next release candidate

Decision 11 names **C-03「ちゃんと」** as the next release-content candidate. This ticket does not
author it, define its topic content, or run it through T1–T6 — it is recorded here purely so the
next content ticket knows what it is picking up, pending the Architect's T1–T6 text (§3).

---

## 8. What this decision does not settle

- The individual T1–T6 gate criteria (§3) — pending the Architect.
- The individual criteria distinguishing しくみ / めあて / わかれ beyond their names (§4).
- Whether/how `practice`-type claims relax the source-citation pipeline step (§5) — left to the
  ticket that first authors one.
- The `SOURCE_WHITELIST`'s fitness for `practice` claims (§5) — flagged, not resolved.
- Any change to Dig behavior, milestone semantics, or AD-01 — explicitly out of scope per WO-11's
  guardrails and untouched by this decision.
