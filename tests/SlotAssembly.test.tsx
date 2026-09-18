import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotAssembly } from '../src/templates/slot-assembly';
import type { SlotAssemblyPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';

const phase = mission.phases[0] as unknown as SlotAssemblyPhase;

beforeEach(() => cleanup());

describe('SlotAssembly template', () => {
  it('shows the archetype reaction and completes on a terminal (factual) archetype', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SlotAssembly phase={phase} onComplete={onComplete} />);

    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));

    expect(screen.getByText('イーストが はたらくからだよ。')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith({ archetypeKey: 'CLEAR', retries: 0 });
  });

  it('allows free retries on a non-factual (vague/offtopic) archetype without completing', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SlotAssembly phase={phase} onComplete={onComplete} />);

    await user.click(screen.getByText('パンの こと おしえて'));
    expect(screen.getByText('パンの はなしを ぜんぶ するね！ ながいよ！')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText('おいしい パンって なに'));
    expect(screen.getByText('うーん、それは ひとによって ちがうなあ。')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    expect(onComplete).toHaveBeenCalledWith({ archetypeKey: 'CLEAR', retries: 2 });
  });

  it('never renders 正解/不正解 anywhere', () => {
    render(<SlotAssembly phase={phase} onComplete={() => {}} />);
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.queryByText(/不正解/)).not.toBeInTheDocument();
  });
});
