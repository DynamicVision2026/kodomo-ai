import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dig } from '../src/templates/dig';
import type { DigPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const phase = mission.phases[1] as unknown as DigPhase;
const earlyOkLabel = moduleJson.ui.earlyOk;

beforeEach(() => cleanup());

describe('Dig template', () => {
  it('is playable from bread/s2.json alone: two deepen taps reach the root', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Dig phase={phase} earlyOkLabel={earlyOkLabel} onComplete={onComplete} />);

    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    expect(screen.getByText('イーストが さとうを たべて、ガスを 出すんだ。')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText('そのガスは どこへ いくの？'));
    // The ねっこ screen renders and stays up — onComplete doesn't fire until the player
    // acknowledges it, so they actually get to read it (not an instant hand-off).
    expect(screen.getByText(phase.root.robotSays)).toBeInTheDocument();
    expect(screen.getByText(phase.root.label)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText(earlyOkLabel));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('a non-deepen card shows a flat reply and does not advance', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} earlyOkLabel={earlyOkLabel} onComplete={() => {}} />);

    await user.click(screen.getByText('パンは すきですか？'));
    expect(screen.getByText('ぼくは たべられないんだ。')).toBeInTheDocument();
    // Still on layer 0: the deepen card for this layer is still on screen.
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
  });

  it('tapping the early-ok button always shows the challenge, never blocks play', async () => {
    const user = userEvent.setup();
    render(<Dig phase={phase} earlyOkLabel={earlyOkLabel} onComplete={() => {}} />);

    await user.click(screen.getByText(earlyOkLabel));
    expect(screen.getByText('ポン太')).toBeInTheDocument();
    expect(screen.getByText('イーストって なにを してるの？')).toBeInTheDocument();
  });

  it('never renders 正解/不正解 anywhere', () => {
    render(<Dig phase={phase} earlyOkLabel={earlyOkLabel} onComplete={() => {}} />);
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.queryByText(/不正解/)).not.toBeInTheDocument();
  });
});
