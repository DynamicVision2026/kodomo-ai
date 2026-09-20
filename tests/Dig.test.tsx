import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dig } from '../src/templates/dig';
import type { DigPhase, ModuleUiStrings } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const phase = mission.phases[1] as unknown as DigPhase;
const ui = moduleJson.ui as ModuleUiStrings;

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
    render(<Dig phase={phase} ui={ui} solo onComplete={onComplete} />);

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
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

    // Fresh layer 0: only the judgment gate is up, not the hand.
    expect(screen.queryByText('なぜ イーストで ふくらむの？')).not.toBeInTheDocument();
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
  });

  it('"not enough" reaches Gap Naming with exactly the target and both authored distractors, no follow-up selectable yet', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

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
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

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
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

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
      render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);
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
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.judgeNotEnough));
    await user.click(screen.getByText(ui.earlyOk));
    expect(screen.getByText('ポン太')).toBeInTheDocument();
  });

  it('a non-deepen card shows a flat reply and does not advance', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

    await passGate(user);
    await user.click(screen.getByText('パンは すきですか？'));
    expect(screen.getByText('ぼくは たべられないんだ。')).toBeInTheDocument();
    // Still on layer 0: the deepen card for this layer is still on screen.
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
  });

  it('tapping the early-ok button always shows the challenge, never blocks play', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

    await user.click(screen.getByText(ui.earlyOk));
    expect(screen.getByText('ポン太')).toBeInTheDocument();
    expect(screen.getByText('イーストって なにを してるの？')).toBeInTheDocument();
  });

  it('never renders 正解/不正解 anywhere', () => {
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.queryByText(/不正解/)).not.toBeInTheDocument();
  });
});

describe('Dig template (co-play — layer 1\'s prediction battle gates its hand)', () => {
  it('shows the battle instead of the hand on entering layer 1, using the hand cards\' own text', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} solo={false} onComplete={() => {}} />);

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
    render(<Dig phase={phase} ui={ui} solo={false} onComplete={() => {}} />);

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
    render(<Dig phase={phase} ui={ui} solo={false} onComplete={onComplete} />);

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
    render(<Dig phase={phase} ui={ui} solo={false} onComplete={() => {}} />);

    // Layer 0 has no battle: これでOK is enabled right at the gate.
    expect(screen.getByText(ui.earlyOk)).toBeEnabled();

    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    expect(screen.getByText(ui.earlyOk)).toBeDisabled();
  });
});
