import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PredictionBattle } from '../src/templates/prediction-battle';
import type { PredictionOption } from '../src/engine/predictions';

const options: PredictionOption[] = [
  { key: 'CLEAR', label: 'パンが ふくらむ りゆうを おしえて' },
  { key: 'VAGUE', label: 'パンの こと おしえて' },
  { key: 'OFFTOPIC', label: 'おいしい パンって なに' },
];

const labels = {
  skipLabel: 'あとでやる',
  handoffPrompt: 'おとなにわたしてね',
  handoffContinueLabel: 'つづける',
  handoffSkipLabel: 'あとでやる',
};

let plausible: ReturnType<typeof vi.fn>;

beforeEach(() => {
  plausible = vi.fn();
  window.plausible = plausible;
});

afterEach(() => {
  cleanup();
  delete window.plausible;
});

describe('PredictionBattle', () => {
  it('runs child -> handoff -> parent and completes with both picks, tracking each tap', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<PredictionBattle options={options} onComplete={onComplete} {...labels} />);

    await user.click(screen.getByText('パンの こと おしえて')); // child predicts VAGUE
    expect(plausible).toHaveBeenCalledWith('prediction_made', { props: expect.objectContaining({ who: 'child', pick: 'VAGUE' }) });

    // Handoff screen now shown; the options are gone.
    expect(screen.getByText('おとなにわたしてね')).toBeInTheDocument();
    expect(screen.queryByText('パンの こと おしえて')).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByText('つづける'));

    // Parent's turn: same options reappear.
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて')); // parent predicts CLEAR
    expect(plausible).toHaveBeenCalledWith('prediction_made', { props: expect.objectContaining({ who: 'parent', pick: 'CLEAR' }) });

    expect(onComplete).toHaveBeenCalledWith({ skipped: false, childPick: 'VAGUE', parentPick: 'CLEAR' });
  });

  it('skipping at the child stage completes immediately, without a handoff', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<PredictionBattle options={options} onComplete={onComplete} {...labels} />);

    await user.click(screen.getByText('あとでやる'));
    expect(onComplete).toHaveBeenCalledWith({ skipped: true });
    expect(screen.queryByText('おとなにわたしてね')).not.toBeInTheDocument();
  });

  it('skipping from the handoff screen also completes as skipped', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<PredictionBattle options={options} onComplete={onComplete} {...labels} />);

    await user.click(screen.getByText('おいしい パンって なに'));
    await user.click(screen.getByText('あとでやる')); // handoff's own skip
    expect(onComplete).toHaveBeenCalledWith({ skipped: true });
  });

  it('solo play renders nothing and completes as skipped immediately', () => {
    const onComplete = vi.fn();
    const { container } = render(<PredictionBattle options={options} solo onComplete={onComplete} {...labels} />);

    expect(container).toBeEmptyDOMElement();
    expect(onComplete).toHaveBeenCalledWith({ skipped: true });
  });
});
