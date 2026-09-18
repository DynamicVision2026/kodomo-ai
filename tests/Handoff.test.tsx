import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach } from 'vitest';
import { Handoff } from '../src/templates/handoff';

afterEach(() => cleanup());

describe('Handoff', () => {
  it('shows the prompt and calls onContinue when tapped', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<Handoff prompt="おとなにわたしてね" continueLabel="つづける" skipLabel="あとでやる" onContinue={onContinue} onSkip={() => {}} />);

    expect(screen.getByText('おとなにわたしてね')).toBeInTheDocument();
    await user.click(screen.getByText('つづける'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip, never onContinue, when the skip label is tapped', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const onSkip = vi.fn();
    render(<Handoff prompt="p" continueLabel="c" skipLabel="あとでやる" onContinue={onContinue} onSkip={onSkip} />);

    await user.click(screen.getByText('あとでやる'));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
