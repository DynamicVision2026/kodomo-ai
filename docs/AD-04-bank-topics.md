# AD-04 — Accepted Bank topic library (restored, WO-20 Phase 1)

**Status correction:** WO-19's own audit (`docs/v0.6-mission-bank-queue.md`) reported that no
AD-04 document existed anywhere in this repository, and offered a clearly-labeled *proposed, not
accepted* 12-topic candidate list in its place. That audit was accurate as far as this
repository's own history went — AD-04 was a real accepted product decision that had simply never
been persisted here. WO-20 Phase 1 restores it as source of truth. The WO-19 proposed list is
superseded by the accepted list below and should not be used.

## Accepted root-type distribution (full 20-topic AD-04 library)

- **13** total めあて
- **7** total わかれ
- **0** total しくみ

This distribution describes the FULL 20-topic library, of which the 12 below are Bank-12 (the
launch set). Root types below follow each topic's own accepted inquiry landing point, not a
per-subset quota — see WO-19's own critical rule ("do not manufacture quotas per subset"). The
12 topics below land on 7 めあて and 5 わかれ; this is consistent with, not identical to, the
13:7 ratio across the full 20, since the remaining 8 library topics (13-20) are not part of
Bank-12 and are out of scope for this sprint.

## Bank 12 (launch set)

| ID | Topic | Root type | Domain | Special caution |
|---|---|---|---|---|
| B01 | 「あとで」って、いつ？ | わかれ | ことば | — |
| B02 | エスカレーターでは、片側をあける？ | めあて | 社会とひと | Regional variation + sourced factual component — see below |
| B03 | じゃんけんで順番を決める | めあて | 社会とひと | — |
| B04 | チームをどうやって分ける？ | わかれ | 社会とひと | — |
| B05 | 4月1日と4月2日で、どうして学年が変わる？ | めあて | 社会とひと | Early-born / school-year factual sensitivity — see below |
| B06 | 同じお菓子なのに、お店によって値段がちがう | わかれ | 日常 | — |
| B07 | 「きれいにしなさい」の「きれい」って？ | めあて | ことば | — |
| B08 | みんなが持っているものが、ほしくなる | わかれ | 社会とひと | — |
| B09 | 同じ言葉なのに、言う人によってちがって聞こえる | わかれ | ことば | — |
| B10 | 「いただきます」は、だれに言っている？ | めあて | 社会とひと | Keep secular, ordinary-child framing; native review required — see below |
| B11 | 買ったのはこっちなのに、どうしてお店の人が「ありがとう」と言う？ | めあて | 社会とひと | — |
| B12 | ひろった100円は、だれのもの？ | めあて | 社会とひと | Moral-instruction risk + sourced factual component — see below |

Total: 7 めあて, 5 わかれ, 0 しくみ.

## Special cautions (as given, applied in each topic's authored content)

- **B02** — the "always keep one side open" escalator convention is NOT nationally universal in
  Japan (it varies by region — famously reversed between Kanto/Kansai in real life) and touches a
  real, sourceable practice. B02's `facts.yaml` marks its regional-variation claim as `type: fact`
  with an evidence slot flagged `status: pending-factual-verification` rather than asserting a
  specific region's convention as universal — see B02's own facts.yaml.
- **B05** — the April 1/2 school-year cutoff is a real, sourceable legal/administrative fact
  (Japan's School Education Act enrollment-age counting convention), and early-born children can
  find this topic personally sensitive. B05's content stays in "why does a system need a cutoff
  line at all" territory, never framing any individual child's birth date as advantageous or
  disadvantageous.
- **B10** — 「いただきます」has a real etymological/religious-adjacent history (gratitude toward
  the process of eating, sometimes linked to Buddhist-influenced custom); B10 is authored to stay
  strictly secular and describe it as an ordinary, widely-practiced expression of gratitude
  said before eating — never invoking a specific religious framework, doctrine, or requirement.
  Native-speaker (酒井先生) review is treated as required, not optional, for this topic
  specifically, flagged again in the Gate 2 package.
- **B12** — lost money raises real moral-instruction risk ("you must always turn it in because
  it's right") and touches a real, sourceable practice (Japan's lost-and-property law / the
  koban system). B12's root avoids moralizing the child's own future behavior and instead lands
  on the structural purpose of a lost-and-found system existing at all (so an owner can be found)
  — descriptive, not prescriptive. Any factual claim about the legal system itself is marked
  `type: fact`, `status: pending-factual-verification`, never asserted as verified from an
  invented source.

## Claim-type policy for AD-04 content (WO-20 Phase 1)

- **practice** claims (the majority): commonly-observed customs/explanations, hedged exactly as
  every accepted Story Mission claim already is ("a common explanation," never "the one true
  reason"). These never require an external source URL.
- **fact** claims (B02's regional variation, B05's cutoff-date system, B12's lost-property
  convention): where an external factual/legal claim is asserted, the claim is recorded with
  `status: pending-factual-verification` and an explicit evidence-slot field rather than a
  fabricated source URL — this status is distinct from `pending` (awaiting Founder approval of
  wording) and must be resolved by an actual sourced citation before Gate 1 can pass for that
  specific claim, in addition to ordinary Founder approval.
