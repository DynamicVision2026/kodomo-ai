import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import missionJson from '../src/modules/m2-test/topics/dummy/s3.json';
import moduleJson from '../src/modules/m2-test/module.json';

const mission = missionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

/**
 * Spec v0.5 §13 acceptance criterion: "A dummy /modules/m2-test with one new card type and a
 * dummy s3.json both render without touching /engine." src/modules/m2-test/ introduces a new
 * card kind ("check") and a stage-3 mission. The only non-content changes this needed were in
 * src/ui/cardKinds.ts (a new icon/corner entry, shared by QuestionChip/PrintCard since WO-23
 * WP-2) — nothing under src/engine (types, resolver, digMachine, storage, entitlements,
 * analytics, predictions) changed to support it. This test
 * proves it actually renders and plays through MissionShell unmodified, not just that the JSON
 * parses.
 */
describe('m2-test extensibility fixture', () => {
  it('renders a brand-new card kind and a stage-3 mission through the unmodified shell', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m2-test" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);

    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    // hasAccess passes (m2-test-dummy is in freeMissionIds) straight to the coop question.
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
    await user.click(screen.getByText(ui.coopSolo));

    // The new "check" kind card renders, styled distinctly (cardKinds.ts's new icon/corner
    // entry, shared by QuestionChip — WO-23 WP-2 split the old Card.tsx into QuestionChip
    // (digital) and PrintCard (physical); this fixture exercises the digital path).
    const card = screen.getByText('これで ただしいか みなおしてみよう').closest('button')!;
    expect(card.className).toContain('question-chip--check');

    // This dummy fixture has only one phase, so completing it goes straight to the tip screen
    // in the same tick (the archetype's own response never gets a separate visible frame here
    // — real content avoids that by having the next phase's opening line repeat it, as bread's
    // slot-assembly -> dig hand-off does; irrelevant to what this test is actually proving).
    await user.click(card);
    expect(screen.getByText(mission.tip)).toBeInTheDocument();
  });

  it('marks the dummy mission done in storage, same as any other module', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m2-test" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🐰'));
    await user.click(screen.getByText('うさぎ'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('これで ただしいか みなおしてみよう'));

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].progress['m2-test-dummy'].done).toBe(true);
  });
});
