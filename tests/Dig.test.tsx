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

describe('Dig template (solo — no prediction battle)', () => {
  it('is playable from bread/s2.json alone: two deepen taps reach the root', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={phase} ui={ui} solo onComplete={onComplete} />);

    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
    // The ねっこ screen renders and stays up — onComplete doesn't fire until the player
    // acknowledges it, so they actually get to read it (not an instant hand-off).
    expect(screen.getByText(phase.root.robotSays)).toBeInTheDocument();
    expect(screen.getByText(phase.root.label)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText(ui.earlyOk));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('a non-deepen card shows a flat reply and does not advance', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} solo onComplete={() => {}} />);

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

    await user.click(screen.getByText('なぜ イーストで ふくらむの？')); // layer 0's deepen -> enters layer 1
    // Layer 1's robotSays is visible immediately, but its hand is replaced by the battle: the
    // same card text appears (the battle's options ARE the hand's own cards), just as a
    // prediction-battle option rather than a playable dig hand card.
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
    expect(screen.getByText(ui.predictionSkip)).toBeInTheDocument();
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText('なぜ ガスが 出ると ふくらむの？').className).toBe('prediction-battle__option');
  });

  it('completing the battle reveals the hand, and play proceeds to the root normally', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={phase} ui={ui} solo={false} onComplete={onComplete} />);

    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText('さとうは あまいの？')); // child predicts f5
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？')); // parent predicts f4 (the real deepen)

    // Battle resolved; the real hand is now up. Play it for real.
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
    expect(screen.getByText(phase.root.robotSays)).toBeInTheDocument();

    await user.click(screen.getByText(ui.earlyOk));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('the これでOK button is disabled while a battle is showing', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} ui={ui} solo={false} onComplete={() => {}} />);

    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    expect(screen.getByText(ui.earlyOk)).toBeDisabled();
  });
});
