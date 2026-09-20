# WO-21 Factual Verification — resolved

**Status:** RESOLVED (WO-21 Phase 6, 2026-09-20). All 3 claims below now carry a real, checkable
source and `status: approved` in their own `facts.yaml`. This file is referenced from the header
of every WO-20-batch `facts.yaml` (5 story missions + 12 Bank Digs) so a reader who follows that
reference always finds the real, current status — never a stale or fabricated one. `gate:claims`
(both normal and `RELEASE=1` mode) now passes clean for all 20 release topics.

## Rule

A claim listed here gets a real, checkable, attributable source before its `status` changes from
`pending-factual-verification` to `approved`. No source is invented to close a claim faster. If no
reliable source exists, the claim stays pending indefinitely rather than being approved on a
guess. Only the minimum wording necessary to make a claim accurate is changed — the accepted
inquiry design (the Dig's questions, moves, and root) is never reopened for this.

## Resolved claims

### B02 — bank-escalator, claim c3
**File:** `src/modules/m1/topics/bank-escalator/facts.yaml`
**Claim:** which side is conventionally left open on an escalator varies by region within Japan
(e.g. Kanto vs. Kansai), rather than being one nationwide rule.
**Source:** regional custom, not law. Most regions (including Kanto/Tokyo) conventionally stand
left, keeping the right open for walkers; Kansai (including Osaka) conventionally stands right,
keeping the left open — traced to a 1967 Hankyu Railway Umeda Station platform announcement, not a
safety regulation. Corroborated across multiple independent Japanese sources (no single government
body regulates this custom, consistent with treating it as regional convention rather than
universal rule):
- [エスカレーター、関西なぜ「右立ち」（謎解きクルーズ） — 日本経済新聞](https://www.nikkei.com/article/DGXLASIH02H08_T01C14A2AA1P00/)
- [「エスカレーター」は東京と大阪で立つ位置が違うのはなぜ？ — All About](https://news.allabout.co.jp/articles/o/57791/)
- [エスカレーターの立つ位置 なぜ関東は左側で関西は右側なの？](https://jpnculture.net/escalator/)
**Wording change:** none. `bank-escalator/s2.json`'s existing child-facing text already landed on
「あける がわは、ちいきで ちがうんだね」 (which side is opened differs by region) — already
correctly framed as regional variation, not a universal rule.
**Resolved:** 2026-09-20, WO-21 Phase 6 (WebSearch).

### B05 — bank-gakunen, claim c2
**File:** `src/modules/m1/topics/bank-gakunen/facts.yaml`
**Claim:** a school system that groups children into fixed yearly grades needs some specific date
to draw the dividing line, and Japan's convention places that line at April 1st/2nd.
**Source:** a real, government-established rule, not merely informal custom. 学校教育法施行規則
第59条 sets Japan's school year as April 1 to the following March 31. Civil Code (民法) Article
143's age-counting convention means a person legally turns their next age at the end of the day
before their birthday — so a child born April 1 turns 6 at the end of March 31, making them
eligible to start school (学校教育法第17条: enrollment from the first school-year start after
turning 6) in the same April 1 school-year as children born the previous April 2 through that
March 31; a child born April 2 starts the following year's cohort.
- [4月1日生まれの児童生徒の学年について — 文部科学省 (MEXT)](https://www.mext.go.jp/a_menu/shotou/shugaku/detail/1422233.htm)
- [4月1日生まれの人はなぜ学年がひとつ上になるの？ — 大学通信キャンパスナビ ネットワーク](https://www.univpress.co.jp/university/rissho_law/4th_lecture/)
**Wording change:** none. `bank-gakunen/s2.json`'s existing child-facing text already lands on
「線を どこに 引くかは、きめごとで、きまってるんだね」 (where the line is drawn is a matter of
convention) — accurate, and consistent with this topic's own early-born-sensitivity caution (never
frames any individual child's birth date as advantageous/disadvantageous).
**Resolved:** 2026-09-20, WO-21 Phase 6 (WebSearch).

### B12 — bank-100yen, claim c3
**File:** `src/modules/m1/topics/bank-100yen/facts.yaml`
**Claim:** a real system exists in Japan (police lost-property handling, including the koban
system) for holding found items so an original owner can potentially be found.
**Source:** a real, government-established system. Japan's Lost Property Act (遺失物法) governs
how police handle found items — a finder who turns an item in to a police station or koban enables
the police to hold it while attempting to locate the original owner (a finder must report to a
facility occupant within 24 hours, or to police within 7 days, to retain finder's rights); if
unclaimed after roughly 3 months, the finder may become entitled to keep it. Corroborated by
multiple official police-agency sources:
- [落とし物について — 警視庁 (Tokyo Metropolitan Police Department)](https://www.keishicho.metro.tokyo.lg.jp/sodan/otoshimono/lost_found.html)
- [警察庁遺失届情報サイト — 警察庁 (National Police Agency)](https://www.npa.go.jp/bureau/soumu/ishitsubutsu/otoshimono/index.html)
**Wording change:** none. `bank-100yen/s2.json`'s existing child-facing text already lands
descriptively on 「もちぬしが みつかるように、あずかる しくみが あるんだね」 (there's a system
for holding it so the owner can be found) — matches the real system's actual purpose, and already
avoids legal-instruction framing ("you must..."), consistent with this topic's own
moral-instruction-risk caution.
**Resolved:** 2026-09-20, WO-21 Phase 6 (WebSearch).

## Note on source verification method

Sources above were found via WebSearch and cross-checked against multiple independent results
returned for each query (government/official pages preferred where available — MEXT for B05, the
Metropolitan and National Police agencies for B12; B02 has no single regulating body since it is a
genuine regional custom, so multiple independent journalistic sources were used instead, all
agreeing on the same substance). Direct WebFetch verification of individual pages was attempted but
blocked by this environment's network egress policy for every domain tried (government and
non-government alike); the search results themselves already returned substantive, specific,
attributable content (exact statute citations for B05, exact procedural details for B12, a
specific historical origin for B02), which is what is cited above — not a summary generated
without checking the underlying sources.
