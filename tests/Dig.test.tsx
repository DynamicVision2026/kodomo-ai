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
  onBlindCommit: () => {}, onBlindSelfReport: () => {}, onGapNamed: () => {},
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
    await user.click(screen.getByText('イーストは なにを してるの？'));
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await passGate(user);
    await user.click(screen.getByText('ガスが 出ると、どうして ふくらむの？'));
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
    expect(screen.queryByText('イーストは なにを してるの？')).not.toBeInTheDocument();
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
  });

  it('"not enough" reaches Gap Naming with exactly the target and both authored distractors, no follow-up selectable yet', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    expect(screen.getByText('イーストが どう はたらくのか わからない')).toBeInTheDocument(); // target
    expect(screen.getByText('なにが パンを ふくらませるのか わからない')).toBeInTheDocument(); // answered
    expect(screen.getByText('ポン太の パンが ぺちゃんこだったのは なぜ？')).toBeInTheDocument(); // other-layer
    expect(document.querySelectorAll('.dig__gap-naming-option')).toHaveLength(3);
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.queryByText('イーストは なにを してるの？')).not.toBeInTheDocument();
  });

  it('choosing a distractor gap reveals the same complete, unfiltered hand as choosing the target', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    // Deliberately name a DISTRACTOR, not the target, to prove the hand isn't filtered by choice.
    await user.click(screen.getByText('なにが パンを ふくらませるのか わからない'));

    expect(document.querySelectorAll('.dig__gap-naming-option')).toHaveLength(0);
    expect(screen.getByText('イーストは なにを してるの？')).toBeInTheDocument();
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
      await user.click(screen.getByText('イーストが どう はたらくのか わからない')); // the target
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
    expect(screen.getByText('イーストは なにを してるの？')).toBeInTheDocument();
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
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={() => {}} onMoveRendered={onMoveRendered} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={() => {}} solo onComplete={() => {}} />);

    expect(onMoveRendered).not.toHaveBeenCalled(); // not yet — still at the judgment gate
    await passGate(user);
    expect(onMoveRendered).toHaveBeenCalledWith('follow-naze');
  });

  it('fires onUse with the full required record when a card carrying a move is played, qualifying as apt_use on the first play', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={() => {}} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('イーストは なにを してるの？')); // f1: layer 0's deepen, first play
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
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={() => {}} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('パンは すきですか？')); // f2: offtopic — still recorded as a play
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0]![0]).toMatchObject({ move: undefined, domain: undefined, aptUse: false });

    await user.click(screen.getByText('イーストは なにを してるの？')); // f1: deepen, but NOT the first play anymore
    expect(onUse).toHaveBeenCalledTimes(2);
    expect(onUse.mock.calls[1]![0]).toMatchObject({ move: 'follow-naze', aptUse: false });
  });

  it('Correction 01: a repeat play before the deepen also disqualifies it from apt_use', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={() => {}} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('もう いちど いって')); // f3: repeat — still recorded as a play
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0]![0]).toMatchObject({ move: undefined, domain: undefined, aptUse: false });

    await user.click(screen.getByText('イーストは なにを してるの？')); // f1: deepen, but NOT the first play anymore
    expect(onUse).toHaveBeenCalledTimes(2);
    expect(onUse.mock.calls[1]![0]).toMatchObject({ move: 'follow-naze', aptUse: false });
  });

  it('Correction 01: a sideways play before the deepen also disqualifies it from apt_use', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={onUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={() => {}} solo={false} onComplete={() => {}} />);

    // Reach layer 1 (its own prediction battle auto-skips in solo... this render is co-play, so
    // walk the battle instead — same path tests/Dig.test.tsx's co-play describe block uses).
    await passGate(user);
    await user.click(screen.getByText('イーストは なにを してるの？')); // layer 0's deepen -> enters layer 1
    await user.click(screen.getByText('さとうは あまいの？')); // child predicts f5
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('ガスが 出ると、どうして ふくらむの？')); // parent predicts f4
    onUse.mockClear(); // discard layer 0's evidence — this test is about layer 1 only
    await passGate(user);

    await user.click(screen.getByText('さとうは あまいの？')); // f5: sideways — still recorded as a play
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0]![0]).toMatchObject({ move: undefined, domain: undefined, aptUse: false });

    await user.click(screen.getByText('ガスが 出ると、どうして ふくらむの？')); // f4: deepen, but NOT the first play anymore
    expect(onUse).toHaveBeenCalledTimes(2);
    expect(onUse.mock.calls[1]![0]).toMatchObject({ move: 'follow-naze', aptUse: false });
  });

  it('Gap Naming target vs distractor choice has no effect on the resulting onUse evidence', async () => {
    const targetUse = vi.fn();
    const distractorUse = vi.fn();
    const userA = userEvent.setup();
    const { unmount } = render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={targetUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={() => {}} solo onComplete={() => {}} />);
    await userA.click(screen.getByText(ui.judgeNotEnough));
    await userA.click(screen.getByText('イーストが どう はたらくのか わからない')); // the target
    await userA.click(screen.getByText('イーストは なにを してるの？'));
    unmount();

    const userB = userEvent.setup();
    render(<Dig phase={phase} ui={ui} missionId={mission.id} onUse={distractorUse} onMoveRendered={() => {}} moveProgress={{}} onBlindCommit={() => {}} onBlindSelfReport={() => {}} onGapNamed={() => {}} solo onComplete={() => {}} />);
    await userB.click(screen.getByText(ui.judgeNotEnough));
    await userB.click(screen.getByText('なにが パンを ふくらませるのか わからない')); // an answered distractor
    await userB.click(screen.getByText('イーストは なにを してるの？'));

    const [targetEvidence] = targetUse.mock.calls[0]!;
    const [distractorEvidence] = distractorUse.mock.calls[0]!;
    expect({ ...targetEvidence, timestamp: 0 }).toEqual({ ...distractorEvidence, timestamp: 0 });
  });
});

describe('Dig template (WO-08 milestone/memory evidence taps)', () => {
  it('fires onGapNamed with the missionId as soon as Gap Naming resolves via the target', async () => {
    const user = userEvent.setup();
    const onGapNamed = vi.fn();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} onGapNamed={onGapNamed} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    expect(onGapNamed).not.toHaveBeenCalled(); // not yet — only the three choices are up
    await user.click(screen.getByText('イーストが どう はたらくのか わからない')); // the target
    expect(onGapNamed).toHaveBeenCalledTimes(1);
    expect(onGapNamed).toHaveBeenCalledWith({ missionId: mission.id });
  });

  it('fires onGapNamed identically when a distractor is chosen instead of the target', async () => {
    const user = userEvent.setup();
    const onGapNamed = vi.fn();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} onGapNamed={onGapNamed} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    await user.click(screen.getByText('なにが パンを ふくらませるのか わからない')); // an answered distractor
    expect(onGapNamed).toHaveBeenCalledTimes(1);
    expect(onGapNamed).toHaveBeenCalledWith({ missionId: mission.id });
  });

  it('fires onGapNamed once per layer\'s own Gap Naming resolution', async () => {
    const user = userEvent.setup();
    const onGapNamed = vi.fn();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} onGapNamed={onGapNamed} solo onComplete={() => {}} />);

    await passGate(user); // layer 0's Gap Naming
    expect(onGapNamed).toHaveBeenCalledTimes(1);
    await user.click(screen.getByText('イーストは なにを してるの？')); // layer 0's deepen -> layer 1
    await passGate(user); // layer 1's Gap Naming
    expect(onGapNamed).toHaveBeenCalledTimes(2);
  });

  it('onComplete\'s DigResult carries the phase\'s own authored layer count on the normal root-then-これでOK path', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo onComplete={onComplete} />);

    await passGate(user);
    await user.click(screen.getByText('イーストは なにを してるの？'));
    await passGate(user);
    await user.click(screen.getByText('ガスが 出ると、どうして ふくらむの？'));
    await user.click(screen.getByText(ui.earlyOk));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0]).toMatchObject({ layerCount: phase.layers.length });
  });

  // bread's s2.json authors an earlyOk challenge on every layer, so tapping これでOK before the
  // root never finishes the phase directly there — Dig.tsx's second onComplete call site
  // (tapOk's `if (next.finished) onComplete(...)` after tapEarlyOk) only fires for a layer with
  // no authored earlyOk. A minimal synthetic single-layer phase exercises that path directly.
  const noEarlyOkPhase: DigPhase = {
    template: 'dig',
    layers: [
      {
        robotSays: 'ロボの こたえ',
        claims: [],
        hand: [{ id: 'd1', text: 'なぜ？', tag: 'deepen', move: 'follow-naze', domain: '日常' }],
        replies: {},
        gap: 'わからない こと',
        gapDistractors: [
          { text: 'べつの こたえ', kind: 'answered' },
          { text: 'べつの そう', kind: 'other-layer' },
        ],
      },
    ],
    root: { robotSays: 'ねっこの こたえ', claims: [], label: 'ねっこ' },
  };

  it('onComplete\'s DigResult also carries the layer count on the early-ok-triggers-finish edge case (a layer with no authored earlyOk)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={noEarlyOkPhase} ui={ui} {...baseDigProps} solo onComplete={onComplete} />);

    await user.click(screen.getByText(ui.earlyOk));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0]).toMatchObject({ layerCount: 1 });
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
    expect(screen.getByText('イーストは なにを してるの？')).toBeInTheDocument();
    expect(document.querySelector('.dig__blind-commit')).not.toBeInTheDocument();
  });

  it('at tsukaeru, Gap Naming leads to Blind-first with the hand hidden, no card selectable', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} moveProgress={eligibleProgress} solo onComplete={() => {}} />);
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);

    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.queryByText('イーストは なにを してるの？')).not.toBeInTheDocument();
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
    expect(screen.getByText('イーストは なにを してるの？')).toBeInTheDocument();
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
    await user.click(screen.getByText('イーストは なにを してるの？'));
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
      expect(screen.getByText('イーストは なにを してるの？')).toBeInTheDocument();
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
    await userA.click(screen.getByText('イーストが どう はたらくのか わからない')); // the target
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
    await user.click(screen.getByText('イーストは なにを してるの？')); // layer 0's deepen -> enters layer 1
    // Layer 1's robotSays is visible immediately, but its hand is replaced by the battle: the
    // same card text appears (the battle's options ARE the hand's own cards), just as a
    // prediction-battle option rather than a playable dig hand card.
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
    expect(screen.getByText(ui.predictionSkip)).toBeInTheDocument();
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText('ガスが 出ると、どうして ふくらむの？').className).toBe('prediction-battle__option');
  });

  it('completing the battle still requires the judgment gate before the hand appears', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo={false} onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('イーストは なにを してるの？'));
    await user.click(screen.getByText('さとうは あまいの？')); // child predicts f5
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('ガスが 出ると、どうして ふくらむの？')); // parent predicts f4 (the real deepen)

    // Battle resolved, but layer 1 is a fresh robot answer: the gate is up, not the hand.
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
  });

  it('completing the battle then the gate reveals the hand, and play proceeds to the root normally', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={phase} ui={ui} {...baseDigProps} solo={false} onComplete={onComplete} />);

    await passGate(user);
    await user.click(screen.getByText('イーストは なにを してるの？'));
    await user.click(screen.getByText('さとうは あまいの？')); // child predicts f5
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('ガスが 出ると、どうして ふくらむの？')); // parent predicts f4 (the real deepen)

    // Battle resolved; pass layer 1's own judgment gate, then the real hand is up.
    await passGate(user);
    await user.click(screen.getByText('ガスが 出ると、どうして ふくらむの？'));
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
    await user.click(screen.getByText('イーストは なにを してるの？'));
    expect(screen.getByText(ui.earlyOk)).toBeDisabled();
  });
});

/** WO-20: a layer whose hand offers TWO deepen cards (the child genuinely chooses which move to
 *  follow — Missions 1-7/1-8), each carrying a distinct move/domain. Synthetic, not real content
 *  — proves the mechanism, mirroring how other Dig.test.tsx fixtures are hand-built. */
const multiDeepenPhase: DigPhase = {
  template: 'dig',
  layers: [
    {
      robotSays: 'かすときも、あるよ。',
      claims: ['nonfactual'],
      gap: 'いつも かすのか わからない',
      gapDistractors: [
        { text: 'かさないこともあるのは わかった', kind: 'answered' },
        { text: 'べつのそう', kind: 'other-layer' },
      ],
      hand: [
        { id: 'x1', text: 'なんで？', tag: 'deepen', move: 'follow-naze', domain: '日常' },
        { id: 'x2', text: 'たとえば？', tag: 'deepen', move: 'follow-tatoeba', domain: '日常' },
        { id: 'x3', text: 'もういちどいって', tag: 'repeat' },
      ],
      replies: { repeat: 'もういちど。' },
    },
  ],
  root: { robotSays: 'ねっこだよ、りゆうがあるんだね。', claims: ['nonfactual'], label: 'ねっこ' },
};

describe('Dig template — WO-20 multi-deepen layers (child genuinely chooses the move)', () => {
  it('either deepen card advances the layer to the root — a genuine choice, not a fixed single path', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={multiDeepenPhase} ui={ui} {...baseDigProps} solo onComplete={onComplete} />);

    await passGate(user);
    expect(screen.getByText('なんで？')).toBeInTheDocument();
    expect(screen.getByText('たとえば？')).toBeInTheDocument();
    await user.click(screen.getByText('たとえば？')); // child picks the SECOND deepen card
    expect(screen.getByText('ねっこだよ、りゆうがあるんだね。')).toBeInTheDocument();
  });

  it('rendering the hand fires onMoveRendered for EVERY deepen move in it, not just one', async () => {
    const user = userEvent.setup();
    const onMoveRendered = vi.fn();
    render(<Dig phase={multiDeepenPhase} ui={ui} {...baseDigProps} onMoveRendered={onMoveRendered} solo onComplete={() => {}} />);

    await passGate(user);
    expect(onMoveRendered).toHaveBeenCalledWith('follow-naze');
    expect(onMoveRendered).toHaveBeenCalledWith('follow-tatoeba');
  });

  it('playing either deepen card attributes onUse evidence to the SPECIFIC move the child actually played, never both, never neither', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<Dig phase={multiDeepenPhase} ui={ui} {...baseDigProps} onUse={onUse} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('なんで？'));
    const moveArgs = onUse.mock.calls.map((c) => c[0].move);
    expect(moveArgs).toContain('follow-naze');
    expect(moveArgs).not.toContain('follow-tatoeba');
  });

  it('a multi-deepen layer is never Blind-first eligible, even when every one of its moves is already at tsukaeru — no scoring/ranking of which move the child would have picked', async () => {
    const user = userEvent.setup();
    const moveProgress = {
      'follow-naze': { rung: 'tsukaeru' as const, aptUseDomains: ['日常', 'ことば', '社会とひと'] },
      'follow-tatoeba': { rung: 'tsukaeru' as const, aptUseDomains: ['日常', 'ことば', '社会とひと'] },
    };
    render(<Dig phase={multiDeepenPhase} ui={ui} {...baseDigProps} moveProgress={moveProgress} solo onComplete={() => {}} />);

    await passGate(user);
    // Blind-first would hide the hand behind a 「いえた」 commit button; instead the full,
    // unfiltered hand (both choices) is immediately visible, exactly as for an ineligible layer.
    expect(document.querySelector('.dig__blind-commit')).not.toBeInTheDocument();
    expect(screen.getByText('なんで？')).toBeInTheDocument();
    expect(screen.getByText('たとえば？')).toBeInTheDocument();
  });

  it('every existing single-deepen layer (bread/s2.json) is completely unaffected — still exactly one rendered move, still Blind-first eligible at tsukaeru', async () => {
    const user = userEvent.setup();
    const onMoveRendered = vi.fn();
    const moveProgress = { 'follow-naze': { rung: 'tsukaeru' as const, aptUseDomains: ['日常', 'ことば', '社会とひと'] } };
    render(<Dig phase={phase} ui={ui} {...baseDigProps} onMoveRendered={onMoveRendered} moveProgress={moveProgress} solo onComplete={() => {}} />);

    await passGate(user);
    expect(onMoveRendered).toHaveBeenCalledTimes(1);
    expect(onMoveRendered).toHaveBeenCalledWith('follow-naze');
    // Still Blind-first eligible exactly as before WO-20 — the hand is hidden behind 「いえた」.
    expect(document.querySelector('.dig__blind-commit')).toBeInTheDocument();
  });
});
