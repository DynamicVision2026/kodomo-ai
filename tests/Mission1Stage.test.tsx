import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { MissionLibrary } from '../src/shell/MissionShell';
import { MissionStage } from '../src/stage/MissionStage';
import type { DigResult, UseEvidence } from '../src/templates/dig';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
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
 * WO-24 (AD-07 v0.7a prototype): "STATES ARE NOT SCREENS." Mission 1 is now a continuous scene
 * (src/stage/MissionStage.tsx) — this file proves the section 17 functional requirements, plus
 * the follow-up gap closures (beat 13's real つぎへ button, JUDGE's SHOW pulse, per-verb guidance
 * thresholds, beat 15's parent teach-back, and the drive/settle/rise motion), against the real
 * production wiring (main.tsx's own missionLibrary/continuousStageMissionId), not a synthetic
 * fixture. Every other Story Mission and every Bank Dig is untouched — see
 * tests/ChantoTopic.test.tsx, tests/StoryMissions1to8.test.tsx, tests/BankDigs.test.tsx, which
 * keep passing unmodified because none of them opt into `continuousStageMissionId`.
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
      continuousStageMissionId={chanto.id}
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
}

/** Picks the CLEAR card, reads the robot's terminal reply, reaches JUDGE for layer 0.
 *  Chanto's own authored content echoes the same line twice on purpose — the slot phase's
 *  CLEAR archetype robotSays and dig layer 0's own opening robotSays are the identical string
 *  ("『ちゃんと』は、きちんとすることだよ。"), so reaching JUDGE takes two separate dialogue
 *  taps on that text: one to read the slot's resolution, one to read the layer's own answer. */
async function pickClearAndReachJudge(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('『ちゃんと』って、どういういみ？'));
  await user.click(screen.getByText('『ちゃんと』は、きちんとすることだよ。')); // slot resolution read
  await user.click(screen.getByText('『ちゃんと』は、きちんとすることだよ。')); // layer 0's own opening read
}

async function passLayer0Gate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.judgeNotEnough));
  const [target] = document.querySelectorAll('.choice-tray .question-chip');
  await user.click(target as HTMLElement);
}

/** AD-07 §B/F: a deepen pick drives the chip into the soil for ~260ms before the world actually
 *  descends — the real commit (state change, root/next-layer reveal) lands slightly after the
 *  click resolves, so every deepen play needs a `waitFor` around whatever it's expected to
 *  produce, rather than asserting synchronously the way a non-deepen play still safely can. */
async function clickDeepen(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByText(text));
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
    expect(screen.getByText((_c, el) => el?.className === 'speech-bubble__text' && (el.textContent ?? '').includes('こぼさないように'))).toBeInTheDocument();
  });
}

/** Reads the root, taps 今日のコツ's own real つぎへ button, and waits out the ~480ms rise. */
async function readRootAndTip(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText((_c, el) => el?.className === 'speech-bubble__text' && (el.textContent ?? '').includes('こぼさないように')).closest('button')!);
  expect(screen.getByText(chanto.tip)).toBeInTheDocument();
  await user.click(screen.getByText(ui.stageNextLabel));
}

describe('Mission 1 continuous stage (WO-24, AD-07 prototype)', () => {
  it('launches from the map (Course Home) into the stage\'s own choose tray', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    expect(screen.getByText('『ちゃんと』って、どういういみ？')).toBeInTheDocument();
    expect(screen.getByText('ロボは何がすき？')).toBeInTheDocument(); // the offtopic initial card
  });

  it('dialogue advances by tapping the bubble, with no generic Next button anywhere near it', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await user.click(screen.getByText('『ちゃんと』って、どういういみ？'));

    const bubble = screen.getByText('『ちゃんと』は、きちんとすることだよ。').closest('button')!;
    expect(bubble.className).toContain('speech-bubble');
    expect(screen.queryByText(ui.handoffContinue)).not.toBeInTheDocument();
    expect(screen.queryByText('つづける')).not.toBeInTheDocument();

    await user.click(bubble); // the bubble itself IS the interaction target -> the slot resolution read
    // Chanto's slot CLEAR reply and dig layer 0's own opening line are the identical authored
    // string, so the very next beat is a fresh dialogue bubble with the same text (layer 0's own
    // robotSays) — reading it too is what actually reaches JUDGE.
    const secondBubble = screen.getByText('『ちゃんと』は、きちんとすることだよ。').closest('button')!;
    expect(screen.queryByText(ui.handoffContinue)).not.toBeInTheDocument();
    await user.click(secondBubble);
    expect(screen.getByText(ui.earlyOk)).toBeInTheDocument(); // -> JUDGE
  });

  it('JUDGE shows exactly the two intended choices, pulsing alternately at SHOW, and わかった！never appears anywhere else', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);

    // Not yet at JUDGE: still choosing the initial question.
    expect(screen.queryByText(ui.earlyOk)).not.toBeInTheDocument();

    await pickClearAndReachJudge(user);
    const judgeButtons = document.querySelectorAll('.stage__judge-buttons button');
    expect(judgeButtons).toHaveLength(2);
    expect(screen.getByText(ui.earlyOk)).toBeInTheDocument();
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
    // AD-07 §4C/§9: a brand-new profile is at SHOW for みきわめる — both buttons pulse alternately.
    const judgeButtonsRow = document.querySelector('.stage__judge-buttons')!;
    expect(judgeButtonsRow.className).toContain('stage__judge-buttons--show');

    // もうちょっと聞く -> Gap Naming: わかった！ is gone again.
    await user.click(screen.getByText(ui.judgeNotEnough));
    expect(screen.queryByText(ui.earlyOk)).not.toBeInTheDocument();

    // Naming any gap reveals the hand: still gone.
    const [target] = document.querySelectorAll('.choice-tray .question-chip');
    await user.click(target as HTMLElement);
    expect(screen.queryByText(ui.earlyOk)).not.toBeInTheDocument();
  });

  it('selecting a gap reveals the question tray, and a deepen pick progresses the depth', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);

    await user.click(screen.getByText(ui.judgeNotEnough));
    expect(document.querySelectorAll('.choice-tray .question-chip')).toHaveLength(3); // gap + 2 distractors

    const [gapChoice] = document.querySelectorAll('.choice-tray .question-chip');
    await user.click(gapChoice as HTMLElement);
    // The question tray: all 3 of layer 0's authored hand cards, undifferentiated.
    expect(screen.getByText('どういうこと？')).toBeInTheDocument();
    expect(screen.getByText('ロボは何がすき？')).toBeInTheDocument();
    expect(screen.getByText('もういちどいって')).toBeInTheDocument();

    const filledBefore = document.querySelectorAll('.stage__meter-dot.is-filled').length;
    await clickDeepen(user, 'どういうこと？'); // the deepen card — drives into the soil first
    await waitFor(() => {
      const filledAfter = document.querySelectorAll('.stage__meter-dot.is-filled').length;
      expect(filledAfter).toBe(filledBefore + 1);
    });
  });

  it('a deepen chip visibly drives into the soil before the world descends', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);

    await user.click(screen.getByText('どういうこと？'));
    // AD-07 §B/F "the question is the shovel": the chip itself carries the drive animation
    // immediately — before the world has descended to layer 2 at all.
    const chip = screen.getByText('どういうこと？').closest('.question-chip')!;
    expect(chip.className).toContain('is-driving');
    expect(document.querySelector('.stage__world')!.getAttribute('data-depth')).toBe('1');

    await waitFor(() => {
      expect(document.querySelector('.stage__world')!.getAttribute('data-depth')).toBe('2');
    });
  });

  it('a non-deepen play never dead-ends: the chip settles out, the rest stay live, progression is still guaranteed', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [gapChoice] = document.querySelectorAll('.choice-tray .question-chip');
    await user.click(gapChoice as HTMLElement);

    await user.click(screen.getByText('ロボは何がすき？')); // offtopic — non-deepen, settles immediately
    // AD-07 §4E: the robot's natural flat reply, read as dialogue, never a red X / 不正解.
    expect(screen.getByText('ぼくは今『ちゃんと』の話をしてるよ。')).toBeInTheDocument();
    expect(screen.queryByText('不正解')).not.toBeInTheDocument();
    await user.click(screen.getByText('ぼくは今『ちゃんと』の話をしてるよ。')); // dialogue tap returns the tray

    // AD-07 §5: the used chip is gone; the rest are still live, still clickable.
    expect(screen.queryByText('ロボは何がすき？')).not.toBeInTheDocument();
    expect(screen.getByText('どういうこと？')).toBeInTheDocument();
    expect(screen.getByText('もういちどいって')).toBeInTheDocument();
    await user.click(screen.getByText('もういちどいって')); // repeat — also non-deepen, also settles
    await user.click(screen.getByText('うーん、さっきと同じ答えになっちゃった。'));

    // Only the deepen card remains — progression is now guaranteed by construction.
    expect(document.querySelectorAll('.stage__hand-tray .question-chip')).toHaveLength(1);
    expect(screen.getByText('どういうこと？')).toBeInTheDocument();
    await clickDeepen(user, 'どういうこと？');
    await waitFor(() => {
      expect(document.querySelectorAll('.stage__meter-dot.is-filled')).toHaveLength(2);
    });
  });

  it('reaches the root, then 今日のコツ as a real つぎへ button (not a dialogue bubble)', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user);
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'solo');

    // AD-07 beat 13: "one line, large... no bubble here, so a button" — never a speech-bubble.
    await user.click(screen.getByText((_c, el) => el?.className === 'speech-bubble__text' && (el.textContent ?? '').includes('こぼさないように')).closest('button')!);
    const tipLine = screen.getByText(chanto.tip);
    expect(tipLine.closest('button')).toBeNull();
    expect(tipLine.className).not.toContain('speech-bubble'); // not a dialogue bubble
    expect(screen.getByText(ui.stageNextLabel).tagName).toBe('BUTTON');
  });

  it('solo play skips the handoff sequence entirely — straight from 今日のコツ to the parent screen', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'solo');
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'solo');
    await readRootAndTip(user);

    await waitFor(() => {
      expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();
    });
    expect(screen.queryByText(ui.stageHandoffPrompt)).not.toBeInTheDocument();
    expect(screen.queryByText(ui.stageParentGotItLabel)).not.toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].progress[chanto.id].done).toBe(true);
  });

  it('co-play reaches the stage\'s own single-action handoff straight after 今日のコツ (child sees only the prompt and one button)', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'yes');

    // Slot round 1's own prediction battle (pre-existing mechanism, untouched) — skip through it.
    await user.click(screen.getByText(ui.predictionSkip));
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'yes');
    await readRootAndTip(user);

    await waitFor(() => {
      expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument();
    });
    expect(screen.getByText(ui.stageHandoffGiven)).toBeInTheDocument();
    expect(screen.queryByText(ui.handoffSkip)).not.toBeInTheDocument(); // AD-07 §4D: one action only
    expect(screen.queryByText(chanto.teachBack)).not.toBeInTheDocument(); // moved to beat 15, not shown here
  });

  it('beat 15: the parent\'s own teach-back turn — clean register, one prompt, one action, feeds the real M2b attestation, then returns to the child', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'yes');
    await user.click(screen.getByText(ui.predictionSkip));
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'yes');
    await readRootAndTip(user);
    await waitFor(() => {
      expect(screen.getByText(ui.stageHandoffGiven)).toBeInTheDocument();
    });
    await user.click(screen.getByText(ui.stageHandoffGiven));

    // Clean parent register: the mission's own authored teach-back line, plus おうちトーク as
    // read-only context, ONE dedicated action — never the generic handoffContinue/m2ConfirmAction.
    await waitFor(() => {
      expect(screen.getByText(chanto.teachBack)).toBeInTheDocument();
    });
    expect(screen.getByText(chanto.ouchiTalk)).toBeInTheDocument();
    expect(screen.getByText(ui.stageParentGotItLabel)).toBeInTheDocument();
    const parentRegister = screen.getByText(chanto.teachBack).closest('.mission-shell__wrapper--parent');
    expect(parentRegister).not.toBeNull();

    let saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones?.M2).toBeUndefined(); // not yet confirmed

    await user.click(screen.getByText(ui.stageParentGotItLabel));

    // -> explicit return to the child register: the ordinary parent screen, M2b already
    // confirmed by that one なるほど！ tap (the real applyM2Confirmed path, not a new mechanism).
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();
    expect(screen.getByText(ui.m2ConfirmedMessage)).toBeInTheDocument();
    expect(screen.queryByText(ui.m2ConfirmAction)).not.toBeInTheDocument();
    saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones.M2).toEqual({ achieved: true, achievedAt: expect.any(Number) });
  });

  it('completion returns to the map: the finished depth shows the root marker, the next depth becomes current', async () => {
    const user = userEvent.setup();
    renderShell();
    await enterStage(user, 'solo');
    await pickClearAndReachJudge(user);
    await passLayer0Gate(user);
    await deepenLayer0(user);
    await reachRoot(user, 'solo');
    await readRootAndTip(user);

    // Solo landed on the parent screen; its own final action uses Mission 1's "return to child" copy.
    await waitFor(() => {
      expect(screen.getByText(ui.stageReturnToChild)).toBeInTheDocument();
    });
    await user.click(screen.getByText(ui.stageReturnToChild));
    await user.click(screen.getByText(ui.completeBackToMapLabel));

    expect(screen.getByText(ui.courseHomeHeading)).toBeInTheDocument();
    const chantoDepth = screen.getByText(chanto.title).closest('.course-home__depth')!;
    expect(chantoDepth.className).toContain('is-done');
    expect(within(chantoDepth as HTMLElement).getByText('◆')).toBeInTheDocument(); // the gold root marker
    const genkanDepth = screen.getByText(genkan.title).closest('.course-home__depth')!;
    expect(genkanDepth.className).toContain('is-current');
  });
});

describe('Mission 1 stage — guidance (AD-07 §D per-verb thresholds, persisted per profile)', () => {
  it('えらぶ steps SHOW -> NUDGE at its 1st use and persists across a reload', async () => {
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
    await user.click(screen.getByText('『ちゃんと』は、きちんとすることだよ。')); // slot resolution read
    await user.click(screen.getByText('『ちゃんと』は、きちんとすることだよ。')); // layer 0's own opening read
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [target] = document.querySelectorAll('.choice-tray .question-chip');
    await user.click(target as HTMLElement);

    await user.click(screen.getByText('ロボは何がすき？')); // offtopic FIRST
    await user.click(screen.getByText('ぼくは今『ちゃんと』の話をしてるよ。'));
    await user.click(screen.getByText('どういうこと？')); // deepen SECOND — never the first play here

    await waitFor(() => {
      const deepenCall = onUse.mock.calls.map((c) => c[0]).find((e) => e.move === 'follow-tsumari');
      expect(deepenCall?.aptUse).toBe(false); // exactly isAptUse's own pre-existing rule — unchanged
    });
  });
});
