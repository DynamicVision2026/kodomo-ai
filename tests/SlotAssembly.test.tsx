import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotAssembly } from '../src/templates/slot-assembly';
import type { ModuleUiStrings, SlotAssemblyPhase } from '../src/engine/types';
import mission from '../src/modules/m1/topics/bread/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const phase = mission.phases[0] as unknown as SlotAssemblyPhase;
const ui = moduleJson.ui as ModuleUiStrings;

beforeEach(() => cleanup());

describe('SlotAssembly template (solo — no prediction battle)', () => {
  it('shows the archetype reaction and completes on a terminal (factual) archetype', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SlotAssembly phase={phase} ui={ui} solo onComplete={onComplete} />);

    await user.click(screen.getByText('パンが ふくらむのは なぜ？'));

    expect(screen.getByText('イーストが はたらくからだよ。')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith({ archetypeKey: 'CLEAR', retries: 0 });
  });

  it('allows free retries on a non-factual (vague/offtopic) archetype without completing', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SlotAssembly phase={phase} ui={ui} solo onComplete={onComplete} />);

    await user.click(screen.getByText('パンのこと おしえて'));
    expect(screen.getByText('パンのこと、ぜんぶ はなすね！ ながいよ！')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText('おいしい パンって なに'));
    expect(screen.getByText('うーん、それは ひとによって ちがうなあ。')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText('パンが ふくらむのは なぜ？'));
    expect(onComplete).toHaveBeenCalledWith({ archetypeKey: 'CLEAR', retries: 2 });
  });

  it('never renders 正解/不正解 anywhere', () => {
    render(<SlotAssembly phase={phase} ui={ui} solo onComplete={() => {}} />);
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.queryByText(/不正解/)).not.toBeInTheDocument();
  });
});

describe('SlotAssembly template (co-play — prediction battle gates round 1)', () => {
  it('shows the battle before any card, using the real card text as prediction options', async () => {
    render(<SlotAssembly phase={phase} ui={ui} solo={false} onComplete={() => {}} />);

    // The battle's options ARE the slot cards' own text — same string, but no card is
    // clickable as a slot-assembly pick yet (there is exactly one match: the battle's button).
    expect(screen.getAllByText('パンが ふくらむのは なぜ？')).toHaveLength(1);
    expect(screen.getByText(ui.predictionSkip)).toBeInTheDocument(); // the battle's own skip label
  });

  it('completing the battle (child -> handoff -> parent) reveals the real cards, and play proceeds normally', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SlotAssembly phase={phase} ui={ui} solo={false} onComplete={onComplete} />);

    await user.click(screen.getByText('パンのこと おしえて')); // child predicts VAGUE
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('パンが ふくらむのは なぜ？')); // parent predicts CLEAR

    // Battle is done; the real slot-assembly cards are now up, and only one round's worth.
    await user.click(screen.getByText('パンが ふくらむのは なぜ？')); // actually play the round
    expect(onComplete).toHaveBeenCalledWith({ archetypeKey: 'CLEAR', retries: 0 });
  });

  it('skipping the battle also reveals the cards immediately', async () => {
    const user = userEvent.setup();
    render(<SlotAssembly phase={phase} ui={ui} solo={false} onComplete={() => {}} />);

    await user.click(screen.getByText(ui.predictionSkip));
    await user.click(screen.getByText('パンが ふくらむのは なぜ？'));
    expect(screen.getByText('イーストが はたらくからだよ。')).toBeInTheDocument();
  });
});
