# Spec v0.5 — ナゼホリ（仮） Module 1, Stage 2

Owner: Dynamic Vision / Beyond Culture 獨歩文化株式会社
Status: **decisions locked 18 Sep 2026 · development kickoff 5 Oct 2026 · delivery 18 Dec 2026**
This document replaces v0.4 and folds in both research reports. It is the single source for the implementer.

### Locked decisions
1. **Launch scope:** Stage 2 (Grades 3–4), positioned on the 9歳の壁. Stages 1 and 3 follow later as updates inside the same module.
2. **Price and licence:** ¥4,980 per module, one-time. **Household licence** — every child and adult in the family, no extra fee. Future modules sold separately at the same price.
3. **Validation:** Founding Families cohort, goal 30–50 households. No broad ad test before launch.
4. **Kickoff:** development starts 5 Oct.
5. **Policy and curriculum alignment:** the product is framed as a supportive tool that follows national education directions — MEXT's generative-AI guideline, 探究的な学習, and 思考力・判断力・表現力 — never as a disruptive novelty (section 1A).

### Changes from v0.4
- Audience narrowed from "Grades 4–6" to Stage 2; missions recalibrated (4 slots, 4 follow-up moves, depth 3)
- `tier` added to the data model; topic-spine content layout
- New section 6: build-time content pipeline with two human gates
- Validation section rewritten around the cohort; ad test removed
- Deck resized to 45 cards; content bank of free-dig topics added
- Timeline rebuilt from a 5 Oct start (section 12) — **read the schedule warning there**
- LP: grade-specific door, AI-school price anchor, co-learning in the hero
- **New pillar 7 and section 1A:** policy and curriculum alignment map, wording rules, placement

---

## 1. Product pillars (design checks for every screen)

1. **North star — 深掘り: never stop at the first answer.** Ask, get a shallow answer, probe again, layer by layer, to the ねっこ. A mission that can be finished with one question fails this check. (Internal terms: 追問, first principles. Never customer-facing.)
2. **Same starting line.** The parent is a co-learner. No answer keys for adults. Best-evidenced pillar: most parents report they cannot teach this.
3. **Game, never schoolwork.** No drills, tests, red crosses or scores. Weak questions produce funny consequences.
4. **Closed and safe.** No LLM at runtime. No free-text input in the child flow. No PII in the app.
5. **Solo-completable.** Co-play is rewarded, never required. (Most mothers work; parent time is scarce.)
6. **Two voices.** Parent surfaces say "thinking-training course". Everything under `/play` is a game.
7. **With the national direction, not against it.** Every parent-facing claim can be traced to the alignment map in section 1A and obeys its wording rules. Alignment language lives on parent surfaces only; no curriculum vocabulary ever appears under `/play` (pillar 3 still rules there).

---

## 1A. Policy and curriculum alignment

### Alignment map (the only basis for parent-facing claims)

| National direction | Status | Where the product meets it |
|---|---|---|
| **思考力・判断力・表現力** — one of the three pillars of 資質・能力 in the current 学習指導要領 | In force | たのむ = 表現 (put a question into words) · ほる = 思考 (probe causes layer by layer) · 「これでOK」 and the ねっこ = 判断 (is this answer enough?) · teach-back = 表現 |
| **探究的な学習** cycle in 総合的な学習の時間, which starts in **Grade 3**: 課題の設定 → 情報の収集 → 整理・分析 → まとめ・表現 | In force | Module 1 = 課題の設定 + 情報の収集 · Module 2 = the checking side of 整理・分析 · Module 3 = the structuring side of 整理・分析 · teach-back and the 自由研究 sheet = まとめ・表現. The three-module roadmap *is* the inquiry cycle |
| **情報活用能力** as a foundation for learning, including 情報モラル | In force | ひみつカード traps (privacy as a reflex) · "an answer is not the end" as an information habit |
| **生成AIの利活用に関するガイドライン Ver.2.0** (Dec 2024): human-centred principle — AI output is one reference, the human judges and takes responsibility; careful stance on direct use by young children | In force (guidance for schools; not binding on homes) | The core mechanic trains exactly this: never accept the first answer · children never touch a live AI · the one real-AI session is parent-supervised on the parent's account |
| **Next 学習指導要領**: an information domain inside 総合 from Grade 3, including the nature of generative AI | **Proposal (Jul 2026), under discussion** | Supports a 先取り message — phrased only as 「検討されています」 |

Stage note: 総合 and 探究 begin in Grade 3, so these claims fit Stage 2 and 3. A future Stage 1 must use 生活科 language instead.

### Wording rules

**Allowed (draft, pending native and legal check):**
- 「学習指導要領がめざす『思考力・判断力・表現力』の育成に沿って設計しています。」
- 「文部科学省の生成AIガイドライン（Ver.2.0）の考え方 —— AIの答えは参考のひとつ、最後に判断するのは人 —— を、あそびにしました。」
- 「3年生から始まる『探究的な学習』の最初の一歩、『問いを立てる』『調べて深める』を家庭で。」
- 「次の学習指導要領では、3年生からの情報教育の充実が検討されています。」

**Never:** 文部科学省 推奨 / 認定 / 公認 / 準拠 / 監修 · 教科書準拠 · the MEXT logo or any layout implying endorsement · 「必修化」 or 「決定」 for what is still a proposal · 「成績が上がる」 or any school-performance promise.
Reason: no such endorsement exists, overstated claims risk 景品表示法 (優良誤認), and a challenged claim would destroy exactly the trust this rule is meant to build. Include this wording in the one professional legal check already planned.

### Where it appears
1. **LP** — a calm section below the fold, 「学びの方向性との対応」: the alignment map as a simple three-row graphic with source links. Not the hero: every 通信教育 claims curriculum alignment, so it reassures but does not differentiate or sell on its own.
2. **保護者ハンドブック** — one page: 「このゲームと、学校の学びのつながり」, plus how to mention it to a class teacher for 自由研究.
3. **Press pitch and note article** — frame as *supporting* the national direction at home: 「学校で始まるAI時代の学びを、家庭で先に、安全に」.
4. **Juku flyer** — one line on 思考力・判断力・表現力; juku owners respond to curriculum language.
5. **Optional, cheap credibility:** one short signed comment from a practising teacher or juku owner (推薦コメント, not 監修). Skip if it costs schedule.

### Maintenance
Re-check the guideline version and the status of the curriculum proposal before every public release and update the 「検討されています」 sentence when the status changes.

---

## 2. Roadmap

| Module | Parent-facing name | Trains | Status |
|---|---|---|---|
| M1 | 質問力・深掘り力 | **Ask and dig** — frame a question, then probe the *subject* deeper | This release |
| M2 | 見直し力 | **Check and fix** — diagnose a bad *output*, change one thing, verify, know when to stop | Later, ¥4,980 |
| M3 | 整理力 | **Map** — concepts, parts, rules, exceptions | Later, ¥4,980 |

Boundary rule: fact-verification and prompt-repair stay out of M1.

Stages inside each module: **Stage 1** (G1–2) · **Stage 2** (G3–4, launch) · **Stage 3** (G5–6). New stages are free updates to owners of that module. Do not advertise "Grades 1–6" until at least two stages exist; future stages appear on the LP only as 「予定」 in the roadmap section.

---

## 3. Stage 2 design limits

| Dimension | Stage 2 rule |
|---|---|
| Kanji without ruby | Grade 1–2 kanji (240) |
| Kanji allowed | up to Grade 4, ruby on everything above Grade 2; nothing above Grade 4 |
| Max sentence length | ~35 characters |
| たのむ slots | 4 core: なにを / なぜ / だれに / どんな形で |
| 追問 moves | 4: なぜ？ / たとえば？ / つまり？ / ほかには？ |
| Dig depth | 3 layers + ねっこ (boss: 4) |
| Hand size | 3–4 cards, exactly one `deepen`, one plausible `sideways` |
| Topics | Everyday science, how things work, simple 社会. No health advice, body image, disasters, religion, politics, contested science |
| Session | 10–12 min |
| ひみつカード traps | from mission 1-5 |

Reserved for Stage 3: power-up slots (だれのために / じょうけん / おてほん), moves どうしてそういえるの？ and もし〜なら？, depth 4–5.

The kanji and ruby rules are enforced by lint, driven by the validated 1,026-character grade table from the SENJI repo.

---

## 4. Module 1 · Stage 2 content

### 4.1 Two phases per mission
1. **たのむ** — build the first question from slot cards. ロボ answers correctly but **shallowly**.
2. **ほる** — cross-section-of-earth screen. Pick a 追問カード. A `deepen` card moves one layer down; `sideways`, `repeat`, `offtopic` get a flat or funny reply and another try. ふかさメーター: 1 → 2 → 3 → ねっこ.

**Temptation button:** 「これでOK」 is always visible. Tapped early, ポン太 asks a "でも、なんで？" the shallow answer cannot cover, and the player returns to dig.

### 4.2 Story missions

| # | たのむ | ほる | Co-play |
|---|---|---|---|
| 1-1 **FREE** | なにを | なぜ？ · 2 layers | よそうバトル ×2, teach-back |
| 1-2 | なぜ (goal) | たとえば？ · 2–3 layers | よそうバトル |
| 1-3 | だれに (role) | なぜ？ + たとえば？ mixed · 3 layers | Teach-back |
| 1-4 **Mid-boss** | どんな形で · full 4-slot build | Free choice of moves · 3 layers · **adult-trap topic** (なぜ冬は寒い？) | ふたりミッション |
| 1-5 | 4 slots, harder scene · ひみつ traps begin | つまり？ · 3 layers | よそうバトル |
| 1-6 | 4 slots | ほかには？ · 3 layers | おうちトーク |
| 1-7 | 4 slots | 「どのカードで掘る？」 choose the right move for the situation · 3 layers | よそうバトル |
| 1-8 **Boss** | Full recipe, traps in hand | All four moves · 4 layers · player chooses the path | ふたりミッション: alternate layers |

### 4.3 ナゼホリ bank (free-dig topics)
Short digs the family picks in any order; dig phase only. **12 at launch, 24 by end of February** as a free update. Total launch content: 20 digs, ~70 factual claims.

### 4.4 The kit (what the buyer receives)
8 story missions + bank · 45-card printable deck with analog game · 保護者ハンドブック PDF (three rules, one question per mission, no answer keys, one page linking the game to school learning per section 1A) · おとな版1分メモ · 質問レシピシート and 親子認定証 · guide sheet for one parent-supervised real-AI session on the parent's own account.

**Honest limit:** in the app children *select* follow-ups; they *compose* them only in the card game and the real-AI session. The handbook must push both.

---

## 5. Mission 1-1 — 「パンは なぜ ふくらむ？」

~10 min. Must show the north star inside the free trial.
Cast: ロボ（仮）, 6 expressions · ポン太, tanuki child at a bakery. 2 static backgrounds. 5 SFX, no BGM.

| Step | Screen | Notes |
|---|---|---|
| 0 | Profile | Avatar + preset nickname + stage (default 2). "おうちの人もいっしょ？" はい / ひとりであそぶ |
| 1 | Story, 3 panels | ポン太's bread came out flat. Player is ロボ's trainer |
| 2 | たのむ — なにを, 3 cards | **よそうバトル 1.** Vague card → random bread trivia. Clear card → 「イーストが はたらくからだよ」 |
| 3 | Temptation | 「これでOK」 → ポン太: 「イーストって なにしてるの？」 → dig |
| 4 | ほる 1 | なぜ？ deepens → yeast eats sugar, makes gas |
| 5 | ほる 2 | **よそうバトル 2:** which card digs deepest? → gas trapped in stretchy dough → **ねっこ** |
| 6 | きょうのコツ | 「さいしょの こたえで とまらない。もう一問。」 |
| 7 | おしえてあげようカード | Child explains to parent why the bread was flat. 「なるほど！」 → ふたりスタンプ. 「あとでやる」 always available |
| 8 | おうちトーク | 「きょう『なんで？』って もう一回 きけばよかったこと、あった？」 |
| 9 | Handoff → parent screen | Parent voice: kit contents, sampler, ¥4,980, household licence, founders' bonus, 30-day guarantee, delivery date, buy button, 月額なし |

Feedback language: never 正解 / 不正解. Flat replies are ロボ being unhelpful: 「うーん、さっきと おなじ こたえに なっちゃった。」

---

## 6. Build-time content pipeline

AI drafts, classifies and formats. **AI never approves.** Files in git; git history is the audit trail. Nothing here runs at runtime.

```
/pipeline
  01_research.ts    topic → facts.yaml  (atomic claims + source URL + supporting excerpt)
  02_crosscheck.ts  a different model re-verifies each claim against its source → flags only
  ── GATE 1: founder approves each claim (status, by, date) ──
  03_render.ts      approved claims → stage mission JSON
  04_lint.ts        deterministic, build-breaking
  05_entail.ts      LLM check: each robot line says only what its claim IDs support → flags
  tag_audit.ts      second model classifies follow-up cards blind; mismatches flagged
  ── GATE 2: native-speaker review per batch (stamp recorded in file) ──
/modules/m1/topics/<topic>/facts.yaml, s2.json   (s1.json, s3.json later)
```

Rules:
- **Gate 1 approves language-neutral claims**, written in the founder's strongest language with sources. Japanese child-level wording is judged only at Gate 2.
- Every claim is checked against at least one adult-level source; child-level sources serve as style reference. Facts only — explanations are never copied.
- `03_render` refuses unapproved claims and may introduce no factual statement absent from `facts.yaml`. Every `robotSays` line carries claim IDs or the tag `nonfactual`.
- `04_lint`: schema · kanji-grade and ruby rules · sentence length · exactly one `deepen` per hand · valid tags · banned-word and PII-word lists · claim-ID traceability.
- One topic = one fact chain, rendered per stage (Stage 2 uses claims 1–3 of ~5). Truncation is not always valid simplification; topics that do not survive it get a separate framing or are dropped for that stage.
- The printable deck is generated from the same JSON.

**Pilot (first two weeks):** 5 topics at Stage 2. Log minutes per step and errors caught at each gate. If lint + entailment catch under ~70% of what the human finds, fix prompts before scaling. Planning assumption: ~105 human minutes per topic; ~35 hours for launch content.

**Biggest schedule risk:** distractor quality (is the sideways card tempting but fair?). Only playtests with children answer it — founder families are the playtesters.

---

## 7. Architecture

**Principle:** content-as-data. A module is a folder of JSON and assets. No plugin loader, CMS, backend, accounts or cross-device sync.

**Stack:** Vite + React + TypeScript, static, Cloudflare Pages (or equivalent). `/` LP · `/play` app · `/print/deck` cards. Checkout via the existing Shopify store (Shopify Payments, KOMOJU for PayPay, PayPal). Cookieless analytics with custom events; no ad pixels under `/play`.

```
/src
  /engine        state machine, profile store, entitlement check,
                 archetype resolver, ruby renderer, analytics wrapper
  /ui/Card.tsx   one card component for app and print deck
  /templates     slot-assembly · dig · prediction-battle · handoff
                 (later: diagnose-fix for M2, map-builder for M3)
  /print/deck
  /modules/m1
    module.json  id, titles, sku, stages, card types, mission order, free ids
    deck.s2.json
    /topics/<topic>/facts.yaml, s2.json
    /assets
  /lp
/pipeline
/docs/spec-v0.5.md
```

**Extensibility rules (review-enforced):** engine never imports module content by name · a template implements `render(missionData, ctx)` → `onComplete(result)` · storage keys namespaced by module, schema-versioned · child-facing strings only in module JSON · card types declared per module and stage.

**Mission shape:** a sequence of phases.

```json
{
  "id": "m1-s2-1-1", "stage": 2, "sources": ["facts.yaml#c1", "facts.yaml#c2", "facts.yaml#c3"],
  "phases": [
    { "template": "slot-assembly", "slots": ["what"], "cards": [ ... ],
      "rules": [ { "when": { "what": "vague" }, "archetype": "VAGUE_WHAT" } ],
      "archetypes": { ... }, "predictions": [ ... ] },
    { "template": "dig",
      "layers": [ { "robotSays": "...", "claims": ["c1"],
                    "hand": [ { "id": "f1", "text": "...", "tag": "deepen" }, ... ],
                    "replies": { "sideways": "...", "repeat": "...", "offtopic": "..." },
                    "earlyOk": { "challenger": "ポン太", "asks": "..." } } ],
      "root": { "robotSays": "...", "claims": ["c3"], "label": "ねっこ" } }
  ]
}
```

Resolvers match on **tags, not card ids**. Only `deepen` advances, so content grows linearly. Ruby markup: `{漢字|かんじ}`.

**Local state (no PII):**
```
localStorage["m-app.v1"] = {            // brand-neutral key
  profiles: [{ id, avatarId, nicknameId, stage, progress: { [missionId]: { done, stamps, coop } } }],
  entitlements: ["m1:free"], founder: false, abVariant: "A" | "B"
}
```
Up to 6 profiles; avatar and nickname from preset lists; `stage` is a number, never a grade or birthday, switchable any time. All storage access in try/catch. Progress is per device — say so in the FAQ.

**Household licence / entitlements:** Shopify order → email with a **family code** → `/play/unlock` → one Cloudflare Worker + KV maps code → module ids, counts activations (soft cap 5 devices). Parent email lives in Shopify only. Founder codes set `founder: true` (badge).

**CI gates (build-breaking):** no LLM/API hosts in the bundle · no text inputs or `contenteditable` under `/play` · no hard-coded child-facing copy · no mission with unapproved claims or missing review stamp.

---

## 8. 質問カード deck — Stage 2, 45 cards

Poker size, 9 per A4, 5 sheets, cut lines. Colour + icon + corner shape per type (works in black and white). Generated from `deck.s2.json` via `/print/deck`. Full ruby per Stage 2 rules.

| Type | Count |
|---|---|
| おだい (situations / questions to dig) | 10 |
| Core slots ×4 (2 pre-filled + 1 blank each) | 12 |
| 追問カード ×4 moves (3 each) | 12 |
| ひみつ (traps) | 4 |
| ロボのリアクション | 3 |
| あそびかた | 2 |
| Blank | 2 |

**「ほりさげゲーム」:** Trainer draws an おだい, builds a first question, reads it aloud. The ロボ player answers literally and briefly. Trainer plays a 追問カード and asks the follow-up **in their own words**; repeat for three layers. When the ロボ player — often the parent — says 「わからない」, that is today's ねっこ candidate: look it up together. Swap roles. Optional finale: put the same chain to a real AI on the parent's account.

**Sampler (free, 9 cards):** 2 おだい, 2 slot, 3 追問, 1 reaction, 1 rules. **Founders' bonus sheet:** 9 「冬休みスペシャル」 おだい.

---

## 9. Pricing and licence

- **¥4,980 (tax incl.), one-time, per module.** One price, shown once. No struck-through prices. Promotions, if ever, are Shopify discount codes outside product logic.
- **Household licence:** all children and adults in the family.
- **30日間返金保証**, stated beside every price. Pre-orders refundable any time before delivery and for 30 days after.
- Pre-order is an ordinary Shopify listing with delivery date and guarantee. Nothing pre-order-specific in code.
- Do not pre-sell Modules 2–3 or future stages.
- Price-box anchor line: **「AIスクール1か月分より安く、家族みんなで、買い切り。」** The price holds in a course frame (kids' AI schools run ¥7,500–22,000/month) and is high in a game frame (Nintendo's buy-once learning game is ¥2,980), so the parent must always read "course".

---

## 10. Landing page (parent voice)

Door: **小学3・4年生向け**. Calm, premium, generous white space; screenshots supply colour.

Headlines A/B (random, persisted, sent with every event):
- **A:** 「AIの答えで終わる子」から、「もう一問、深掘りできる子」へ。
- **B:** 親子で、同じスタートラインから。AI時代の「深掘り力」を育てる。

Sub-head (both, carries the other motive): 3・4年生の「なぜ？」が深くなる時期に。保護者も一緒に学べる思考トレーニング。子どもにとっては、ただ楽しいゲームです。

Sections: 1 Hero (CTA 無料でミッション1を体験する; secondary 創設ファミリーとして申し込む ¥4,980) · 2 **Grade-band picker** (1・2年 / 3・4年 / 5・6年 — everyone may play; the pick is logged as demand data for later stages) · 3 現状 — children already use AI for schoolwork; parents' top worry is thinking ability; most parents say they cannot teach it (cite surveys) · 4 身につく力 — one picture: 問う → 浅い答え → もう一問 → ねっこ · 5 親子で — よそうバトル, teach-back, ほりさげゲーム, the winter adult-trap · 6 届くもの — the kit, itemised · 7 安心設計 — 本物のAIには接続しません (a simulator; say so) · 文字入力なし · 個人情報の入力なし · 広告なし · 7A 学びの方向性との対応 — alignment map per section 1A, with source links and the allowed wording only · 8 これから — modules and stages, 「予定」 only · 9 価格 — price box per section 9 + 創設ファミリー特典 · 10 FAQ · 11 Footer — 特商法, privacy, company.

Wording rule: 深掘り / 「なぜ？」を重ねる / 本質にたどりつく. Never 追問 or 第一性原理. Tone: a supportive companion to school learning — never "schools can't teach this" or "disrupting education". All policy claims follow section 1A.

---

## 11. Validation — Founding Families cohort

**Goal: 30–50 paying households with a Grade 3–4 child.** Offer: ¥4,980 with guarantee; missions as they are finished (weekly drops), bonus card sheet, 創設ファミリー badge. In return: a 10-minute written feedback form after missions 2 and 5. They are also the playtesters for distractor quality.

**Recruiting (written, warm):** one-page flyer forwarded by juku owners already in contact · note article + X/Threads posts for G3–4 parents · parent communities · referrals from each joining family · **press pitches** to outlets that covered the 2026 parent-AI surveys (リセマム, こどもとIT, コエテコ, 日経xwoman), angle: 「保護者の6割が『教えられない』— 親子で同じスタートラインから」, framed as supporting the national direction at home (section 1A), not as a challenge to schools.

**Planning arithmetic (assumption):** 30 payers ≈ 200 families playing 1-1 ≈ 800 warm invitations. Five juku yield roughly 1–3 buyers. Research estimate of a realistic outcome without an existing audience: 5–15. The goal stands as decided; the tiers below define what each outcome means. **Publish the first note article before the cohort opens.**

| Paying families at the gate | Meaning | Action |
|---|---|---|
| ≥ 30 | Goal met | Public launch 18 Dec with press push |
| 10–29 | Product evidence, demand unproven | Deliver to founders on 18 Dec; soft public launch; fix the message before any spend |
| < 10 | Weak | Deliver or refund founders; stop further stages; rethink positioning |

Also read: invited-who-play → pay (≥ 15% good, < 5% bad) · buyers finishing 1-1 to 1-3 within two weeks of release (≥ 60%) · sessions with a parent prediction (≥ 30%) · `root_reached` / `m1_start` (≥ 50%) · refunds (≤ 10%) · grade-picker split · A vs B.

**What this does not measure:** whether strangers pay, and what a customer costs. First cold-traffic data comes in January. At ~¥100 per click, ads pay back on one module only above ~2% visitor-to-purchase; organic, press and SEO are the launch channel.

**Analytics events:** `lp_view` `grade_pick` `cta_play_click` `cta_buy_click` `deck_sample_download` `m1_start` `coop_selected` `prediction_made` `round_complete` `early_ok_tapped` `dig_layer_reached` `root_reached` `teachback_done` `teachback_skipped` `m1_complete` `parent_screen_view` `buy_click_from_app` — all with `abVariant`. Orders from Shopify.

---

## 12. Plan from a 5 Oct kickoff

⚠ **Schedule warning.** In v0.3–v0.4, 5 Oct was the day the test went *live*, after a build starting 21 Sep. Starting development on 5 Oct moves everything two weeks: the cohort cannot open before 19 Oct, the gate moves from 31 Oct to **15 Nov**, and most content must be built **before** the gate. The gate therefore decides the *public launch and later stages*, not whether Module 1 gets finished — founders who have paid are owed delivery or a refund either way. If any work can begin on 21 Sep, take the two weeks back; the pipeline pilot and mascot art are the best candidates.

| Dates | Work |
|---|---|
| (21 Sep–4 Oct, optional head start) | Appoint native reviewer · J-PlatPat + domain check on the name · mascot art · pipeline pilot on 5 topics · first note article |
| **5–18 Oct** | Engine, slot-assembly, dig, prediction battle, handoff, profile + stage, `Card.tsx`, print sampler, CI gates, LP with picker and A/B, analytics, Shopify listing, 特商法 / privacy pages · Mission 1-1 content · native review of 1-1 and LP |
| **19 Oct** | Cohort opens |
| 19 Oct–15 Nov | Recruiting · weekly drops: 1-2 (26 Oct), 1-3 (2 Nov), 1-4 (9 Nov) · in parallel: bank digs 1–6, family-code Worker + KV, deck cards |
| **15 Nov** | **Gate** (section 11) |
| 16 Nov–6 Dec | Missions 1-5 to 1-8 · bank digs 7–12 · 45-card deck + bonus sheet · handbook, おとな版メモ, 認定証 · 3 automated emails |
| 7–13 Dec | Native review of everything · fact-gate audit · fixes from founder feedback |
| 14–17 Dec | Buffer |
| **18 Dec** | Delivery: family codes to founders; listing switches to 販売中; press release |
| Jan–Feb 2027 | +12 bank digs (free) · small cold-traffic CAC measurement |
| Spring 2027 | Stage 3, rendered largely from existing fact chains · decide Stage 1 on evidence |

**If the schedule slips, cut in this order:** bank digs 12 → 8 · おとな版メモ → January · automated emails → manual. Never cut: native review, fact gate, founder playtests.

### First tasks for the implementer
1. Scaffold the repo per section 7; commit this spec to `/docs`.
2. CI gates first.
3. `Card.tsx` and ruby renderer with snapshot tests; kanji lint wired to the grade table.
4. Archetype resolver and dig state machine, unit-tested from `1-1` rules.
5. slot-assembly → dig → prediction battle → handoff, against `topics/bread/s2.json`.
6. `/print/deck` from `deck.s2.json`; verify A4 in Chrome and Safari.
7. Pipeline scripts 01–05 + tag audit; run the 5-topic pilot.
8. LP last, with real screenshots.

Spec ambiguities are escalated, not resolved by the implementer.

---

## 13. Acceptance criteria (cohort opening, 19 Oct)

- Mission 1-1 plays end to end on iPad Safari, Chrome (Windows / Chromebook) and phone, with storage blocked.
- 1-1 cannot be completed with a single question; two `deepen` moves are required.
- Dig phase is fully JSON-driven; adding a second topic needs no code change.
- A dummy `/modules/m2-test` with one new card type and a dummy `s3.json` both render without touching `/engine`.
- Every `robotSays` line in 1-1 has approved claims and a native-review stamp; all CI gates pass.
- Sampler prints correctly on A4, legible in black and white.
- LP persists A/B variant and grade pick; every event carries the variant.
- Every policy or curriculum statement on the LP matches an "Allowed" line in section 1A, links to its source, and has passed the legal wording check; no forbidden term appears anywhere.
- Purchase completes via Shopify with card and PayPay; listing shows delivery date, household licence, founders' bonus and 30-day guarantee.

## 14. Open items (owner: founder)

| Item | Needed by |
|---|---|
| **Native-speaker reviewer appointed** — earliest hard blocker | 12 Oct |
| Name: J-PlatPat (classes 9, 41), `.jp` domain, say-it-aloud test with three children | 12 Oct |
| Mascot and ポン太 art (6 + 3 expressions, 2 backgrounds) | 12 Oct |
| First note article published | 16 Oct |
| Juku flyer + press pitch drafted | 19 Oct |
| 特商法 and privacy pages for the new product | 18 Oct |
| Legal wording check: price display + section 1A policy claims (one sitting) | 16 Oct |
| Optional 推薦コメント from a teacher or juku owner | 19 Oct |
