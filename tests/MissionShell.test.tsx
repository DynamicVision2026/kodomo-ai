import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import missionJson from '../src/modules/m1/topics/bread/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const mission = missionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const digPhase = mission.phases[1] as DigPhase;

let plausible: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  plausible = vi.fn();
  window.plausible = plausible;
});

afterEach(() => {
  cleanup();
  delete window.plausible;
});

/** mission.tip contains ruby markup ({問|もん}), which getByText can't match as one literal
 *  string once rendered — match on the element whose own text starts with the un-annotated
 *  prefix instead. */
function byTextStartingWith(prefix: string) {
  return (_content: string, element: Element | null) =>
    element?.tagName === 'P' && (element.textContent ?? '').startsWith(prefix);
}

async function createAndSelectProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
}

describe('MissionShell', () => {
  it('runs profile -> coop -> both phases (solo) -> every wrapper screen -> parent, tracking each beat', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);

    await createAndSelectProfile(user);

    // hasAccess passed (bread IS m1-s2-1-1, a free mission) straight to the coop question.
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
    await user.click(screen.getByText(ui.coopSolo));
    expect(plausible).toHaveBeenCalledWith('coop_selected', { props: expect.objectContaining({ coop: false }) });
    expect(plausible).toHaveBeenCalledWith('m1_start', expect.anything());

    // Phase 1: slot-assembly. Solo means no prediction battle blocks the cards.
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));

    // Phase 2: dig, straight through to the root (solo, no battle on layer 1 either).
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText('そのガスは どこへ いくの？'));
    expect(screen.getByText(digPhase.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));

    // All phases complete -> tip screen, and m1_complete tracked right away.
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());
    expect(screen.getByText(byTextStartingWith('さいしょの こたえで とまらない'))).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue));

    // teach-back: complete it (not skip) this time.
    expect(screen.getByText(mission.teachBack)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue));
    expect(plausible).toHaveBeenCalledWith('teachback_done', expect.anything());

    // おうちトーク
    expect(screen.getByText(mission.ouchiTalk)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue));

    // Handoff to the parent screen.
    expect(screen.getByText(ui.handoffPrompt)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue));

    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();
    expect(plausible).toHaveBeenCalledWith('parent_screen_view', expect.anything());
  });

  it('skipping teach-back tracks teachback_skipped instead of teachback_done', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText('そのガスは どこへ いくの？'));
    await user.click(screen.getByText(ui.earlyOk));

    await user.click(screen.getByText(ui.handoffContinue)); // past tip
    await user.click(screen.getByText(ui.teachbackSkip)); // skip teach-back
    expect(plausible).toHaveBeenCalledWith('teachback_skipped', expect.anything());
    expect(plausible).not.toHaveBeenCalledWith('teachback_done', expect.anything());
    expect(screen.getByText(mission.ouchiTalk)).toBeInTheDocument();
  });

  it('persists mission progress to storage, marking the mission done for this profile', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopYes)); // co-play this time

    // Co-play means the slot-assembly round-1 battle is up first: walk through it.
    await user.click(screen.getByText('パンの こと おしえて')); // child predicts
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて')); // parent predicts
    // Battle resolved; now the real slot-assembly cards are up.
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));

    // Prediction battle now gates the dig phase's layer 1 too, but layer 0 has none —
    // play it, then skip the layer-1 battle to get to the root quickly.
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText(ui.predictionSkip));
    await user.click(screen.getByText('そのガスは どこへ いくの？'));
    await user.click(screen.getByText(ui.earlyOk));

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles).toHaveLength(1);
    expect(saved.profiles[0].progress[mission.id]).toEqual({ done: true, stamps: 0, coop: true });
  });

  it('shows the locked screen when hasAccess denies the mission, never starting it', async () => {
    const user = userEvent.setup();
    // Not in freeMissionIds, and the default AppState has no "m1:full" entitlement.
    render(<MissionShell moduleId="m1" freeMissionIds={[]} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);

    expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
  });

  it('keeps working for the session when storage throws (blocked storage)', async () => {
    const user = userEvent.setup();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try {
      render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
      await createAndSelectProfile(user);
      await user.click(screen.getByText(ui.coopSolo));
      // Reaching the first phase at all proves profile creation + persistence attempts
      // didn't crash the app despite storage being blocked.
      expect(screen.getByText('パンが ふくらむ りゆうを おしえて')).toBeInTheDocument();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
