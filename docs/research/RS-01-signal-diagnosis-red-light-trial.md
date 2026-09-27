# RS-01 — Signal Diagnosis Validation, Trial Scene 1: 赤信号 (Full Audit Report)

ナゼホリ（仮）· 27 Sep 2026 · Research record. Not a curriculum change.
Scope: one scene only. Tests whether **Question → Answer → Signal → Diagnosis → Tool → Next Question** reliably produces a natural next question. Does not design Lessons 4–6 and does not generalise beyond this scene.

## How to read this report

The report has two parts.

| Part | Label | Content |
|---|---|---|
| **Part I** | **ORIGINAL TRIAL RECORD** | The trial exactly as first run and committed (commit `b1429d4`). **Kept word for word.** Nothing in Part I has been edited, reordered or cleaned up. |
| **Part II** | **RETROSPECTIVE ANALYSIS** | Added afterwards, in response to the supplement request. Fills in the fields the original run did not record: answer depth, question origin, per-tool fit scores, criterion-level candidate scoring, two-level confidence, the special review of Q3, the formal Depth Check after A3, and the test of Q4. Where Part II disagrees with Part I, **both are shown** and the change is logged in §II.11. |

When a judgment in Part II repeats something Part I actually recorded, it is tagged **[ORIGINAL]**. Everything else in Part II is **RETROSPECTIVE ANALYSIS**, including every score the original run did not give, every candidate question it did not list, and every tool-fit rating it did not give.

---

# PART I — ORIGINAL TRIAL RECORD

*(Kept word for word from commit `b1429d4`.)*

---

## 0. Rules this trial ran under

- Every adult answer is the **first realistic answer** an ordinary Japanese parent or teacher would give an 8–12-year-old. No answer was weakened to trigger a tool.
- A surface cue is only a place to look. A snag counts only if the answer **stops working** when the child tries to use it on the original question.
- 「これでOK」 is a successful outcome, not a failure.
- Rejected paths are kept (§C) because they show what not to teach.

### Confidence rubric (restated, applied to the whole transition)

Confidence rates the whole move **Answer → Signal → Diagnosis → Tool → Next Question**, not just whether the tool label is right.

| Level | Use when |
|---|---|
| **HIGH** | The snag is clearly there. The signal comes naturally out of the answer. The tool fits strongly. The next question follows naturally and clearly moves the original inquiry forward. No clearly stronger competing diagnosis exists. The scene did not have to be bent to make it work. |
| **MEDIUM** | The question is reasonable and the snag probably exists, **but** another tool or reading is also plausible, **or** the wording or context needs refinement, **or** it is useful but not clearly the strongest next question. |
| **LOW** | Needs a lot of explanation to justify the tool. The snag feels artificial. The question drifts from the original curiosity. Another tool is obviously stronger. The adult answer looks made defective on purpose. The question is academically clever but unnatural at home. |

Curriculum classes used in §D: **GREEN** means it can be a canonical example. **YELLOW** means promising, but the wording, context or tool needs revision. **RED** means keep it out.

---

## 1. Step-by-step research record

### STEP 1

**Current question**
> 「なんで、赤信号では止まるの？」

**Current answer** (realistic parent answer)
> 「赤は『止まれ』っていう合図なの。赤のときにわたると、車が来て、ぶつかるかもしれないでしょ。あぶないからだよ。」

**What did you notice?**
The answer stacks two things: a rule (赤＝止まれの合図) and a danger reason (車が来て、ぶつかる). The danger reason rests on a link that goes unsaid: *when my light is red, cars come*. The reason is also conditional (「かもしれない」), but the rule is stated as unconditional.

**Surface cue**
「あぶない」「から」「かもしれない」

**Underlying signal**
Try using the answer on a real crossing. It works when cars are moving. It stops working the moment the child pictures a red light with **no car in sight**: the reason (danger from cars) has gone, but the rule (stop) still stands. A second, weaker signal: the child may not know *why* cars come when their light is red. That is the missing "turn-taking" link.

**Diagnosis**
1. (Main) The reason given covers fewer cases than the rule. The parent's explanation depends on an unstated condition, "a car is coming", and a child has real reasons to doubt it: empty roads exist, and children see them.
2. (Secondary, depends on the child's age) The middle step "my red = the cars' green = it's their turn" is unsaid. Many 8-year-olds cannot state it; most 11-year-olds can.

**Root of the question**
The child is really asking *what the red light is for*. If the answer is "because of danger", then a red light with no danger is a puzzle. Settling that puzzle is the difference between "red is a scary colour" and "red is a promise everyone keeps". The second is what the original 「なんで？」 was reaching for.

**Candidate tools considered**
A, B, C, D, E, F, NONE (STOP)

**Selected tool**
**C** (hidden condition behind a prediction). **D** is equally defensible, and E's move is visible too. See below.

**Why this tool**
The parent's answer is a prediction: 「わたると、ぶつかるかもしれない」. It holds only if a car is coming. The C test gives the question directly: 「うまくいくために、言ってないけど、本当じゃないといけないことは？」 → 「車が来ていること」 → 「もし来てなかったら？」. Both C conditions are met: without a car the danger reason fails, and the child has real reason to doubt the condition because empty crossings exist.

**Alternative tool(s)**
- **D**: The answer carries an implicit 「赤のときは（いつも）車が来る」. The D test 「はみだすもの、ひとつ思いつく？」 immediately gives *a red light with no cars*. There is no surface cue (no みんな／いつも), yet the test works.
- **E**: The question the child ends up asking (「車だけ来なかったら？」) is exactly E's move of toggling one factor. But E's trigger is missing, because the answer compares nothing.
- **A** on 「あぶない」: rejected. The same sentence already fills in the content (車が来て、ぶつかる). The cue is present but there is no snag.
- **B** on 「赤 → ? → 車が来る」: acceptable as a secondary branch (see STEP 2b).
- **F** (driver's seat): rejected at this step. Nothing in the answer invites it, and the child has not wondered about drivers.
- **STOP**: a genuinely valid outcome for many children. The answer is true and sufficient for everyday behaviour.

**Why rejected / why still acceptable**
C and D both produce the same question with the same wording, and neither is clearly stronger. That is evidence of overlap, not a reason to pick one arbitrarily. Both are kept.

**Candidate next questions considered**
| Candidate | Tool | Verdict |
|---|---|---|
| 「じゃあ、車が来てないときは、わたってもいいの？」 | C / D | **Selected.** This is what real children say at empty crossings. |
| 「こっちが赤のとき、車の信号は何色なの？」 | B (content) | Kept as branch 2b. Useful, but whether the snag exists depends on the child. |
| 「赤だと、なんで車が来るの？」 | B (template form) | Revised to the wording above. The template wording sounds odd to a child. |
| 「あぶないって、どういうこと？」 | A | Rejected. It was already answered in the same breath. |
| 「運転してる人から見たら、どう？」 | F | Rejected. Unprompted and adult-designed at this point. |

**Selected next question**
> 「じゃあ、車が来てないときは、わたってもいいの？」

**Why this question advances the original inquiry**
It forces the explanation to separate "danger" from "rule". Whatever the parent says next has to explain why red means stop *even when the obvious danger is gone*. That is the real content of 「なんで赤で止まるの？」.

**Confidence**
**MEDIUM**. The question itself would rate HIGH.

**Confidence rationale**
The snag is real and natural, the continuity is direct, the wording suits an 8-year-old, and nothing was manipulated. The rating drops only because the tool label is not unique: C and D fit equally well, and E's move is visible. By the rubric, "another tool is also plausible" means MEDIUM.

**Decision**
**KEEP** the question. **REVISE** how it is labelled: accept C or D.

---

### STEP 2

**Current question**
> 「じゃあ、車が来てないときは、わたってもいいの？」

**Current answer** (realistic)
> 「それでも止まるんだよ。来てないように見えても、急に車が出てくることがあるからね。それに、赤で止まるのは、きまりだから。」

**What did you notice?**
The parent gives two separate reasons. The first (急に出てくる) keeps the danger story alive. The second (きまりだから) does not depend on danger at all. The child now hears that you stop even if it is safe, because it is the rule.

**Surface cue**
「きまりだから」 (also 「急に」「ことがある」)

**Underlying signal**
Apply the answer to the case the child actually had in mind: a wide road where you can see far and truly nothing is coming. The "急に" reason weakens there. What remains is 「きまりだから」, and the child cannot yet say how *being a rule* makes you stop when the rule's own purpose seems absent. The chain is 「きまり → ？ → 車がいなくても止まる」, and the middle is missing.

**Diagnosis**
A causal gap. 「きまりだから」 is offered as a reason, but it is not yet an explanation. It is unresolved why a rule should bind in exactly the cases where its purpose seems not to apply.

**Root of the question**
This is the deepest form of the original curiosity. The child first asked why we stop. The parent's answers have now shown that stopping is not only about visible danger. The child wants to understand what makes a rule worth keeping. Without this step the child is left with "adults said so", and the original 「なんで？」 goes unanswered.

**Candidate tools considered**
B, A, D, F, NONE, plus a "source/authority" question that fits no tool.

**Selected tool**
**B** (まえのりゆうを見る)

**Why this tool**
The B test runs cleanly: 「きまり → ？ → 車がいなくても止まる」, then 「まん中を、自分で言える？」. Most 8–10-year-olds cannot. The natural question almost matches the B template (「〇〇だと、なんで△△なの？」).

**Alternative tool(s)**
- **F**: 「ぼくがわたったら、こまる人はいる？」. This applies F's diagnostic to the child's own imagined action. It is plausible, but it guesses the answer before asking the question. It becomes relevant only after the parent introduces other people (STEP 3).
- **D** on 「急に出てくることがある」: 「見通しがいい道でも？」. This repeats the STEP 1 pressure in a new form. It is valid, but it loops instead of advancing.
- **A** on 「きまり」: 「きまりって、だれが決めたの？」. This is not really A, because the meaning of きまり is clear. It is a question about the **source or authority** of the rule, and none of the six tools covers that (§E).
- **STOP**: possible for some children who accept 「きまりだから」. But for a child who asked Q2, "because it's the rule" usually leaves them unsatisfied, so STOP is the weaker reading here.

**Why rejected / why still acceptable**
F is not wrong, but here it asks the child to supply the answer rather than seek it. "Who decided?" is natural and legitimate, but it starts a new inquiry into law and history. It does not deepen *why stop*. The D loop does not add information.

**Candidate next questions considered**
| Candidate | Tool | Verdict |
|---|---|---|
| 「なんで、あぶなくないときも、きまりを守るの？」 | B | **Selected.** Natural, clear to an 8-year-old, and aimed at the real gap. |
| 「きまりだと、なんで車がいなくても止まるの？」 | B (template) | Acceptable but stiffer. The same move. |
| 「きまりって、だれが決めたの？」 | NONE (source) | Natural, but a new inquiry. Logged in §C. |
| 「見通しがいい道でも、急に来るの？」 | D | A loop. Rejected. |
| 「ぼくがわたったら、だれかこまるの？」 | F | Premature. Rejected at this step. |

**Selected next question**
> 「なんで、あぶなくないときも、きまりを守るの？」

**Why this question advances the original inquiry**
It asks for the missing link between "rule" and "stopping". The answer will explain what a traffic signal *is*: a shared promise that only works if everyone keeps it every time. That is the fullest answer to 「なんで赤で止まるの？」.

**Confidence**
**HIGH**

**Confidence rationale**
The snag is clearly present. The signal comes directly out of the parent's own words. B fits without stretching. The question is one children really ask, its wording is at the level of an 8-year-old, it stays on the original topic, and no stronger diagnosis competes with it. Nothing was manipulated: 「きまりだから」 is the most typical real parental answer, not a planted weakness.

**Decision**
**KEEP**

---

### STEP 3

**Current question**
> 「なんで、あぶなくないときも、きまりを守るの？」

**Current answer** (realistic)
> 「自分で『今はだいじょうぶ』って決めると、見まちがえることがあるでしょ。それに、運転してる人は『赤なら、人は止まってる』と思って走ってるんだよ。みんなが同じきまりを守るから、安心して道を使えるの。」

**What did you notice?**
The answer fills in the B gap with two middle steps: (1) your own "it's safe" judgment can be wrong; (2) other people act on the assumption that you will stop. It also brings in the **driver's seat without being asked**.

**Surface cue**
「みんな」「運転してる人は…と思って」「見まちがえる」

**Underlying signal**
Test it: can the child now explain, in their own words, why you stop at red even when no car is visible? Yes: 「自分の目はまちがえるし、車の人は止まってるって信じてるから」. Does the answer still stop working anywhere? Not on the original question.

**Diagnosis**
No remaining snag that bears on the original question. There are possible side curiosities (how cars fail to stop, the examples behind 見まちがえる), but they no longer change the answer to 「なんで赤で止まるの？」.

**Root of the question**
Answered. The child has moved from "red is dangerous" through "red is a rule" to "red is a promise others rely on".

**Candidate tools considered**
F, B, A, D, NONE (STOP)

**Selected tool**
**NONE → これでOK**

**Why this tool**
The STOP test passes: the child can restate the answer, including the case that was bothering them.

**Alternative tool(s)**
- **F**: 「運転してる人から見たら、赤なのに人が出てきたら、どうなるの？」. This is explored as branch 3-F. The parent has already done F's work, so asking it is mostly redundant.
- **B** on 「と思って走ってる → ？ → あぶない」: the missing middle is "so the driver doesn't slow down and can't stop in time". This is real for younger children, and it is the same content as 3-F.
- **A** on 「見まちがえる」: 「たとえば、どんなとき？」. Useful for safety education, but it drifts from *why* toward *what to watch for*.
- **D** on 「みんなが同じきまりを守る」: 「みんな守ってる？守らない人もいるよ」. Clever, but it opens "why do some people break rules", which is a new topic. Also 「みんなが守るから」 is a condition for the system working, not an empirical claim, so this is a D false signal.

**Candidate next questions considered**
| Candidate | Tool | Verdict |
|---|---|---|
| これでOK | — | **Selected.** |
| 「運転してる人から見たら、赤なのに人が出てきたら、どうなるの？」 | F (or B) | Optional branch 3-F. Redundant as an F example. |
| 「見まちがえるって、たとえばどんなとき？」 | A | A drift. Rejected for this chain. |
| 「でも、守らない人もいるよね？」 | D | A new topic and a false signal. Rejected. |

**Selected next question**
None. **これでOK**

**Confidence**
**HIGH** (confidence that stopping is correct)

**Confidence rationale**
The original inquiry is resolved, and every further question either repeats content the parent already gave or changes topic.

**Decision**
**KEEP** as a STOP example.

---

### BRANCH 2b (from STEP 1, Tool B)

**Current question**
> 「こっちが赤のとき、車の信号は何色なの？」

**Current answer** (realistic)
> 「車の信号は青だよ。信号は、人と車が、じゅんばんに道を使えるようにしてるの。こっちが赤のときは、車の番なんだよ。」

**What did you notice?**
The turn-taking model is now explicit. That changes how the child sees red: it is not a "danger colour", it means "not your turn".

**Surface cue**
NONE for a new snag. 「じゅんばん」 is clear.

**Underlying signal**
Apply it to a crossing with no cars: 「車の番だけど、車がいない」. The same scope gap as STEP 1 reappears, now stronger, because the child can phrase it as 「番の人がいないなら？」.

**Diagnosis**
The branch **converges** on the main chain's Q2 (車が来てないときは？), and reaches it with a better grasp of what the signal is for.

**Selected tool / next question**
C / D, the same as STEP 1. The next question is 「じゃあ、車の番でも、車がいないときは？」, which then follows the main chain.

**Rejected here**
- 「人の信号と車の信号が、どっちも赤になることある？」 (E-like comparison). Factually interesting (Japan does have 全赤 intervals), but academically clever and not a child's natural question. LOW.
- 「じゅんばんは、だれが決めてるの？」 (source or authority). This is the "who decided" probe again, arising naturally, and again it fits no tool and starts a new inquiry.

**Confidence (1 → 2b transition)**
**MEDIUM**. The B test locates a real gap, but only for children who do not already know the cars have green. The natural question is a plain **fact question** (「何色？」), not B's 「なんで」 form.

**Decision**
**REVISE**. It is useful as a way into the main chain for younger children, not as a standalone B example.

---

### BRANCH 3-F (from STEP 3, optional)

**Current question**
> 「運転してる人から見たら、赤なのに人が出てきたら、どうなるの？」

**Current answer** (realistic)
> 「びっくりしてブレーキをふんでも、車はすぐには止まれないんだよ。」

**Diagnosis**
これでOK. It adds one concrete fact (stopping distance) that makes the driver's reliance vivid.

**Confidence (3 → 3-F transition)**
**LOW** as an F example. The parent had already put the child in the driver's seat, so the child's question only unpacks a B-type middle step ("thinks you'll stop → doesn't slow → can't stop"). F is not doing diagnostic work here.

**Decision**
**REJECT** as curriculum evidence for F. The content is fine as an add-on for the parent.

---

## A. Final natural question chain

> **Q1** 「なんで、赤信号では止まるの？」
> **A1** 「赤は『止まれ』っていう合図なの。赤のときにわたると、車が来て、ぶつかるかもしれないでしょ。あぶないからだよ。」
>
> **Q2** 「じゃあ、車が来てないときは、わたってもいいの？」
> **A2** 「それでも止まるんだよ。来てないように見えても、急に車が出てくることがあるからね。それに、赤で止まるのは、きまりだから。」
>
> **Q3** 「なんで、あぶなくないときも、きまりを守るの？」
> **A3** 「自分で『今はだいじょうぶ』って決めると、見まちがえることがあるでしょ。それに、運転してる人は『赤なら、人は止まってる』と思って走ってるんだよ。みんなが同じきまりを守るから、安心して道を使えるの。」
>
> **→ これでOK**

Optional on-ramp for younger children (between Q1 and Q2): 「こっちが赤のとき、車の信号は何色なの？」 → 「青だよ。こっちが赤のときは、車の番なんだよ。」 → this rejoins at Q2.

## B. Tool map

| Transition | Signal | Diagnosis | Tool | Next question | Confidence |
|---|---|---|---|---|---|
| A1 → Q2 | Reason (danger from cars) covers fewer cases than the rule (always stop) | Hidden condition "a car is coming"; empty crossings are real counterexamples | **C** (also **D**; E's move) | 「じゃあ、車が来てないときは、わたってもいいの？」 | MEDIUM (question HIGH, label ambiguous) |
| A2 → Q3 | 「きまりだから」 offered as a reason that does not depend on danger | Missing middle: rule → ? → stop even when safe | **B** | 「なんで、あぶなくないときも、きまりを守るの？」 | HIGH |
| A3 → STOP | None left on the original question | The child can restate the answer, including the worrying case | NONE | これでOK | HIGH |
| A1 → Q2b (branch) | 「赤 → 車が来る」 link unstated | Turn-taking model missing (depends on age) | **B** (diagnosis); fact question (wording) | 「こっちが赤のとき、車の信号は何色なの？」 | MEDIUM |
| A3 → Q3-F (branch) | The driver's seat, already supplied by the parent | Redundant; really a B middle step | F (nominal) | 「運転してる人から見たら…どうなるの？」 | LOW |

## C. Rejected-path log

| # | Where | Candidate | Tool | Why rejected | What it teaches |
|---|---|---|---|---|---|
| R1 | A1 | 「あぶないって、どういうこと？」 | A | 「あぶない」 was already filled in by 「車が来て、ぶつかる」 in the same answer. | **Cue ≠ signal.** A vague word next to its own explanation is not an A snag. This is the clearest demonstration in the scene. |
| R2 | A1 | 「運転してる人から見たら、どう？」 | F | No sign in the answer. The child has not thought about drivers. | F is easy to overuse wherever other people *exist*, as opposed to where their seat is *ignored*. |
| R3 | A1 | 「赤だと、なんで車が来るの？」 | B | The diagnosis is right, but the template wording is unnatural. A child asks 「車の信号は何色？」. | The B diagnosis can yield a *fact* question, not a 「なんで」 question. |
| R4 | A2 | 「きまりって、だれが決めたの？」 | none fits | Natural and legitimate, but it starts a new inquiry (law and authority) and does not deepen *why stop*. | This is a question type the framework does not cover. See §E. |
| R5 | A2 | 「見通しがいい道でも、急に来るの？」 | D | It repeats the STEP 1 counterexample pressure; a loop. | D can keep firing on the same gap. The diagnosis must check whether the gap has *already been answered at another level*. |
| R6 | A2 | 「ぼくがわたったら、だれかこまるの？」 | F | Premature. The child would be guessing the answer (other people rely on you) before being told it. | F is more natural as an *adult explanatory move* than as the child's question in this scene. |
| R7 | A3 | 「でも、守らない人もいるよね？」 | D | 「みんなが守るから」 states a condition for the system to work; it is not an empirical claim. It also changes topic. | Normative 「みんな」 is a D false signal. |
| R8 | A3 | 「見まちがえるって、たとえばどんなとき？」 | A | It drifts from *why* to *what to watch for* (safety education). | An A question can be answerable and useful and still be off-inquiry. |
| R9 | 2b | 「人の信号と車の信号が、どっちも赤になることある？」 | E | Academically clever and factually interesting, but not a question a child naturally asks. | E's comparison trigger never occurred naturally in this scene. |
| R10 | 3-F | 「運転してる人から見たら…どうなるの？」 | F | The parent had already done the F work. The question only unpacks a B-type middle step. | When an adult answer includes the other seat, F has nothing left to do. |

### Probe results (§11 of the brief)

| Probe | Did it arise naturally? | Finding |
|---|---|---|
| 「あぶないから」: A? | Yes, as a cue | **Not A** in this answer (R1). Sensitivity check: if the parent had said *only* 「あぶないからだよ」, the child's natural question would be 「なんで、あぶないの？」. That is B's form, not A's 「どういうこと？」. When the vague word *is* the reason, A and B collapse into one 「なんで」. |
| 「車が来るかもしれないから」: B? | Yes | A real B gap (turn-taking) for younger children, but the natural wording is a fact question (branch 2b). |
| 「きまりだから」 | Yes | Not explanatory on its own, and it opens the strongest B transition in the scene (A2 → Q3). |
| 「みんな止まらなきゃいけない」: D? | Did not arise | Normative 「みんな」 is a rule, not an overgeneralisation, so it is a D false signal. One real D exists in principle: 「救急車は、赤でも行くよね？」 is a genuine counterexample that teaches how a rule's exceptions reveal its purpose (the siren warns everyone, so the shared promise is kept another way). It would arise only if the adult said 「みんな」. |
| Pedestrians vs cars: E? | Did not arise | E's comparison trigger never occurred. E's *move* (toggle one factor) did occur in Q2, under a C/D diagnosis. |
| 「車が来てないときは？」 | **Yes. The most natural question in the scene.** | Reached through C, D **or** E's move. All three produce the same question. |
| 「だれが決めたの？」 | Yes (twice) | Natural, but it begins a new inquiry. No tool fits (R4). |
| Driver's point of view: F? | Arose in the **adult's answer** (A3), not as the child's question | F-type content was essential to the final explanation, but F was not needed as a *questioning* tool here (R2, R6, R10). |

## D. Curriculum suitability

| Transition | Class | Reason |
|---|---|---|
| **A2 → Q3** (「きまりだから」 → 「なんで、あぶなくないときも、きまりを守るの？」, B) | **GREEN** | It meets the reference-case standard on every criterion: the snag is inside the parent's own words, the question is one children really ask, the wording suits an 8-year-old, B's test works as written, and the answer materially deepens the original question. The pattern ("because it's the rule" → why does the rule bind when its purpose seems absent?) transfers to many settings: school rules, manners, 「くつをぬぐ」 itself. |
| **A3 → これでOK** | **GREEN** | A clean STOP example. The STOP test is concrete ("can you now say it yourself, including the case that bothered you?"). The curriculum needs canonical STOP examples as much as canonical questions. |
| **A1 → Q2** (「車が来てないときは？」, C/D) | **YELLOW** | The question is excellent and arguably the best in the scene. As a *tool* example it is ambiguous: C and D fit equally, and E's move is visible. It becomes GREEN only if the curriculum accepts "more than one tool can lead here" as a teaching point. Otherwise it will confuse children about which tool is "right". |
| **A1 → Q2b** (「車の信号は何色？」, B) | **YELLOW** | The B diagnosis is correct, but the snag depends on age and the natural wording is a plain fact question. It is useful as an on-ramp for younger children, not as a B exemplar. |
| **A3 → Q3-F** (driver's seat, F) | **RED** | The adult had already supplied the other seat. Using this as an F example would teach F where F is not needed. |

## E. Tool-framework findings

1. **B works especially naturally on 「きまりだから」.** An authority answer is the most common way adults end a 「なんで」 chain, and the B test (「きまり → ？ → △△」) exposes the missing middle cleanly. This may be B's strongest home.

2. **A is easy to overuse.** 「あぶない」 is on A's cue list and looks like a textbook trigger, but in a realistic answer it came already explained. A children's version of the A test needs an explicit first check: *did the same answer already say what it means?*

3. **F is easy to overuse, and here it appeared on the wrong side.** Other people's seats were central to the *final explanation*, but the adult supplied them. The child never needed F to generate a question. F may be stronger in scenes where the child or adult is *making a decision* (allocation, permission) than in "why is this rule so" scenes. This single scene does not settle that.

4. **Heavy overlap among C, D and E on the counterfactual "what if X weren't so?".** The best question in the scene (「車が来てないときは？」) comes out of C's hidden-condition test, D's counterexample test and E's toggle-one-factor move alike. The tools currently differ more in their *triggers* than in the *question they produce*. When the triggers blur, the child has no way to choose among them, and choosing does not matter to the question.

5. **A common signal is not well covered: a reason that covers fewer cases than the rule.** "Red → stop, always" justified by "because cars come, sometimes" is a scope mismatch between the justification and the rule. D can catch it through its test, but D's cue list (みんな／いつも) would miss it, because the generalisation is implicit. This signal is likely to recur wherever rules are explained through their typical purpose.

6. **A useful question fits none of the six tools: 「だれが決めたの？」.** Questions about source or authority arose naturally twice. They are legitimate curiosity, but they start a new inquiry. The framework needs a way to say "good question, but it's a new question" as opposed to "not a good next question".

7. **A diagnosis can be right while the tool's template is wrong.** The B diagnosis at STEP 1 correctly located a gap, but the natural question was a fact question (「何色？」), not 「〇〇だと、なんで△△？」. Templates should be offered as examples, not as required forms.

8. **Whether a snag exists depends on the learner.** Branch 2b is a real gap for an 8-year-old and a non-gap for an 11-year-old. The framework currently treats a snag as a property of the answer. It is a property of the answer *relative to what this child already knows*.

9. **Branches converge.** Both the main chain and the B branch reached the same next question. In this scene, the content of the answer determined the strongest next question more than the tool did.

10. **STOP needs its own explicit test.** 「そのこたえで、さいしょのなんでに、自分のことばでこたえられる？ 気になっていたばあいも？」 is what actually ended the chain. It should sit alongside the six tools, not be left implicit.

## F. Core research conclusion

> **In this scene, does diagnosis genuinely help the learner produce a better next question?**

**PARTIALLY SUPPORTED**

**Why:**

- **Supported: Notice → Test → Diagnose.** Testing each answer against a real case ("a red light with no car in sight"; "a rule when it looks safe") is what produced the two strong questions. The same testing *rejected* the tempting surface cues (「あぶない」 for A, 「みんな」 for D, the driver for F). Without the test, a cue-driven learner would have asked the weaker questions in §C. The strongest transition (A2 → Q3, B) matches the shoes reference case in quality.

- **Weak: Diagnose → one Tool.** For the best question in the scene, the tool choice was ambiguous (C/D/E) and added nothing the diagnosis had not already given. For F, the tool attracted false positives more often than it produced a question. The tool templates sometimes produced wording less natural than the child's own.

- **Net:** in this scene the value lies in the **diagnostic test** (make the answer do work and see where it breaks), not in **choosing one of six labels**. B and STOP fit cleanly. C/D/E overlap on the counterfactual question. F and A are more often false signals than real ones here. One scene cannot say whether this pattern holds elsewhere. The findings above are hypotheses for the next trial scenes, not conclusions about the course.


---
---

# PART II — RETROSPECTIVE ANALYSIS

Everything below was written **after** the original run, and all of it is **RETROSPECTIVE ANALYSIS** unless tagged **[ORIGINAL]**. The accepted chain Q1–A3 and the original STOP decision are the evidence base. They are examined here, not replaced.

## II.0 Evidence inventory: what the original run did and did not record

| Item the supplement asks for | Recorded in Part I? | Where it is now |
|---|---|---|
| Exact questions and answers Q1–A3 | **Yes** | Part I §1, §A |
| What was noticed, surface cue, underlying signal, diagnosis, root of question | **Yes**, per step | Part I §1. Restated with [ORIGINAL] tags in §II.2–II.5 |
| Candidate tools considered | **Yes**, as a list with prose | Part I §1 |
| Fit rating for **each** tool (HIGH/MEDIUM/LOW) | **No** | §II.2–II.5 (retrospective) |
| Candidate next questions | **Yes**, with verdicts | Part I §1 tables |
| Criterion-level scoring of candidates (7 columns) | **No** | §II.2–II.5 (retrospective) |
| Candidates not listed originally | — | Marked **[RETRO-ADDED]** |
| Answer depth (RULE / IMMEDIATE REASON / MECHANISM / CONSEQUENCE / ROOT PURPOSE) | **No** | §II.2–II.5 (retrospective) |
| Question origin (answer-internal / depth / boundary / perspective / purpose / new topic) | **No** | §II.2–II.5 (retrospective) |
| Question-quality vs tool-label confidence split | **Partly.** Only STEP 1 had "MEDIUM (question HIGH, label ambiguous)". STEP 2 had one merged "HIGH". STEP 3 had one "HIGH" for the STOP decision. | §II.2–II.5 (retrospective) |
| Depth Check after A3 | **No.** Only the STOP test (「自分のことばでこたえられる？」) was applied. | §II.5 (retrospective) |
| Q4 Purpose Probe | **No** | §II.5 (retrospective) |
| Purpose Probe as a category | **No** | §II.6 (retrospective) |

**Process caveat [RETRO].** Part I shows candidate questions and diagnosis side by side. The record **cannot show** whether the diagnosis came first and generated the questions, or whether the questions came first and the diagnosis evaluated them. §II.12 Q2 takes this into account.

## II.1 Scales used in Part II

**Answer depth**

| Level | Meaning in this scene |
|---|---|
| RULE | "Red means stop"; "it's the rule" |
| IMMEDIATE REASON | The direct, visible reason: a car might hit you |
| MECHANISM | How stopping actually produces safety: judgment is fallible, others act on expectations |
| CONSEQUENCE | What happens if you don't stop: collision, injury, surprise |
| ROOT PURPOSE | What the whole practice is ultimately for: protecting oneself and others from harm |

**Question origin.** These are written out as names on purpose, because their letters would clash with the tool letters A–F.

| Origin | Meaning |
|---|---|
| Answer-internal | Something inside the answer is unclear or incomplete |
| Depth | The answer is correct but stays at a shallower level |
| Boundary | Tests the explanation on a nearby case |
| Perspective | Examines another affected person's position |
| Purpose | Asks what the rule or action is ultimately for |
| New-topic | Interesting, but opens a different inquiry |

---

## II.2 TRANSITION 1: A1 → Q2

### Previous answer
> 「赤は『止まれ』っていう合図なの。赤のときにわたると、車が来て、ぶつかるかもしれないでしょ。あぶないからだよ。」

### Answer depth [RETRO]
**RULE + IMMEDIATE REASON + CONSEQUENCE (for oneself).**
- RULE: 「赤は『止まれ』っていう合図」.
- IMMEDIATE REASON: 「車が来て」.
- CONSEQUENCE: 「ぶつかる」「あぶない」. This is harm to **oneself** only.
- It is not MECHANISM: it does not say *why* cars come when your light is red.
- It is not ROOT PURPOSE: protection of oneself is implied, but only in the case where a car is visible, and other people do not appear at all.

### What was noticed? [ORIGINAL]
The answer stacks a rule on top of a danger reason. The danger reason depends on an unsaid link, "when my light is red, cars come". The reason is conditional (「かもしれない」), while the rule is unconditional.

### Surface cue [ORIGINAL]
「あぶない」「から」「かもしれない」

### Underlying signal [ORIGINAL, restated]
The reason explains the dangerous case (a car is coming). It does not yet explain why the rule still applies when no car is in sight.

### Question origin [RETRO]
**Boundary** (primary): the child tests the explanation on the nearby case of an empty crossing. **Answer-internal** (secondary): the reason given covers fewer cases than the rule it is supposed to justify.

### Diagnosis [ORIGINAL]
The reason covers fewer cases than the rule. The explanation rests on an unstated condition, "a car is coming", which the child has real, experience-based reasons to doubt.

### Root of the child's question [RETRO wording of ORIGINAL content]
> 「あぶないのが見えないときも、ほんとうに止まらなきゃいけないの？」
> *Is red about danger, or is it about something else?*

### Tool audit

| Tool | Fit | Why |
|---|---|---|
| A: Lid | **LOW** | 「あぶない」 is a cue, but the same sentence already says what it means (車が来て、ぶつかる). No snag. [ORIGINAL rejection; RETRO rating] |
| B: Dominoes | **MEDIUM** | 「赤 → ？ → 車が来る」: the middle (the cars have green, it is their turn) is a real gap for younger children and a non-gap for older ones. The natural wording is a fact question, not a 「なんで」. [ORIGINAL as branch 2b; RETRO rating] |
| C: Hidden condition | **HIGH** | A1 contains a prediction (「わたると、ぶつかるかもしれない」) that holds only if a car is coming. Both C conditions are met: without the condition the reason fails, and there is real doubt (empty roads). C's template 「もし〇〇じゃなかったら？」 gives Q2 almost word for word. [ORIGINAL selection; RETRO rating] |
| D: Umbrella | **MEDIUM** | The D test (「はみだすもの？」) immediately finds "red, but no car". But A1 makes no explicit broad claim, so the generalisation 「赤のときは車が来る」 is only implicit and D's cue list would miss it. [ORIGINAL said "equally defensible" with C; **RETRO downgrades D slightly**, see §II.11] |
| E: Eraser | **LOW** | E's move (toggle one factor: the car) is visible in Q2, but E's trigger (a comparison with several differences) is missing from A1. [ORIGINAL observation; RETRO rating] |
| F: Seesaw | **LOW** | Nobody else's position appears in A1, and the child has not wondered about drivers. [ORIGINAL rejection; RETRO rating] |
| NONE / STOP | **MEDIUM** | A1 is true and good enough for everyday behaviour. Many children would stop here, and that would be a valid outcome. [ORIGINAL; RETRO rating] |

**Selected tool:** **C**. [ORIGINAL: "C, with D equally defensible"]
**Tool-label confidence:** **MEDIUM**. C fits best on the definitions, but the same question also comes out of D's test and matches E's move. A learner could reach Q2 through any of the three.

### Candidate questions

| # | Candidate question | Nat. | Cont. | Depth | Tool fit | Age | Curr. value | Overall |
|---|---|---|---|---|---|---|---|---|
| 1 | 「じゃあ、車が来てないときは、わたってもいいの？」 [ORIGINAL] | HIGH | HIGH | MEDIUM | MEDIUM | HIGH | HIGH | **HIGH** |
| 2 | 「こっちが赤のとき、車の信号は何色なの？」 [ORIGINAL] | MEDIUM | HIGH | MEDIUM | MEDIUM | HIGH | MEDIUM | **MEDIUM** |
| 3 | 「赤だと、なんで車が来るの？」 [ORIGINAL] | LOW | HIGH | MEDIUM | HIGH | MEDIUM | LOW | **LOW** |
| 4 | 「あぶないって、どういうこと？」 [ORIGINAL] | LOW | MEDIUM | LOW | LOW | HIGH | MEDIUM (as a counter-example) | **LOW** |
| 5 | 「運転してる人から見たら、どう？」 [ORIGINAL] | LOW | MEDIUM | MEDIUM | LOW | MEDIUM | LOW | **LOW** |
| 6 | 「救急車は、赤でも行くよね？」 [RETRO-ADDED; Part I mentioned it only as a probe] | MEDIUM | MEDIUM | MEDIUM | LOW | HIGH | MEDIUM | **LOW** (here) |
| 7 | これでOK (STOP) [ORIGINAL] | — | — | — | — | — | MEDIUM | **MEDIUM** |

1. **Selected.** It is what children really say at empty crossings, and it forces the explanation to separate *danger* from *rule*. Depth is rated only MEDIUM because the question frames the problem sharply but does not itself push the answer to a deeper level (see A2).
2. Kept as optional branch 2b. It is a real gap for younger children only, and it is a plain fact question.
3. The same diagnosis as #2, but the B-template wording is unnatural for a child. Rejected in favour of #2.
4. A cue with no snag. This is the scene's clearest negative example.
5. Unprompted. A curriculum designer's question, not a child's.
6. A genuine exception to "everyone stops at red", but A1 never said 「みんな」, so the question has no hook in *this* answer. It would be a candidate only if the adult said 「みんな止まるの」.
7. Valid for some children. Not selected, because a stronger question clearly exists.

### Two-level confidence for Q2 [RETRO]

| Criterion | Score |
|---|---|
| Naturalness | HIGH |
| Logical continuity | HIGH |
| Depth progress | MEDIUM |
| Diagnostic validity | HIGH |
| Age clarity | HIGH |
| Curriculum value | HIGH |
| **Overall question confidence** | **HIGH** |
| **Tool-label confidence (C)** | **MEDIUM** |

[ORIGINAL: "MEDIUM (question itself would rate HIGH)". The retrospective split agrees with it.]

---

## II.3 TRANSITION 2: A2 → Q3

### Previous answer
> 「それでも止まるんだよ。来てないように見えても、急に車が出てくることがあるからね。それに、赤で止まるのは、きまりだから。」

### Answer depth [RETRO]
**IMMEDIATE REASON (widened) + RULE.**
- 「急に車が出てくることがある」 widens the immediate reason to hidden danger. It is still the danger story, just extended.
- 「きまりだから」 is **RULE**, an appeal to the rule itself.
- An honest observation: in one strand, A2 is **shallower** than A1. It falls back on the rule. This is not a defect planted in the answer; it is how real parents typically answer a boundary challenge. It is also exactly what makes Q3 possible.

### What was noticed? [ORIGINAL]
Two separate reasons. The second (「きまりだから」) does not depend on danger at all. What the child hears: *you stop even if it is safe, because it is the rule*.

### Surface cue [ORIGINAL]
「きまりだから」 (also 「急に」「ことがある」)

### Underlying signal [ORIGINAL, restated]
The answer now says that the rule applies even when danger is absent. But "it's the rule" does not explain why a rule should bind in exactly the cases where its visible reason has gone.

### Question origin [RETRO]
**Answer-internal** (「きまりだから」 is offered as a reason but does not explain). **Purpose** (the child is really asking what the rule is for). **Boundary** (carried over from Q2: the 「あぶなくないとき」 frame).

### Diagnosis [ORIGINAL, sharpened RETRO]
Unresolved: **what makes a rule worth keeping when, in this particular moment, its reason seems to be missing?** Part I described this as a missing middle (「きまり → ？ → 車がいなくても止まる」). The retrospective review (§II.4) finds that the missing piece is the **purpose and function of the rule**, not a causal step.

### Root of the child's question
> 「自分で『だいじょうぶ』って分かるときも、なんで守らなきゃいけないの？」
> *Why does this rule still matter when I think I can judge the situation myself?*

### Tool audit

| Tool | Fit | Why |
|---|---|---|
| A: Lid | **LOW** | 「きまり」 is not vague; its meaning is clear. The nearby question 「だれが決めたの？」 is about the rule's **source**, not its meaning. [ORIGINAL; RETRO rating] |
| B: Dominoes | **MEDIUM** | The B test runs literally (「きまり → ？ → 車がいなくても止まる」, and the child cannot say the middle), and the natural question is close to B's template. But what fills the gap is the rule's *purpose and function*, not a causal step (§II.4). [ORIGINAL rated the transition HIGH; **RETRO rates B fit MEDIUM**] |
| C: Hidden condition | **LOW** | 「急に出てくることがある」 carries no hidden condition worth doubting. The condition that *does* matter ("the rule works only if everyone keeps it every time") is not yet stated, so it cannot be probed yet. [RETRO] |
| D: Umbrella | **MEDIUM fit / LOW value** | 「見通しがいい道でも？」 tests 「急に出てくる」 properly, but it repeats the Q2 pressure and loops. [ORIGINAL rejection as a loop; RETRO rating] |
| E: Eraser | **LOW** | Comparing "car coming" with "no car" is already settled by A2 itself (the rule is the same either way). Erasing the car tells the child nothing new. [RETRO] |
| F: Seesaw | **LOW** | 「ぼくがわたったら、だれかこまる？」 would have the child guess the answer (others rely on you) before being told it. It becomes relevant only after A3. [ORIGINAL rejection; RETRO rating] |
| NONE / STOP | **LOW** | A child who has just asked Q2 is usually not satisfied by 「きまりだから」. [ORIGINAL; RETRO rating] |
| (no tool) Purpose Probe | **HIGH** | Not one of the six tools. Describes the move better than B does (§II.4, §II.6). [RETRO] |

**Selected tool:** **B**, together with a Purpose Probe. [ORIGINAL: "B"; RETRO: adds the Purpose Probe]
**Tool-label confidence (B):** **MEDIUM**. [ORIGINAL implied HIGH through the merged transition score]

### Candidate questions

| # | Candidate question | Nat. | Cont. | Depth | Tool fit | Age | Curr. value | Overall |
|---|---|---|---|---|---|---|---|---|
| 1 | 「なんで、あぶなくないときも、きまりを守るの？」 [ORIGINAL] | HIGH | HIGH | HIGH | MEDIUM | HIGH | HIGH | **HIGH** |
| 2 | 「きまりだと、なんで車がいなくても止まるの？」 [ORIGINAL] | MEDIUM | HIGH | HIGH | MEDIUM | MEDIUM | MEDIUM | **MEDIUM** |
| 3 | 「きまりって、だれが決めたの？」 [ORIGINAL] | HIGH | MEDIUM | LOW | LOW (none fits) | HIGH | MEDIUM (as a "new inquiry" example) | **LOW** for this chain |
| 4 | 「見通しがいい道でも、急に来るの？」 [ORIGINAL] | MEDIUM | HIGH | LOW | MEDIUM | HIGH | LOW | **LOW** |
| 5 | 「ぼくがわたったら、だれかこまるの？」 [ORIGINAL] | LOW | MEDIUM | MEDIUM | LOW | HIGH | MEDIUM | **LOW** |
| 6 | 「じゃあ、だれも見てなかったら、わたってもいい？」 [RETRO-ADDED] | HIGH | MEDIUM | LOW | MEDIUM (C/D) | HIGH | MEDIUM (as a warning) | **LOW** |
| 7 | 「きまりをやぶったら、どうなるの？」 [RETRO-ADDED] | HIGH | MEDIUM | LOW | LOW | HIGH | LOW | **LOW** |

1. **Selected.** Natural, clear to an 8-year-old, and aimed squarely at the gap between the rule and its reason.
2. The same move in stiffer, template-shaped wording.
3. A natural question, but it opens a new inquiry into law and authority, and the answer ("the country decided") does not explain *why stop*.
4. Loops on the Q2 pressure without adding information.
5. Premature. See the tool audit.
6. **[RETRO-ADDED]** Realistic, since children do ask this. But it steers the conversation toward *being caught*, which makes the rule about punishment rather than purpose. A useful warning example of a natural question that pulls *away* from the root.
7. **[RETRO-ADDED]** Moves to penalties: a consequence-for-me frame, not a purpose frame. Same risk as #6.

### Two-level confidence for Q3 [RETRO]
See §II.4.

---

## II.4 Special review of Q3

> 「なんで、あぶなくないときも、きまりを守るの？」
> Part I: **Tool B · HIGH**

**Test: is Q3 really filling a missing causal middle?**

B is defined as: *the answer gives a reason, but the child cannot explain how that reason actually leads to the result* (〇〇 → ？ → △△).

1. **What does the literal B test give?** 「きまり → ？ → 車がいなくても止まる」. The child cannot fill the middle, so the B test "fires". That much of Part I stands.
2. **But is the link causal?** No. A rule does not *cause* stopping the way warmth causes ice to melt. The link between 「きまり」 and 「止まる」 is **normative**: it is about justification, not physical cause.
3. **What does A3 actually put in the "middle"?**
   - 「自分で『今はだいじょうぶ』って決めると、見まちがえることがある」. This is causal-ish: it links "safe-looking" to "maybe not safe". It is the closest thing to a B-type middle.
   - 「運転してる人は『赤なら、人は止まってる』と思って走ってる」. This is a **mechanism of coordination**: others act on the assumption that you will stop.
   - 「みんなが同じきまりを守るから、安心して道を使える」. This is the rule's **function**, one step short of its purpose.
   So one of the three pieces is B-shaped. The other two answer "what is the rule for, and how does it work?"
4. **What is the child actually doing?** Moving from a **rule** to the **purpose behind the rule**, in a case where the rule's visible reason is missing. That is a purpose probe inside a boundary frame.

**Classification options**

| Option | Assessment |
|---|---|
| B alone | Defensible on the literal test and the template. It misdescribes the intellectual move: the child is not asking for a causal link. |
| **B + Purpose Probe** | **Best fit.** B's test finds *where* the gap is (after 「きまりだから」). The Purpose Probe describes *what kind* of gap it is. |
| NONE + Purpose Probe | Also defensible. It would be the preferred reading if B were defined strictly as physical or causal mechanism. The current B definition ("how that reason leads to the result") is loose enough to cover it. |
| Other (C, F) | No. See the tool audit in §II.3. |

**Result (independent of the supplement's hypothesis).** The concern is **partly** borne out. B is not wrong. It is not HIGH either, because the missing "middle" is the rule's purpose and function, not a causal step. This finding was not reached just to satisfy the question; it rests on the fact that two of the three pieces A3 supplies are not causal.

| | Score |
|---|---|
| Naturalness | HIGH |
| Logical continuity | HIGH |
| Depth progress | HIGH (RULE → MECHANISM + partial PURPOSE) |
| Diagnostic validity | HIGH (the gap after 「きまりだから」 is real) |
| Age clarity | HIGH |
| Curriculum value | HIGH as a chain step |
| **Q3 question-quality confidence** | **HIGH** |
| **Q3 Tool-B confidence** | **MEDIUM** |

**Consequence for Part I.** Part I's "Tool B · HIGH" merged these two judgments into one. Part I also called A2 → Q3 "GREEN" and said "This may be B's strongest home" (Part I §E.1). The retrospective view is that it is GREEN **as a question-chain example** but only **YELLOW as a Tool B exemplar**, and that §E.1 overstated B's case. Logged in §II.11.

---

## II.5 TRANSITION 3: A3 → STOP or Q4

### Previous answer
> 「自分で『今はだいじょうぶ』って決めると、見まちがえることがあるでしょ。それに、運転してる人は『赤なら、人は止まってる』と思って走ってるんだよ。みんなが同じきまりを守るから、安心して道を使えるの。」

### Answer depth [RETRO]
**MECHANISM (primary) + partial ROOT PURPOSE.**
- MECHANISM: individual judgment can be wrong, and drivers act on the expectation that pedestrians will stop.
- Partial ROOT PURPOSE: 「安心して道を使える」 names the rule's **function** (predictability and trust). It does not name what that function protects (no one gets hurt).
- CONSEQUENCE is not stated here. It was stated back in A1 (「ぶつかる」), and only for oneself.

### What was noticed? [ORIGINAL]
The answer fills in the gap with (1) your own judgment can be wrong, and (2) others rely on you. It brings in the driver's seat without being asked.

### Surface cue [ORIGINAL + RETRO]
[ORIGINAL] 「みんな」「運転してる人は…と思って」「見まちがえる」. [RETRO-ADDED] 「安心」.

### Underlying signal
[ORIGINAL] No remaining snag on the original question.
[RETRO] A **depth gap** remains where there is no snag. The chain has explained how the rule works (shared predictability) but has not said what it is ultimately for (no one gets hurt, including other people). This is not something in A3 "breaking"; it is A3 stopping one level short.

### Question origin [RETRO]
For any Q4: **Purpose** (synthesis). Not answer-internal.

### Diagnosis
[ORIGINAL] "No remaining snag that bears on the original question."
[RETRO] That is correct as far as snags go. But the root purpose is not yet **explicit**. Protection of oneself appeared in A1; other people appeared in A3, but only as *actors who rely on you*, never as *people who could be hurt*. 「安心」 sits one level below "no one gets hurt".

### Root of the child's question (if a Q4 is asked)
> 「けっきょく、赤で止まるのは、何を守るため？」

### Formal Depth Check [RETRO]

**1. What level has A3 reached?**
MECHANISM, plus the rule's function (安心 / predictability). **Not** an explicit ROOT PURPOSE.

**2. Can the child now answer 「なんで、赤信号では止まるの？」 in their own words?**
Yes, at the mechanism level. A likely restatement:
> 「車が見えなくても、自分の目はまちがえるかもしれないし、車の人は止まってるって思ってるから。」

This passes Part I's STOP test ("can you say it yourself, including the case that bothered you?"). But notice what the likely restatement **leaves out**: *why* that matters, meaning somebody could get hurt. The child's version gets the mechanism and drops the purpose.

**3. Has the answer explicitly reached the root purpose (protecting oneself and others from harm)?**
**No. It stops one step earlier**, at shared rules making road use predictable (安心).
- **Oneself:** explicit in A1 (「ぶつかるかもしれない」), but only in the visible-car case.
- **Others:** present in A3 as people who *rely* on you; never as people who could be *harmed* (a driver who swerves, other pedestrians, cyclists, a child who copies you).
- **安心 vs. "no one gets hurt":** closely related but **not identical**. 安心 is the *means-level function* (everyone can predict everyone). Harm prevention is the *end* that predictability serves. An adult closes this gap without noticing; an 8-year-old may not.

**Depth Check verdict [RETRO].** The original STOP was **correct in its own terms**: there was no remaining snag. It was **premature as a depth judgment**: the root purpose was implied across A1 + A3 but never said.

### Tool audit

| Tool | Fit | Why |
|---|---|---|
| A: Lid | **LOW** | On 「見まちがえる」 → 「たとえば？」: drifts into safety tips [ORIGINAL]. On 「安心」 → 「安心って、どういうこと？」: formally A, and its answer *would* reach the root. But an 8-year-old can picture 安心, so there is no felt snag [RETRO]. |
| B: Dominoes | **MEDIUM** (for young children) | 「と思って走ってる → ？ → あぶない」: the missing middle is "so they don't slow down and can't stop in time". This is the same content as branch 3-F. [ORIGINAL; RETRO rating] |
| C: Hidden condition | **MEDIUM fit / LOW value** | 「みんなが同じきまりを守るから、安心」 depends on the unstated condition that everyone really does keep it, and children see adults crossing on red, so there is real doubt. 「守らない人がいたら？」 is natural, but it shifts from *why I stop* to *what about people who don't*. [RETRO: Part I treated this as D (R7); the C reading is stronger than the D reading, but it is still a branch away from the root] |
| D: Umbrella | **LOW** | 「みんな」 here states a condition for the system to work, not an empirical claim. A false signal. [ORIGINAL; RETRO rating] |
| E: Eraser | **LOW** | No comparison in A3. [RETRO] |
| F: Seesaw | **LOW** | The parent has already given the driver's seat, so F has nothing left to do (branch 3-F). [ORIGINAL; RETRO rating] |
| NONE / STOP | **MEDIUM** | No snag remains [ORIGINAL]. But the Depth Check shows the purpose is not explicit [RETRO]. |
| (no tool) Purpose Probe / synthesis | **MEDIUM–HIGH** | The only move that reaches the root explicitly. Its naturalness depends heavily on wording (below). [RETRO] |

**Selected tool:** **NONE.** [ORIGINAL: NONE → これでOK. RETRO: NONE among the six tools; an optional Purpose-Probe synthesis, see the Q4 test]
**Tool-label confidence:** **HIGH** that none of A–F is the right move here.

### Candidate questions

| # | Candidate question | Nat. | Cont. | Depth | Tool fit | Age | Curr. value | Overall |
|---|---|---|---|---|---|---|---|---|
| 1 | これでOK (STOP) [ORIGINAL] | — | — | none | — | — | HIGH (as a STOP example) | **MEDIUM** [RETRO; ORIGINAL rated it HIGH] |
| 2 | 「じゃあ、信号を守るのは、何のため？」 (the supplement's Q4) [RETRO] | LOW | MEDIUM | MEDIUM | NONE (purpose) | HIGH | MEDIUM | **MEDIUM** |
| 3 | 「じゃあ、赤で止まるのは、自分も、車の人も、けがをしないためってこと？」 (revised Q4) [RETRO] | MEDIUM | HIGH | MEDIUM | NONE (purpose / check-back) | HIGH | HIGH | **MEDIUM–HIGH** |
| 4 | 「安心って、どういうこと？」 [RETRO-ADDED] | LOW | HIGH | MEDIUM | MEDIUM (A) | HIGH | LOW | **LOW** |
| 5 | 「でも、守らない人もいるよね？」 / 「守らない人がいたら、どうなるの？」 [ORIGINAL as D; RETRO re-read as C] | HIGH | MEDIUM | MEDIUM | MEDIUM (C) / LOW (D) | HIGH | MEDIUM | **MEDIUM** (C reading) |
| 6 | 「運転してる人から見たら、赤なのに人が出てきたら、どうなるの？」 [ORIGINAL, branch 3-F] | MEDIUM | HIGH | LOW | LOW (F) | HIGH | LOW | **LOW** |
| 7 | 「見まちがえるって、たとえばどんなとき？」 [ORIGINAL] | MEDIUM | MEDIUM | LOW | LOW (A) | HIGH | LOW | **LOW** |

### Test of the supplement's Q4 [RETRO]

> **Q4 (as proposed):** 「じゃあ、信号を守るのは、何のため？」
> **Possible A4:** 「自分も、ほかの人も、けがをしないように守るためだよ。」

| Criterion | Score | Reason |
|---|---|---|
| Naturalness | **LOW** | The adult has just spent three turns explaining; a child rarely follows up with "so what is it for?". This is the question a *teacher* asks to wrap up a lesson. |
| Logical continuity | **MEDIUM** | It does not grow out of a snag in A3. It also quietly widens the scope from 「赤で止まる」 to 「信号を守る」 in general. |
| Depth progress | **MEDIUM** | It makes the purpose explicit. The likely A4 is close to a stock phrase and adds little that is new. |
| Diagnostic validity | **LOW–MEDIUM** | Nothing in A3 is *broken*. The gap is a depth gap (found by the Depth Check), not a snag. |
| Tool fit | **NONE** | None of A–F. A pure Purpose Probe. |
| Age clarity | **HIGH** | Words simple enough for an 8-year-old. |
| Curriculum value | **MEDIUM** | It models the move to purpose, but in a teacher's voice. |

**Decision: Option 3, REVISE Q4.**

- **Why not Option 1 (keep STOP unchanged):** the Depth Check shows the chain never *says* the root purpose, and an 8-year-old's restatement is likely to leave it out. The purpose move does real work.
- **Why not Option 2 (add Q4 as proposed):** its wording is adult-led and abstract (「何のため」), and it widens the scope to 信号 in general.
- **Revised Q4:** a **check-back**, where the child tries out their own summary and asks for confirmation. Children naturally make 「〜ってこと？」 moves.

> **Q4 (revised):** 「じゃあ、赤で止まるのは、自分も、車の人も、けがをしないためってこと？」
> **A4 (realistic):** 「そう。ぶつかったら、きみがけがをするし、よけようとした車の人や、まわりの人がけがをすることもある。だから、車が見えなくても、みんな止まるんだよ。」
> **→ これでOK**

Scoring of the revised Q4 [RETRO]:

| Criterion | Score |
|---|---|
| Naturalness | MEDIUM. Plausible for ages 10+; for 8–9, the adult may need to prompt it (「じゃあ、まとめると？」). |
| Logical continuity | HIGH. It brings together A1 (ぶつかる) and A3 (車の人). |
| Depth progress | MEDIUM. MECHANISM → explicit ROOT PURPOSE. |
| Diagnostic validity | MEDIUM. Found by the Depth Check, not by a snag. |
| Age clarity | HIGH. |
| Curriculum value | HIGH as a model of synthesis and of stopping well. |
| **Overall question confidence** | **MEDIUM** |
| **Tool-label confidence** | **HIGH** that it is NONE of A–F |

**Status in the chain.** Q4 (revised) is recorded as an **optional synthesis step after the snag-driven chain has ended**. It is not a fourth diagnostic transition. The original STOP decision is kept in Part I and stays the end of snag-driven questioning.

---

## II.6 Purpose Probe: current hypothesis [RETRO]

No seventh tool is proposed. Evidence from this scene only:

| Option | Assessment |
|---|---|
| Already covered by Tool B? | **Partly.** B's test *locates* the gap after 「きまりだから」 (Q3). But B frames the gap as a causal middle, which misdescribes a purpose gap. B cannot produce Q4 at all, because A3 has no snag. |
| A meta-level depth move above the six tools? | **Current hypothesis: yes.** The six tools find *snags inside an answer*. The Purpose Probe is a **direction of deepening**, and it applies even when nothing in the answer is broken. It pairs naturally with the STOP test: "no snag remains" (STOP test) vs. "has the root been reached?" (Depth Check). |
| Just ordinary 「なんで」? | **On the surface, yes.** Q3 is a plain 「なんで」. Japanese 「なんで」 covers both *cause* (why did the ice melt) and *purpose* (why do we keep this rule). The difference is what the なんで aims at, not its wording. That ambiguity is itself a finding: children may not know which of the two they are asking. |
| Not distinct enough to matter? | **No.** It mattered twice in this scene: it best describes Q3, and it is the only move that reaches the root (Q4). |

**Hypothesis to test in later scenes (not a framework change):** the Purpose Probe behaves like a depth check that sits *above* the tools, and matters most in "why is this rule so" scenes. It may matter little in scenes about natural mechanisms (for example, ice melting), where B's causal middle is the real target.

---

## II.7 Question-generation ladder

```
Q1  「なんで、赤信号では止まるの？」
 ↓
A1  「赤は『止まれ』っていう合図なの。赤のときにわたると、車が来て、ぶつかるかもしれないでしょ。あぶないからだよ。」
    depth: RULE + IMMEDIATE REASON + CONSEQUENCE (self)
 ↓
Signal     The reason covers the dangerous case, not the no-car case
 ↓
Diagnosis  Hidden condition "a car is coming"; empty crossings are real counterexamples
 ↓
Tools      C HIGH · D MEDIUM · B MEDIUM · E LOW · A LOW · F LOW · STOP MEDIUM
 ↓
Candidates 車が来てないときは？(H) · 車の信号は何色？(M) · 赤だと、なんで車が来る？(L)
           あぶないって、どういうこと？(L) · 運転手から見たら？(L) · 救急車は？(L)
 ↓
Q2  「じゃあ、車が来てないときは、わたってもいいの？」
    question HIGH · tool C, label MEDIUM · origin Boundary + Answer-internal
 ↓
A2  「それでも止まるんだよ。来てないように見えても、急に車が出てくることがあるからね。それに、赤で止まるのは、きまりだから。」
    depth: IMMEDIATE REASON (widened) + RULE   ← falls back on the rule
 ↓
Signal     「きまりだから」 is given as a reason, but it does not explain why the rule binds when it looks safe
 ↓
Diagnosis  What makes a rule worth keeping when its visible reason is missing (a purpose gap)
 ↓
Tools      B MEDIUM · Purpose Probe HIGH · D MEDIUM/low value · F LOW · C LOW · E LOW · A LOW · STOP LOW
 ↓
Candidates あぶなくないときも、なんで守る？(H) · きまりだと、なんで…？(M)
           だれが決めた？(L, new topic) · 見通しがいい道でも？(L, loop)
           ぼくがわたったら、だれかこまる？(L) · だれも見てなかったら？(L) · やぶったら？(L)
 ↓
Q3  「なんで、あぶなくないときも、きまりを守るの？」
    question HIGH · tool B + Purpose Probe, B label MEDIUM · origin Answer-internal + Purpose + Boundary
 ↓
A3  「自分で『今はだいじょうぶ』って決めると、見まちがえることがあるでしょ。それに、運転してる人は『赤なら、人は止まってる』と思って走ってるんだよ。みんなが同じきまりを守るから、安心して道を使えるの。」
    depth: MECHANISM + rule's function (安心); root purpose not explicit
 ↓
Depth Check  No snag remains (original STOP test: pass)
             Root purpose explicit? No, it stops at 安心 / predictability
 ↓
STOP (original) ── kept as the end of snag-driven questioning
 ↓ (optional synthesis, RETRO)
Q4r 「じゃあ、赤で止まるのは、自分も、車の人も、けがをしないためってこと？」
    question MEDIUM · tool NONE (Purpose Probe) · origin Purpose
 ↓
A4  「そう。ぶつかったら、きみがけがをするし、よけようとした車の人や、まわりの人がけがをすることもある。だから、車が見えなくても、みんな止まるんだよ。」
    depth: ROOT PURPOSE (explicit)
 ↓
これでOK → Root understanding (§II.8)
```

---

## II.8 Final root understanding

### Adult formulation
We stop at red lights to protect ourselves and other people from harm. We stop even when no danger is visible, for two reasons: our own judgment that "it's safe now" can be wrong, and everyone else on the road is acting on the expectation that we will stop. A traffic signal protects people only because everyone keeps it every time. That shared predictability is *how* it protects; preventing harm is *what* it is for.

### Child-facing formulation (age 8+)
> 「赤で止まるのは、じぶんも、まわりの人も、けがをしないため。
> 車が見えなくても止まるのは、じぶんの目は、まちがえることがあるし、車の人は『止まってくれる』と思って走っているから。」

---

## II.9 Final curriculum audit table

| Step | Previous answer depth | Signal | Diagnosis | Question origin | Selected tool | Tool confidence | Selected next question | Question confidence | Depth gained | Curriculum status |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 → Q2 | RULE + IMMEDIATE REASON + CONSEQUENCE (self) | The reason covers the dangerous case, not the no-car case | Hidden condition "a car is coming" | Boundary + Answer-internal | C (D, E also reach it) | MEDIUM | 「じゃあ、車が来てないときは、わたってもいいの？」 | HIGH | **Framing, not level.** Separates danger from rule; A2 does not rise a level. | **YELLOW.** GREEN as a question; YELLOW as a tool exemplar because of the C/D/E overlap. |
| A2 → Q3 | IMMEDIATE REASON (widened) + RULE | 「きまりだから」 does not explain the safe case | What the rule is for when its visible reason is absent | Answer-internal + Purpose + Boundary | B + Purpose Probe | MEDIUM (B) | 「なんで、あぶなくないときも、きまりを守るの？」 | HIGH | **Large.** RULE → MECHANISM + function. | **GREEN as a chain example / YELLOW as a Tool B exemplar.** [ORIGINAL: GREEN] |
| A3 → STOP | MECHANISM + function (安心) | No snag remains | Nothing unresolved for snag-driven questioning | — | NONE | HIGH | これでOK | MEDIUM (STOP correct on snags, early on depth) | — | **GREEN** as a STOP-on-snag example, *paired with* a Depth Check. [ORIGINAL: GREEN] |
| A3 → Q4r (optional, RETRO) | MECHANISM + function (安心) | Root purpose not explicit | Depth gap: 安心 is the means; "no one gets hurt" is the end | Purpose | NONE (Purpose Probe) | HIGH that it is none of A–F | 「じゃあ、赤で止まるのは、自分も、車の人も、けがをしないためってこと？」 | MEDIUM | **Small but decisive.** MECHANISM → explicit ROOT PURPOSE. | **YELLOW.** Right move; wording and age fit need testing with children. |
| A1 → Q2b (branch) | RULE + IMMEDIATE REASON | 「赤 → 車が来る」 link unsaid | The turn-taking model is missing (depends on age) | Answer-internal | B (diagnosis); fact question (wording) | MEDIUM | 「こっちが赤のとき、車の信号は何色なの？」 | MEDIUM | IMMEDIATE REASON → MECHANISM (turn-taking) | **YELLOW** [ORIGINAL] |

---

## II.10 Rejected-path appendix (complete)

"Q-conf" is question-quality confidence. "T-conf" is confidence that the apparent tool is the right label for the move. Rows R1–R10 come from Part I, with their fields completed retrospectively. Rows R11 onward are **[RETRO-ADDED]**.

| # | Followed | Candidate | Signal that seemed to trigger it | Apparent tool | Q-conf | T-conf | Exact reason for rejection |
|---|---|---|---|---|---|---|---|
| R1 | A1 | 「あぶないって、どういうこと？」 | The cue word 「あぶない」 | A | LOW | LOW | The same sentence already says what it means (車が来て、ぶつかる). A cue with no snag. |
| R2 | A1 | 「運転してる人から見たら、どう？」 | Cars are mentioned, so drivers exist | F | LOW | LOW | F fired because drivers *exist*, not because their seat was *ignored*. The child has not wondered about drivers. |
| R3 | A1 | 「赤だと、なんで車が来るの？」 | Unsaid link 「赤 → 車が来る」 | B | LOW | MEDIUM | The diagnosis is right; the template wording is unnatural. Replaced by the fact question in branch 2b. |
| R4 | A2 | 「きまりって、だれが決めたの？」 | 「きまり」 | none (looks like A) | LOW (for this chain) | LOW | Asks about the rule's source or authority, not its meaning. A new inquiry into law and history that does not deepen *why stop*. A legitimate question in its own right. |
| R5 | A2 | 「見通しがいい道でも、急に来るの？」 | 「急に」「ことがある」 | D | LOW | MEDIUM | A valid test, but a loop: it repeats Q2's counterexample pressure and adds nothing. |
| R6 | A2 | 「ぼくがわたったら、だれかこまるの？」 | Crossing affects others (implicit) | F | LOW | LOW | Premature. The child would be guessing the answer before A3 gives it. |
| R7 | A3 | 「でも、守らない人もいるよね？」 | 「みんなが…守る」 | D [ORIGINAL]; C [RETRO] | MEDIUM (C reading) | LOW (D) / MEDIUM (C) | As D, a false signal: 「みんな」 states a condition for the system, not a claim about the world. As C, a real hidden condition. Rejected because it shifts from *why I stop* to *people who don't*. |
| R8 | A3 | 「見まちがえるって、たとえばどんなとき？」 | 「見まちがえる」 | A | LOW | MEDIUM | Answerable, but drifts from *why* into *what to watch for* (safety tips). |
| R9 | A2b | 「人の信号と車の信号が、どっちも赤になることある？」 | Two signal sets (pedestrian / car) | E | LOW | LOW | Clever and factually interesting (Japan has 全赤 intervals), but not something a child asks. |
| R10 | A3 | 「運転してる人から見たら…どうなるの？」 | 「運転してる人は…と思って」 | F | LOW | LOW | The parent had already given the driver's seat. The question only unpacks a B-type middle step. |
| R11 | A1 | 「救急車は、赤でも行くよね？」 | Implicit "everyone stops" | D | LOW (here) | LOW (here) | A genuine exception, but A1 never said 「みんな」, so it has no hook in this answer. Would be a valid D if the adult said 「みんな止まるの」. **[RETRO-ADDED]** |
| R12 | A1 / A2 | 「人も車も赤で止まるけど、同じりゆう？」 | Pedestrians vs cars comparison | E | LOW | LOW | Never arose. No answer compared the two. Adult-designed. **[RETRO-ADDED]** |
| R13 | A1 | 「なんで、止まれは赤なの？」 | 「赤は…合図」 | none | LOW (for this chain) | — | A question about why the colour red was chosen (history or perception). New topic. **[RETRO-ADDED]** |
| R14 | A2b | 「じゅんばんは、だれが決めてるの？」 | 「じゅんばん」 | none | LOW (for this chain) | — | Authority or engineering (signal timing). New topic. [ORIGINAL mention in branch 2b; fields completed RETRO] |
| R15 | A2 | 「じゃあ、だれも見てなかったら、わたってもいい？」 | Rule vs. being watched | C / D | LOW | MEDIUM | Natural, but it turns the rule into a matter of *being caught*: punishment, not purpose. It pulls away from the root. **[RETRO-ADDED]** |
| R16 | A2 | 「きまりをやぶったら、どうなるの？」 | 「きまり」 | none | LOW | — | Moves to penalties. Same risk as R15. **[RETRO-ADDED]** |
| R17 | A3 | 「安心って、どういうこと？」 | 「安心」 | A | LOW | MEDIUM | Formally A, and its answer would reach the root. But 安心 is easy for an 8-year-old to picture, so there is no felt snag. The Q4 check-back does the same job more naturally. **[RETRO-ADDED]** |
| R18 | A3 | 「じゃあ、信号を守るのは、何のため？」 | Root purpose not explicit | NONE (Purpose) | MEDIUM | HIGH (none of A–F) | Not rejected outright: **revised** into Q4r. The original wording is teacher-voiced and widens the scope to all signals. **[RETRO]** |

---

## II.11 Changes to original judgments (logged, not silently applied)

| # | Part I said | Part II says | Why |
|---|---|---|---|
| 1 | A1 → Q2: C and D "equally defensible" | C fit HIGH, D fit MEDIUM; label confidence still MEDIUM | A1 contains an explicit prediction (C's domain) but no explicit broad claim (D's domain). The overlap finding stands. |
| 2 | A2 → Q3: "Tool B · HIGH" | Question HIGH; Tool B label MEDIUM; best reading B + Purpose Probe | Two of the three pieces A3 supplies are function and purpose, not causal steps (§II.4). |
| 3 | A2 → Q3: GREEN | GREEN as a chain example, YELLOW as a Tool B exemplar | Follows from #2. |
| 4 | Part I §E.1: 「きまりだから」 "may be B's strongest home" | Overstated. B's test *locates* the gap well; B's framing (causal middle) *misdescribes* it. | Follows from #2. |
| 5 | A3 → これでOK, confidence HIGH | STOP correct for snags (kept); overall MEDIUM, because the root purpose is not explicit | The formal Depth Check (§II.5) was not applied in the original run. |
| 6 | STOP test: 「自分のことばでこたえられる？」 | Needed but not enough: a child can pass it at the mechanism level | The likely child restatement leaves out the purpose. |
| 7 | R7 as a D false signal | Still rejected, but the C reading is stronger than D and is a real hidden condition | Retrospective tool audit. |

Unchanged: the accepted chain Q1–A3, the choice of Q2 and Q3, the rejection of A on 「あぶない」, the F findings, the C/D/E overlap finding, and the "who decided" finding.

---

## II.12 Final conclusion

### 1. Did the red-light scene produce a natural multi-step questioning chain?
**STRONGLY SUPPORTED** (within a simulated dialogue).
Q2 and Q3 are both questions children actually ask, each grows directly out of the previous answer, and each realistic adult answer made the next question possible without being weakened on purpose. **Limitation:** every adult answer and child question in this report was written by the researcher. Real children and parents have not been observed yet.

### 2. Did diagnosis help *generate* the next questions, or mainly help *evaluate and filter* them?
**PARTIALLY SUPPORTED** as a generative aid.
- **Testing the answer on a real case** did generative work. "Apply A1 to an empty crossing" *is* the thought that produces Q2, and "apply 「きまりだから」 to the safe case" *is* the thought that produces Q3.
- **Choosing a tool** mostly came after, as labelling and filtering: it was used to reject A on 「あぶない」, F on the driver, and D on 「みんな」.
- The original record cannot show whether diagnosis came before the candidate questions (§II.0 caveat). The evidence fits "testing generates, tool choice filters" at least as well as "the tool generates".

### 3. How much did the six tools contribute to generating the chain?
**PARTIALLY SUPPORTED: small generative contribution, moderate filtering contribution.**
- C's template (「もし〇〇じゃなかったら？」) matches Q2, but D's test and E's move reach it too, so no single tool can claim it.
- B's test finds where the gap in Q3 is, but misdescribes what kind of gap it is (§II.4).
- The root purpose (Q4r) is reached by a move that is **not** one of the six tools.
- A, D, E and F contributed mainly as **false positives** that had to be rejected. That is itself useful: knowing *not* to ask 「あぶないって、どういうこと？」 is part of the skill.

### 4. Did the chain naturally reach the root purpose: protecting oneself and others?
**PARTIALLY SUPPORTED.**
Protection of oneself appeared naturally in A1. Other people appeared naturally in A3, but as people who *rely on you*, not as people who could be *hurt*. The snag-driven chain stopped at 「安心して道を使える」, one level short of the root. Reaching the root explicitly needed a Purpose-Probe synthesis (Q4r), which is only moderately natural and, for younger children, may need an adult prompt.

### 5. Does this completed case now contain material strong enough to become a canonical curriculum example?
**PARTIALLY SUPPORTED.**
- **Strong enough as a chain example:** Q1 → Q2 → Q3 → STOP (+ optional Q4r) shows a natural movement from rule, through an exception, to mechanism and then purpose.
- **Strong enough as a counter-example:** the rejection of A on 「あぶない」 clearly shows that a surface cue is not a signal.
- **Not yet strong enough as a single-tool exemplar:** Q2's label is ambiguous (C/D/E), and Q3's label (B) is only MEDIUM.
- **Needs testing before canonical use:** Q4r's wording and age fit, and the pairing of the STOP test with a Depth Check.
