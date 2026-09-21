import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import missionJson from '../src/modules/stage1-test/topics/dummy/s1.json';
import moduleJson from '../src/modules/stage1-test/module.json';

const mission = missionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

/**
 * Sprint 1-A acceptance criterion (docs/work-order-w2-stage-expansion.md §2.6): the m2-test
 * extensibility fixture proved Stage 3 renders through the unmodified shell with no /engine
 * changes. This is the same proof at Stage 1 — the tightest STAGE_LIMITS entry (bareUpTo: 0,
 * maxSentence: 20) — confirming spec §13's "no /engine changes" promise now holds across all
 * three stages, not just Stage 2 and Stage 3.
 */
describe('stage1-test extensibility fixture', () => {
  it('renders a Stage 1 mission through the unmodified shell', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="stage1-test" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);

    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
    await user.click(screen.getByText(ui.coopSolo));

    await user.click(screen.getByText('おしえて ほしいな'));
    expect(screen.getByText(mission.tip)).toBeInTheDocument();
  });

  it('marks the dummy mission done in storage, same as any other module', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="stage1-test" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🐰'));
    await user.click(screen.getByText('うさぎ'));
    await user.click(screen.getByText(ui.profileConfirm));
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('おしえて ほしいな'));

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].progress['stage1-test-dummy'].done).toBe(true);
  });
});
