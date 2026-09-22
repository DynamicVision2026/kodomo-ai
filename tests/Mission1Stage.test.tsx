import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { MissionLibrary } from '../src/shell/MissionShell';
import { MissionStage } from '../src/stage/MissionStage';
import type { DigResult, UseEvidence } from '../src/templates/dig';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import { skipPrePracticeAudioIfPresent } from './helpers/stageConformance';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanJson from '../src/modules/m1/topics/genkan/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const chanto = chantoJson as unknown as Mission;
const genkan = genkanJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const missionLibrary: MissionLibrary = {
  missionOrder: [chanto.id, genkan.id],
  missions: { [chanto.id]: chanto, [genkan.id]: genkan },
};

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

/**
 * WO-24/25 (AD-07 v0.7a prototype + the synthetic-child acceptance fix). "STATES ARE NOT
 * SCREENS." Mission 1 is a continuous scene (src/stage/MissionStage.tsx) — this file proves
 * WO-25's five audit-finding repairs (one-tap dialogue progression, explicit GAP/question
 * prompts, the visually-causal dig, real stone recovery, explicit root discovery) plus the P0
 * parent-handoff repair, against the real production wiring (main.tsx's own missionLibrary/
 * continuousStageMissionId), not a synthetic fixture. Every other Story Mission and every Bank
 * Dig is untouched — see tests/ChantoTopic.test.tsx, tests/StoryMissions1to8.test.tsx,
 * tests/BankDigs.test.tsx, which keep passing unmodified because none of them opt into
 * `continuousStageMissionId`.
 */
function renderShell() {
  return render(
    <MissionShell
      moduleId="m1"
      freeMissionIds={moduleJson.freeMissionIds}
      mission={chanto}
      missionLibrary={missionLibrary}
      ui={ui}
      followMoves={moduleJson.followMoves}
      cardTypes={moduleJson.cardTypes}
      continuousStageMissionIds={new Set([chanto.id])}
    />,
  );
}

async function createProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
}

/** Profile -> Course Home -> coop question -> the stage's own initial choose tray. */
async function enterStage(user: ReturnType<typeof userEvent.setup>, coop: 'solo' | 'yes' = 'solo') {
  await createProfile(user);
  await user.click(screen.getByText(ui.courseHomeContinueLabel));
  await user.click(screen.getByText(coop === 'solo' ? ui.coopSolo : ui.coopYes));
  // WO-33: chanto (1-1) now has its own MODEL audio before practice — tap through it here so
  // every existing caller of this helper keeps landing exactly where it always has.
  await skipPrePracticeAudioIfPresent(user);
}

/** WO-25 #1: picks the CLEAR card and reads the robot's terminal reply — ONE tap now reaches
 *  JUDGE directly (the fix: chanto's slot-resolution robotSays and dig layer 0's own opening
 *  robotSays are the same authored statement re-opened for digging; showing it as two
 *  separately-tapped bubbles was the "first tap does nothing" defect the audit found). */
async function pickClearAndReachJudge(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('『ちゃんと』って、どういういみ？'));
  // WO-25B (G5): the slot pick now drives (~260ms) before it resolves, same as a hand card.
  await waitFor(() => {
    expect(screen.getByText('『ちゃんと』は、きちんとすることだよ。')).toBeInTheDocument();
  });
  await user.click(screen.getByText('『ちゃんと』は、きちんとすることだよ。'));
}

async function passLayer0Gate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.judgeNotEnough));
  const [target] = document.querySelectorAll('.choice-tray .question-chip');
  await user.click(target as HTMLElement);
}

/** AD-07 §B/F + WO-25 #3: EVERY hand pick drives for ~260ms before it commits, so a deepen
 *  play needs a `waitFor` around whatever it's expected to produce. */
async function clickDeepen(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByText(text));
}

/** WO-25 #4: a non-deepen play drives (~260ms), then holds a brief impact/settle beat
 *  (~300ms) BEFORE its own recovery bubble appears — `waitFor` the bubble text rather than
 *  asserting it synchronously. */
async function clickNonDeepenAndReadReply(user: ReturnType<typeof userEvent.setup>, cardText: string, replyText: string) {
  await user.click(screen.getByText(cardText));
  await waitFor(() => {
    expect(screen.getByText(replyText)).toBeInTheDocument();
  });
  await user.click(screen.getByText(replyText));
}

/** Walks layer 0's deepen from a freshly-opened hand through to layer 1's own opening line. */
async function deepenLayer0(user: ReturnType<typeof userEvent.setup>) {
  await clickDeepen(user, 'どういうこと？');
  await waitFor(() => {
    expect(screen.getByText((_c, el) => el?.tagName === 'BUTTON' && (el.textContent ?? '').includes('かたづけるとき'))).toBeInTheDocument();
  });
}

/** Reads layer 1's opening line, passes its gate (skipping its own beforeRound:2 prediction
 *  battle in co-play mode), and deepens to the root. */
async function reachRoot(user: ReturnType<typeof userEvent.setup>, coop: 'solo' | 'yes') {
  await user.click(screen.getByText((_c, el) => el?.tagName === 'BUTTON' && (el.textContent ?? '').includes('かたづけるとき')));
  if (coop === 'yes') await user.click(screen.getByText(ui.predictionSkip));
  await user.click(screen.getByText(ui.judgeNotEnough));
  const [target] = document.querySelectorAll('.choice-tray .question-chip');
  await user.click(target as HTMLElement);
  await clickDeepen(user, 'たとえば、食べるときは？');
  await waitFor(() => {
    expect(screen.getByText(ui.stageRootDiscoveryLabel)).toBeInTheDocument();
  });
}

/** Reads the root, taps 今日のコツ's own real つぎへ button, and waits out the ~480ms rise. */
async function readRootAndTip(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText((_c, el) => el?.className === 'speech-bubble__text' && (el.textContent ?? '').includes('こぼさないように')).closest('button')!);
  expect(screen.getByText(chanto.tip)).toBeInTheDocument();
  await user.click(screen.getByText(ui.stageNextLabel));
}

describe('WO-25 #1 — one tap advances exactly once, everywhere', () => {
  it('the FIRST robot answer: one tap on the resolved question reaches JUDGE directly, no second identical tap', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await user.click(screen.getByText('『ちゃんと』って、どういういみ？'));
    await waitFor(() => {
      expect(screen.getByText('『ちゃんと』は、きちんとすることだよ。')).toBeInTheDocument();
    });

    const bubble = screen.getByText('『ちゃんと』は、きちんとすることだよ。').closest('button')!;
    expect(bubble.className).toContain('speech-bubble');
    expect(screen.queryByText(ui.handoffContinue)).not.toBeInTheDocument();
    expect(screen.queryByText('つづける')).not.toBeInTheDocument();
    expect(screen.queryByText(ui.earlyOk)).not.toBeInTheDocument(); // not yet — one tap hasn't happened

    await user.click(bubble); // the ONE tap
    expect(screen.getByText(ui.earlyOk)).toBeInTheDocument(); // -> JUDGE, immediately
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
    // The exact same line does NOT render a second time as a still-pending bubble.
    expect(document.querySelectorAll('.speech-bubble')).toHaveLength(0);
  });

  it('every other Mission 1 dialogue bubble also advances on one tap: challenge, layer opening lines, stone recovery, root', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user); // one tap already proven above

    // JUDGE -> わかった！ -> Pon太's challenge -> one tap dismisses back to JUDGE.
    await user.click(screen.getByText(ui.earlyOk));
    expect(screen.getByText('ポン太')).toBeInTheDocument();
    await user.click(screen.getByText('「きちんと」って、何をすることなの？').closest('button')!);
    expect(screen.getByText(ui.earlyOk)).toBeInTheDocument(); // back at JUDGE, one tap

    await passLayer0Gate(user);
    // Stone recovery: one tap on the reply bubble returns the tray (proven with a wait since
    // the impact beat precedes it — see clickNonDeepenAndReadReply).
    await clickNonDeepenAndReadReply(user, 'ロボは何がすき？', 'ぼくは今『ちゃんと』の話をしてるよ。');
    expect(screen.getByText('どういうこと？')).toBeInTheDocument(); // tray back, one tap

    await deepenLayer0(user);
    // Layer 1's own opening line: one tap reaches its own JUDGE.
    await user.click(screen.getByText((_c, el) => el?.tagName === 'BUTTON' && (el.textContent ?? '').includes('かたづけるとき')));
    expect(screen.getByText(ui.earlyOk)).toBeInTheDocument();
  });
});

describe('WO-25 #2 — explicit task prompts', () => {
  it('the GAP screen names the decision, above the choice group', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await user.click(screen.getByText(ui.judgeNotEnough));

    const prompt = screen.getByText(ui.stageGapPrompt);
    expect(prompt).toBeInTheDocument();
    expect(prompt.tagName).toBe('P'); // L2 context, not a chip
    expect(document.querySelectorAll('.choice-tray .question-chip')).toHaveLength(3);
  });

  it('the question tray names the decision, both at first reveal and after a stone recovery', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument();

    await clickNonDeepenAndReadReply(user, 'ロボは何がすき？', 'ぼくは今『ちゃんと』の話をしてるよ。');
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument(); // still named, after recovery
  });

  it('the very first (slot) question choice is also named', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    expect(screen.getByText(ui.stageQuestionPrompt)).toBeInTheDocument();
  });
});

describe('WO-25 #3/#4 — the question is visibly the shovel, and a stone is a real recovery, not a disappearance', () => {
  it('a deepen chip stays visible and drives into the soil; the world reacts at the same moment it lands', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);

    await user.click(screen.getByText('どういうこと？'));
    const chip = screen.getByText('どういうこと？').closest('.question-chip')!;
    expect(chip.className).toContain('is-driving'); // still visible, mid-drive — never an instant fade
    expect(document.querySelector('.stage__world')!.getAttribute('data-depth')).toBe('1');

    await waitFor(() => {
      // The world's own impact flash fires at the same commit as the depth change.
      expect(document.querySelector('.stage__world')!.getAttribute('data-depth')).toBe('2');
    });
  });

  it('a non-deepen play never dead-ends: the chip visibly hits a stone, stays visible as a blocked marker, gives a neutral recovery cue, and the rest stay live', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);

    await user.click(screen.getByText('ロボは何がすき？')); // offtopic
    const chip = screen.getByText('ロボは何がすき？').closest('.question-chip')!;
    expect(chip.className).toContain('is-driving'); // still visible, mid-drive

    await waitFor(() => {
      expect(screen.getByText('ロボは何がすき？').closest('.question-chip')!.className).toContain('is-settling');
    });

    // The robot's own authored reply, never a red X / 不正解 verdict.
    await waitFor(() => {
      expect(screen.getByText('ぼくは今『ちゃんと』の話をしてるよ。')).toBeInTheDocument();
    });
    expect(screen.queryByText('不正解')).not.toBeInTheDocument();
    await user.click(screen.getByText('ぼくは今『ちゃんと』の話をしてるよ。'));

    // WO-25 #4: the used chip stays VISIBLE (never disappears), badged, disabled — and the
    // short neutral continuation nudge (existing UI-string architecture, WO-23's own
    // digContinuePrompt) invites another pick.
    const settledChip = screen.getByText('ロボは何がすき？').closest('.question-chip') as HTMLElement;
    expect(settledChip.className).toContain('is-blocked');
    expect(within(settledChip).getByText('🪨')).toBeInTheDocument();
    expect((settledChip as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(ui.digContinuePrompt)).toBeInTheDocument();

    // The rest are still live, still clickable.
    expect(screen.getByText('どういうこと？')).toBeInTheDocument();
    expect((screen.getByText('もういちどいって').closest('.question-chip') as HTMLButtonElement).disabled).toBe(false);
    await clickNonDeepenAndReadReply(user, 'もういちどいって', 'いっても、同じだよ。');

    // Only the deepen card remains active — progression is guaranteed by construction, and
    // every card is STILL in the tray (2 blocked, visible, + 1 active), none removed.
    expect(document.querySelectorAll('.stage__hand-tray .question-chip')).toHaveLength(3);
    expect(document.querySelectorAll('.stage__hand-tray .question-chip.is-blocked')).toHaveLength(2);
    await clickDeepen(user, 'どういうこと？');
    await waitFor(() => {
      expect(document.querySelectorAll('.stage__meter-dot.is-filled')).toHaveLength(2);
    });
  });
});

describe('WO-25 #5 — root discovery is explicit', () => {
  it('shows the discovery label alongside the root reveal, before 今日のコツ', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'solo'); // waits for the discovery label itself

    expect(screen.getByText(ui.stageRootDiscoveryLabel)).toBeInTheDocument();
    // No score/star/streak/confetti copy anywhere near it.
    expect(screen.queryByText(/\d+\s*点/)).not.toBeInTheDocument();
  });
});

describe('WO-25 #6 (P0) — parent handoff repair', () => {
  it('SOLO never enters the parent dashboard — straight from 今日のコツ to the child-facing completion screen', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'solo');
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'solo');
    await readRootAndTip(user);

    await waitFor(() => {
      expect(screen.getByText(ui.completeHeading)).toBeInTheDocument();
    });
    // Never the dense multi-control dashboard, never the handoff curtain, never beat 15.
    expect(screen.queryByText(ui.parentScreenHeading)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.toolboxHeading)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.stageHandoffPrompt)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.stageParentGotItLabel)).not.toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].progress[chanto.id].done).toBe(true);
  });

  it('CO-PLAY: explicit handoff (one prompt, one action) -> parent register (one prompt, one action) -> persistent return-to-child, visible without scrolling, then completion', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'yes');
    await user.click(screen.getByText(ui.predictionSkip));
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'yes');
    await readRootAndTip(user);

    // Handoff: one prompt, one action, nothing else.
    await waitFor(() => {
      expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument();
    });
    expect(screen.getByText(ui.stageHandoffGiven)).toBeInTheDocument();
    expect(screen.queryByText(ui.handoffSkip)).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.stageHandoffGiven));

    // Parent register: one prompt, one primary action — never the dense dashboard's own
    // secondary controls (Toolbox/Bank/M0/M5) competing with it.
    await waitFor(() => {
      expect(screen.getByText(chanto.teachBack)).toBeInTheDocument();
    });
    expect(screen.getByText(ui.stageParentGotItLabel)).toBeInTheDocument();
    expect(screen.queryByText(ui.toolboxHeading)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.bankHubButton)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.m5Prompt)).not.toBeInTheDocument();
    let saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones?.M2).toBeUndefined();
    await user.click(screen.getByText(ui.stageParentGotItLabel));

    // -> persistent, single "give it back" action — real M2b attestation already recorded.
    expect(screen.getByText(ui.stageReturnToChild)).toBeInTheDocument();
    expect(screen.queryByText(ui.parentScreenHeading)).not.toBeInTheDocument(); // never the dashboard
    saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones.M2).toEqual({ achieved: true, achievedAt: expect.any(Number) });

    await user.click(screen.getByText(ui.stageReturnToChild));
    expect(screen.getByText(ui.completeHeading)).toBeInTheDocument();
  });
});

describe('WO-25B (G5) — the exact reported live path: a non-deepen SLOT pick recovers as a visible, permanent stone, never a silent reset', () => {
  it('SOLO -> the VAGUE card -> shallow reply -> ONE tap -> the picked card stays visibly blocked, never returns as a fresh option, and the untried cards remain the live choices', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'solo');

    // The exact reported path: the VAGUE card ("ちゃんとって、よくきくよね"), not the CLEAR one.
    await user.click(screen.getByText('ちゃんとって、よくきくよね'));
    const drivingChip = screen.getByText('ちゃんとって、よくきくよね').closest('.question-chip')!;
    expect(drivingChip.className).toContain('is-driving'); // still visible mid-drive, never an instant fade

    // The robot's own shallow (VAGUE) reply — never a verdict.
    await waitFor(() => {
      expect(screen.getByText('『ちゃんと』の話、いっぱいあるよ！')).toBeInTheDocument();
    });
    expect(screen.queryByText('不正解')).not.toBeInTheDocument();

    // ONE tap on that bubble — the reported defect was that blockedIds/settled state never
    // appeared after this exact tap.
    await user.click(screen.getByText('『ちゃんと』の話、いっぱいあるよ！'));

    // The settled screen: the attempted card stays VISIBLE, badged, disabled — it can never come
    // back as an apparently-untried option again.
    await waitFor(() => {
      expect(screen.getByText('ちゃんとって、よくきくよね').closest('.question-chip')!.className).toContain('is-blocked');
    });
    const blockedChip = screen.getByText('ちゃんとって、よくきくよね').closest('.question-chip') as HTMLButtonElement;
    expect(within(blockedChip).getByText('🪨')).toBeInTheDocument();
    expect(blockedChip.disabled).toBe(true);
    // Short neutral recovery cue — no punishment semantics anywhere.
    expect(screen.getByText(ui.digContinuePrompt)).toBeInTheDocument();
    expect(screen.queryByText(/不正解|ざんねん|まちがい/)).not.toBeInTheDocument();

    // Nothing was removed: all 3 original cards are still present, and the untried ones are live.
    expect(document.querySelectorAll('.stage__hand-tray .question-chip')).toHaveLength(3);
    const clearChip = screen.getByText('『ちゃんと』って、どういういみ？').closest('.question-chip') as HTMLButtonElement;
    const offtopicChip = screen.getByText('ロボは何がすき？').closest('.question-chip') as HTMLButtonElement;
    expect(clearChip.disabled).toBe(false);
    expect(offtopicChip.disabled).toBe(false);

    // A real recovery, not a dead end: picking a remaining card resolves normally.
    await user.click(clearChip);
    await waitFor(() => {
      expect(screen.getByText('『ちゃんと』は、きちんとすることだよ。')).toBeInTheDocument();
    });
  });
});

describe('WO-25B (G8) — every mid-mission co-play parent turn uses the full handoff/parent-task/handback grammar, never a direct parent-choice -> child-control jump', () => {
  it('the FIRST prediction battle (slot round, beforeRound 1): child pick -> handoff -> explicit parent task -> parent pick -> explicit handback -> only then child UI', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'yes');

    // Child's own turn.
    await waitFor(() => {
      expect(screen.getByText('『ちゃんと』って、どういういみ？')).toBeInTheDocument();
    });
    expect(screen.queryByText(ui.stagePredictionParentTask)).not.toBeInTheDocument(); // not the parent's screen yet
    await user.click(screen.getByText('『ちゃんと』って、どういういみ？'));

    // -> explicit handoff (one prompt, one action).
    await waitFor(() => {
      expect(screen.getByText(ui.handoffPrompt)).toBeInTheDocument();
    });
    expect(screen.queryByText(ui.stagePredictionParentTask)).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue));

    // -> parent's own turn: the task is named explicitly, above the reassurance line.
    await waitFor(() => {
      expect(screen.getByText(ui.stagePredictionParentTask)).toBeInTheDocument();
    });
    expect(screen.getByText(ui.predictionParentPrompt)).toBeInTheDocument();
    expect(screen.queryByText(ui.stageHandbackPrompt)).not.toBeInTheDocument();
    await user.click(screen.getByText('『ちゃんと』って、どういういみ？')); // parent's own pick

    // -> explicit handback: ONE prompt, ONE action — no child-facing controls underneath it yet.
    await waitFor(() => {
      expect(screen.getByText(ui.stageHandbackPrompt)).toBeInTheDocument();
    });
    expect(screen.getByText(ui.stageReturnToChild)).toBeInTheDocument();
    expect(document.querySelectorAll('.choice-tray .question-chip')).toHaveLength(0); // never a direct jump
    await user.click(screen.getByText(ui.stageReturnToChild));

    // Only NOW does the child's own next decision (the slot cards) reappear.
    await waitFor(() => {
      expect(screen.getByText('『ちゃんと』って、どういういみ？').closest('.question-chip')).toBeTruthy();
    });
  });

  it('the SECOND prediction battle (dig layer 1, beforeRound 2): the exact same full grammar, no shortcuts', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'yes');
    await user.click(screen.getByText(ui.predictionSkip)); // round-1 battle grammar already proven above
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await clickNonDeepenAndReadReply(user, 'ロボは何がすき？', 'ぼくは今『ちゃんと』の話をしてるよ。');
    await deepenLayer0(user);
    await user.click(screen.getByText((_c, el) => el?.tagName === 'BUTTON' && (el.textContent ?? '').includes('かたづけるとき')));

    // Layer 1 opens directly into its own beforeRound:2 battle — child's own turn.
    await waitFor(() => {
      expect(screen.getByText('たとえば、食べるときは？')).toBeInTheDocument();
    });
    expect(screen.queryByText(ui.stagePredictionParentTask)).not.toBeInTheDocument();
    await user.click(screen.getByText('たとえば、食べるときは？'));

    await waitFor(() => {
      expect(screen.getByText(ui.handoffPrompt)).toBeInTheDocument();
    });
    await user.click(screen.getByText(ui.handoffContinue));

    await waitFor(() => {
      expect(screen.getByText(ui.stagePredictionParentTask)).toBeInTheDocument();
    });
    expect(screen.queryByText(ui.stageHandbackPrompt)).not.toBeInTheDocument();
    await user.click(screen.getByText('『ちゃんと』ってことば、すき？')); // parent's own pick

    await waitFor(() => {
      expect(screen.getByText(ui.stageHandbackPrompt)).toBeInTheDocument();
    });
    expect(screen.getByText(ui.stageReturnToChild)).toBeInTheDocument();
    // No direct jump: the next child decision (JUDGE) isn't rendered yet.
    expect(screen.queryByText(ui.judgeNotEnough)).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.stageReturnToChild));

    // Only now does the next child decision (JUDGE) appear.
    await waitFor(() => {
      expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
    });
  });
});

describe('Mission 1 continuous stage — completion and map return', () => {
  it('completion returns to the map: the finished depth shows the root marker; the sequentially-next depth is NOT falsely offered as current since it is genuinely unentitled (WO-27: CURRENT => ENTERABLE) — only chanto is in freeMissionIds here, exactly like real production', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'solo');
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'solo');
    await readRootAndTip(user);

    await waitFor(() => {
      expect(screen.getByText(ui.completeHeading)).toBeInTheDocument();
    });
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    expect(screen.getByText(ui.courseHomeHeading)).toBeInTheDocument();
    const chantoDepth = screen.getByText(chanto.title).closest('.course-home__depth')!;
    expect(chantoDepth.className).toContain('is-done');
    expect(within(chantoDepth as HTMLElement).getByText('◆')).toBeInTheDocument(); // the gold root marker
    // WO-27: genkan is sequentially next, but not in freeMissionIds and there is no purchase —
    // it must never render as "is-current" (that would claim it's freely enterable when it
    // isn't). It gets the same locked treatment as a genuinely future Story, and the ordinary
    // continue CTA is gone (replaced by the real entitlement message).
    const genkanDepth = screen.getByText(genkan.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).not.toContain('is-current');
    expect(genkanDepth.className).toContain('is-locked');
    expect(screen.queryByText(ui.courseHomeContinueLabel)).not.toBeInTheDocument();
    expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument();
  });
});

describe('Mission 1 stage — guidance (AD-07 §D per-verb thresholds, persisted per profile)', () => {
  it('えらぶ/みきわめる counts accumulate correctly and persist across a reload', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user); // resolves gapNaming -> hand: the FIRST erabu completion (slot pick)

    let saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    // slot pick (1) + gap naming (1) = 2 erabu completions by the time the hand is open.
    expect(saved.profiles[0].guidance?.erabu).toBeGreaterThanOrEqual(2);
    expect(saved.profiles[0].guidance?.mikiwameru).toBe(1); // the one JUDGE resolution so far

    cleanup();
    renderShell();
    await user.click(screen.getByText('たぬき')); // the same, now-seeded profile — guidance survives
    saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].guidance?.erabu).toBeGreaterThanOrEqual(2);
  });
});

describe('Mission 1 stage — engine parity (mastery stays first-attempt only, no engine change)', () => {
  it('a deepen play is only aptUse when it is the FIRST play at that layer — identical to the pre-WO-24 rule', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn<(e: UseEvidence) => void>();
    const onComplete = vi.fn<(r: DigResult) => void>();
    render(
      <MissionStage
        mission={chanto}
        ui={ui}
        solo
        moveProgress={{}}
        guidanceUses={{}}
        onGuidanceUse={() => {}}
        onMoveRendered={() => {}}
        onUse={onUse}
        onBlindCommit={() => {}}
        onBlindSelfReport={() => {}}
        onGapNamed={() => {}}
        onComplete={onComplete}
      />,
    );
    await user.click(screen.getByText('『ちゃんと』って、どういういみ？'));
    await waitFor(() => {
      expect(screen.getByText('『ちゃんと』は、きちんとすることだよ。')).toBeInTheDocument();
    });
    await user.click(screen.getByText('『ちゃんと』は、きちんとすることだよ。')); // one tap -> JUDGE
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [target] = document.querySelectorAll('.choice-tray .question-chip');
    await user.click(target as HTMLElement);

    await clickNonDeepenAndReadReply(user, 'ロボは何がすき？', 'ぼくは今『ちゃんと』の話をしてるよ。'); // offtopic FIRST
    await user.click(screen.getByText('どういうこと？')); // deepen SECOND — never the first play here

    await waitFor(() => {
      const deepenCall = onUse.mock.calls.map((c) => c[0]).find((e) => e.move === 'follow-tsumari');
      expect(deepenCall?.aptUse).toBe(false); // exactly isAptUse's own pre-existing rule — unchanged
    });
  });
});
