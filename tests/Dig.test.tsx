import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dig } from '../src/templates/dig';
import type { DigPhase, ModuleUiStrings } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const phase = mission.phases[1] as unknown as DigPhase;
const ui = moduleJson.ui as ModuleUiStrings;

/** WO-04/WO-07: DigProps Dig.test.tsx doesn't otherwise exercise — a fixed missionId, empty
 *  moveProgress (never Blind-first eligible by default), and no-op evidence callbacks, since
 *  these tests are about Dig's own dig-phase behaviour. */
const baseDigProps = {
  missionId: mission.id, moveProgress: {}, onMoveRendered: () => {}, onUse: () => {},
  onBlindCommit: () => {}, onBlindSelfReport: () => {},
};

beforeEach(() => cleanup());

/** WO-02/WO-03: every layer's hand sits behind 「これでOK？」 -> Gap Naming (any of the three
 *  authored choices — AD-01's no-verdict rule means it never matters which one). */
async function passGate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.judgeNotEnough));
  const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
  await user.click(firstChoice as HTMLElement);
}

describe('Dig template (solo — no prediction battle)', () => {
  it('is playable from bread/s2.json alone: two deepen taps reach the root', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={onComplete} />);

    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await passGate(user);
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
    // The ねっこ screen renders and stays up — onComplete doesn't fire until the player
    // acknowledges it, so they actually get to read it (not an instant hand-off).
    expect(screen.getByText(phase.root.robotSays)).toBeInTheDocument();
    expect(screen.getByText(phase.root.label)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText(ui.earlyOk));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('blocks a direct follow-up tap before the judgment gate is passed', async () => {
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    // Fresh layer 0: only the judgment gate is up, not the hand.
    expect(screen.queryByText('なぜ イーストで ふくらむの？')).not.toBeInTheDocument();
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
  });

  it('"not enough" reaches Gap Naming with exactly the target and both authored distractors, no follow-up selectable yet', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    expect(screen.getByText('イーストが はたらく しくみが わからない')).toBeInTheDocument(); // target
    expect(screen.getByText('なにが パンを ふくらませるのか わからない')).toBeInTheDocument(); // answered
    expect(screen.getByText('ポン太の パンが ぺちゃんこだった りゆうが わからない')).toBeInTheDocument(); // other-layer
    expect(document.querySelectorAll('.dig__gap-naming-option')).toHaveLength(3);
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.queryByText('なぜ イーストで ふくらむの？')).not.toBeInTheDocument();
  });

  it('choosing a distractor gap reveals the same complete, unfiltered hand as choosing the target', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    // Deliberately name a DISTRACTOR, not the target, to prove the hand isn't filtered by choice.
    await user.click(screen.getByText('なにが パンを ふくらませるのか わからない'));

    expect(document.querySelectorAll('.dig__gap-naming-option')).toHaveLength(0);
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
    expect(screen.getByText('パンは すきですか？')).toBeInTheDocument();
    expect(screen.getByText('もう いちど いって')).toBeInTheDocument();
  });

  it('produces no correct/incorrect indication for either the target or a distractor', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    // All three options share one class — nothing distinguishes the target visually.
    const options = [...document.querySelectorAll('.dig__gap-naming-option')];
    expect(options.map((o) => o.className)).toEqual(options.map(() => 'dig__gap-naming-option'));
    await user.click(options[0] as HTMLElement);
    expect(screen.queryByText(/正解|不正解|せいかい|ざんねん/)).not.toBeInTheDocument();
  });

  it('records gap_named with the classification of the choice actually made', async () => {
    const plausible = vi.fn();
    window.plausible = plausible;
    try {
      const user = userEvent.setup();
      render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);
      await user.click(screen.getByText(ui.judgeNotEnough));
      await user.click(screen.getByText('イーストが はたらく しくみが わからない')); // the target
      expect(plausible).toHaveBeenCalledWith(
        'gap_named',
        expect.objectContaining({ props: expect.objectContaining({ classification: 'target' }) }),
      );
    } finally {
      delete (window as { plausible?: unknown }).plausible;
    }
  });

  it('これでOK still shows the challenge even while Gap Naming choices are up', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    await user.click(screen.getByText(ui.earlyOk));
    expect(screen.getByText('ポン太')).toBeInTheDocument();
  });

  it('a non-deepen card shows a flat reply and does not advance', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('パンは すきですか？'));
    expect(screen.getByText('ぼくは たべられないんだ。')).toBeInTheDocument();
    // Still on layer 0: the deepen card for this layer is still on screen.
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
  });

  it('tapping the early-ok button always shows the challenge, never blocks play', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.earlyOk));
    expect(screen.getByText('ポン太')).toBeInTheDocument();
    expect(screen.getByText('イーストって なにを してるの？')).toBeInTheDocument();
  });

  it('never renders 正解/不正解 anywhere', () => {
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.queryByText(/不正解/)).not.toBeInTheDocument();
  });
});

describe('Dig template (WO-04 scaffold evidence)', () => {
  it('fires onMoveRendered with the layer\'s deepen move as soon as its hand is revealed', async () => {
    const user = userEvent.setup();
    const onMoveRendered = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={() => {}} onMoveRendered={onMoveRendered} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} solo onComplete={() => {}} />);

    expect(onMoveRendered).not.toHaveBeenCalled(); // not yet — still at the judgment gate
    await passGate(user);
    expect(onMoveRendered).toHaveBeenCalledWith('follow-naze');
  });

  it('fires onUse with the full required record when a card carrying a move is played, qualifying as apt_use on the first play', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？')); // f1: layer 0's deepen, first play
    expect(onUse).toHaveBeenCalledTimes(1);
    const [evidence] = onUse.mock.calls[0]!;
    expect(evidence).toMatchObject({
      move: 'follow-naze', domain: 'しぜん・かがく', missionId: mission.id, layerIndex: 0, aptUse: true,
    });
    expect(typeof evidence.timestamp).toBe('number');
  });

  it('Correction 01: an offtopic play is still use evidence (no move), and the deepen after it does not qualify as apt_use', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('パンは すきですか？')); // f2: offtopic — still recorded as a play
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0]![0]).toMatchObject({ move: undefined, domain: undefined, aptUse: false });

    await user.click(screen.getByText('なぜ イーストで ふくらむの？')); // f1: deepen, but NOT the first play anymore
    expect(onUse).toHaveBeenCalledTimes(2);
    expect(onUse.mock.calls[1]![0]).toMatchObject({ move: 'follow-naze', aptUse: false });
  });

  it('Correction 01: a repeat play before the deepen also disqualifies it from apt_use', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('もう いちど いって')); // f3: repeat — still recorded as a play
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0]![0]).toMatchObject({ move: undefined, domain: undefined, aptUse: false });

    await user.click(screen.getByText('なぜ イーストで ふくらむの？')); // f1: deepen, but NOT the first play anymore
    expect(onUse).toHaveBeenCalledTimes(2);
    expect(onUse.mock.calls[1]![0]).toMatchObject({ move: 'follow-naze', aptUse: false });
  });

  it('Correction 01: a sideways play before the deepen also disqualifies it from apt_use', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} solo={false} onComplete={() => {}} />);

    // Reach layer 1 (its own prediction battle auto-skips in solo... this render is co-play, so
    // walk the battle instead — same path tests/Dig.test.tsx's co-play describe block uses).
    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？')); // layer 0's deepen -> enters layer 1
    await user.click(screen.getByText('さとうは あまいの？')); // child predicts f5
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？')); // parent predicts f4
    onUse.mockClear(); // discard layer 0's evidence — this test is about layer 1 only
    await passGate(user);

    await user.click(screen.getByText('さとうは あまいの？')); // f5: sideways — still recorded as a play
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0]![0]).toMatchObject({ move: undefined, domain: undefined, aptUse: false });

    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？')); // f4: deepen, but NOT the first play anymore
    expect(onUse).toHaveBeenCalledTimes(2);
    expect(onUse.mock.calls[1]![0]).toMatchObject({ move: 'follow-naze', aptUse: false });
  });

  it('Gap Naming target vs distractor choice has no effect on the resulting onUse evidence', async () => {
    const targetUse = vi.fn();
    const distractorUse = vi.fn();
    const userA = userEvent.setup();
    const { unmount } = render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={targetUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} solo onComplete={() => {}} />);
    await userA.click(screen.getByText(ui.judgeNotEnough));
    await userA.click(screen.getByText('イーストが はたらく しくみが わからない')); // the target
    await userA.click(screen.getByText('なぜ イーストで ふくらむの？'));
    unmount();

    const userB = userEvent.setup();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={distractorUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} solo onComplete={() => {}} />);
    await userB.click(screen.getByText(ui.judgeNotEnough));
    await userB.click(screen.getByText('なにが パンを ふくらませるのか わからない')); // an answered distractor
    await userB.click(screen.getByText('なぜ イーストで ふくらむの？'));

    const [targetEvidence] = targetUse.mock.calls[0]!;
    const [distractorEvidence] = distractorUse.mock.calls[0]!;
    expect({ ...targetEvidence, timestamp: 0 }).toEqual({ ...distractorEvidence, timestamp: 0 });
  });
});

describe('Dig template (WO-07 Blind-first)', () => {
  const eligibleProgress = { 'follow-naze': { rung: 'tsukaeru' as const, aptUseDomains: ['日常', 'ことば', '社会とひと'] } };
  const belowThresholdProgress = { 'follow-naze': { rung: 'moratta' as const, aptUseDomains: ['日常'] } };

  it('below tsukaeru, Gap Naming still resolves straight to the hand (unchanged pre-WO-07 flow)', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={belowThresholdProgress} solo onComplete={() => {}} />);
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
    expect(document.querySelector('.dig__blind-commit')).not.toBeInTheDocument();
  });

  it('at tsukaeru, Gap Naming leads to Blind-first with the hand hidden, no card selectable', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} solo onComplete={() => {}} />);
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);

    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.queryByText('なぜ イーストで ふくらむの？')).not.toBeInTheDocument();
    expect(screen.getByText(ui.blindCommit)).toBeInTheDocument();
  });

  it('merely rendering Blind-first does not advance progression (no onBlindCommit call)', async () => {
    const user = userEvent.setup();
    const onBlindCommit = vi.fn();
    render(
      <Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} onBlindCommit={onBlindCommit} solo onComplete={() => {}} />,
    );
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);
    expect(screen.getByText(ui.blindCommit)).toBeInTheDocument();
    expect(onBlindCommit).not.toHaveBeenCalled();
  });

  it('committing 「いえた」 records blind_commit for the layer\'s move and reveals the complete, unchanged hand', async () => {
    const user = userEvent.setup();
    const onBlindCommit = vi.fn();
    render(
      <Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} onBlindCommit={onBlindCommit} solo onComplete={() => {}} />,
    );
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);
    await user.click(screen.getByText(ui.blindCommit));

    expect(onBlindCommit).toHaveBeenCalledTimes(1);
    expect(onBlindCommit).toHaveBeenCalledWith('follow-naze');
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
    expect(screen.getByText('パンは すきですか？')).toBeInTheDocument();
    expect(screen.getByText('もう いちど いって')).toBeInTheDocument();
  });

  it('the hand is fully playable immediately after commit, without requiring a self-report first', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} solo onComplete={() => {}} />);
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);
    await user.click(screen.getByText(ui.blindCommit));

    // Self-report is showing, but playing a card works right away regardless.
    expect(screen.getByText(ui.blindSelfReportSame)).toBeInTheDocument();
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
  });

  it('all three blind_selfreport choices are non-evaluative: each records evidence and none affects progression', async () => {
    for (const [buttonKey, classification] of [
      ['blindSelfReportSame', 'same'],
      ['blindSelfReportBetter', 'better'],
      ['blindSelfReportDifferent', 'different'],
    ] as const) {
      const user = userEvent.setup();
      const onBlindSelfReport = vi.fn();
      const { unmount } = render(
        <Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} onBlindSelfReport={onBlindSelfReport} solo onComplete={() => {}} />,
      );
      await user.click(screen.getByText(ui.judgeNotEnough));
      const [choice] = document.querySelectorAll('.dig__gap-naming-option');
      await user.click(choice as HTMLElement);
      await user.click(screen.getByText(ui.blindCommit));
      await user.click(screen.getByText(ui[buttonKey]));

      expect(onBlindSelfReport).toHaveBeenCalledTimes(1);
      expect(onBlindSelfReport).toHaveBeenCalledWith(
        expect.objectContaining({ move: 'follow-naze', classification }),
      );
      // The self-report row disappears once answered; the hand remains, unfiltered.
      expect(screen.queryByText(ui.blindSelfReportSame)).not.toBeInTheDocument();
      expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
      unmount();
    }
  });

  it('never introduces text input, audio capture, or any evaluative UI', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} solo onComplete={() => {}} />);
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);
    expect(document.querySelectorAll('input, textarea, [contenteditable="true"]')).toHaveLength(0);
    await user.click(screen.getByText(ui.blindCommit));
    expect(document.querySelectorAll('input, textarea, [contenteditable="true"], audio')).toHaveLength(0);
    expect(screen.queryByText(/正解|不正解|せいかい|ざんねん/)).not.toBeInTheDocument();
  });

  it('target vs. distractor Gap Naming produces identical Blind-first behaviour', async () => {
    const targetCommit = vi.fn();
    const userA = userEvent.setup();
    const { unmount } = render(
      <Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} onBlindCommit={targetCommit} solo onComplete={() => {}} />,
    );
    await userA.click(screen.getByText(ui.judgeNotEnough));
    await userA.click(screen.getByText('イーストが はたらく しくみが わからない')); // the target
    expect(screen.getByText(ui.blindCommit)).toBeInTheDocument();
    await userA.click(screen.getByText(ui.blindCommit));
    unmount();

    const distractorCommit = vi.fn();
    const userB = userEvent.setup();
    render(
      <Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} onBlindCommit={distractorCommit} solo onComplete={() => {}} />,
    );
    await userB.click(screen.getByText(ui.judgeNotEnough));
    await userB.click(screen.getByText('なにが パンを ふくらませるのか わからない')); // a distractor
    expect(screen.getByText(ui.blindCommit)).toBeInTheDocument();
    await userB.click(screen.getByText(ui.blindCommit));

    expect(targetCommit.mock.calls).toEqual(distractorCommit.mock.calls);
  });
});

describe('Dig template (co-play — layer 1\'s prediction battle gates its hand)', () => {
  it('shows the battle instead of the hand on entering layer 1, using the hand cards\' own text', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo={false} onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？')); // layer 0's deepen -> enters layer 1
    // Layer 1's robotSays is visible immediately, but its hand is replaced by the battle: the
    // same card text appears (the battle's options ARE the hand's own cards), just as a
    // prediction-battle option rather than a playable dig hand card.
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
    expect(screen.getByText(ui.predictionSkip)).toBeInTheDocument();
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText('なぜ ガスが 出ると ふくらむの？').className).toBe('prediction-battle__option');
  });

  it('completing the battle still requires the judgment gate before the hand appears', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo={false} onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText('さとうは あまいの？')); // child predicts f5
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？')); // parent predicts f4 (the real deepen)

    // Battle resolved, but layer 1 is a fresh robot answer: the gate is up, not the hand.
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
  });

  it('completing the battle then the gate reveals the hand, and play proceeds to the root normally', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo={false} onComplete={onComplete} />);

    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText('さとうは あまいの？')); // child predicts f5
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？')); // parent predicts f4 (the real deepen)

    // Battle resolved; pass layer 1's own judgment gate, then the real hand is up.
    await passGate(user);
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
    expect(screen.getByText(phase.root.robotSays)).toBeInTheDocument();

    await user.click(screen.getByText(ui.earlyOk));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('the これでOK button is disabled while a battle is showing, but enabled at the judgment gate', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo={false} onComplete={() => {}} />);

    // Layer 0 has no battle: これでOK is enabled right at the gate.
    expect(screen.getByText(ui.earlyOk)).toBeEnabled();

    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    expect(screen.getByText(ui.earlyOk)).toBeDisabled();
  });
});
