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

/** WO-02/WO-03: every Dig layer's hand sits behind 「これでOK？」 -> Gap Naming (any of the
 *  three authored choices — AD-01's no-verdict rule means it never matters which one). */
async function passGate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.judgeNotEnough));
  const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
  await user.click(firstChoice as HTMLElement);
}

describe('MissionShell', () => {
  it('runs profile -> coop -> both phases (solo) -> every wrapper screen -> parent, tracking each beat', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1"
        freeMissionIds={moduleJson.freeMissionIds}
        mission={mission}
        ui={ui}
        followMoves={moduleJson.followMoves}
        cardTypes={moduleJson.cardTypes}
      />,
    );

    await createAndSelectProfile(user);

    // hasAccess passed (bread IS m1-s2-1-1, a free mission) straight to the coop question.
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
    await user.click(screen.getByText(ui.coopSolo));
    expect(plausible).toHaveBeenCalledWith('coop_selected', { props: expect.objectContaining({ coop: false }) });
    expect(plausible).toHaveBeenCalledWith('m1_start', expect.anything());

    // Phase 1: slot-assembly. Solo means no prediction battle blocks the cards.
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));

    // Phase 2: dig, straight through to the root (solo, no battle on layer 1 either).
    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await passGate(user);
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
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

    // WO-05: the Toolbox on this same parent screen reflects this profile's own moveProgress —
    // follow-naze reached moratta over the two layers just played (both in one domain, so not
    // tsukaeru — see the moveProgress assertion further down this file).
    expect(screen.getByText(ui.toolboxHeading)).toBeInTheDocument();
    const naze = screen.getByText(moduleJson.cardTypes['follow-naze'].label).closest('.toolbox__tool')!;
    expect(naze.className).toContain('toolbox__tool--obtained');
    const tatoeba = screen.getByText(moduleJson.cardTypes['follow-tatoeba'].label).closest('.toolbox__tool')!;
    expect(tatoeba.className).toContain('toolbox__tool--undiscovered'); // never played this mission
  });

  it('skipping teach-back tracks teachback_skipped instead of teachback_done', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await passGate(user);
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
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
    // pass layer 0's judgment gate and play it, then skip the layer-1 battle and pass
    // layer 1's own gate to get to the root quickly.
    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText(ui.predictionSkip));
    await passGate(user);
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
    await user.click(screen.getByText(ui.earlyOk));

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles).toHaveLength(1);
    expect(saved.profiles[0].progress[mission.id]).toEqual({ done: true, stamps: 0, coop: true });

    // WO-04: both bread layers' deepen cards are follow-naze in the same domain
    // (しぜん・かがく), each played first-at-its-layer -> two qualifying apt_use, but only ONE
    // distinct domain — the critical distinction (three uses in one domain isn't enough).
    expect(saved.profiles[0].moveProgress['follow-naze']).toEqual({
      rung: 'moratta',
      aptUseDomains: ['しぜん・かがく'],
    });
  });

  it('Correction 01: a play with no attributable move is never tracked and never touches moveProgress', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await passGate(user);
    await user.click(screen.getByText('パンは すきですか？')); // f2: offtopic — a play, but no move to attribute

    expect(plausible).not.toHaveBeenCalledWith('use', expect.anything());
    expect(plausible).not.toHaveBeenCalledWith('apt_use', expect.anything());
    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].moveProgress ?? {}).not.toHaveProperty('undefined');
  });

  it('WO-05: two profiles keep independent Toolbox state, which survives a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );

    // Profile A plays the full mission, building real progress on follow-naze.
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await passGate(user);
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await passGate(user);
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
    await user.click(screen.getByText(ui.earlyOk));
    await user.click(screen.getByText(ui.handoffContinue)); // past tip
    await user.click(screen.getByText(ui.teachbackSkip));
    await user.click(screen.getByText(ui.handoffContinue)); // past ouchi
    await user.click(screen.getByText(ui.handoffContinue)); // past handoff prompt -> parent

    const nazeForA = screen.getByText(moduleJson.cardTypes['follow-naze'].label).closest('.toolbox__tool')!;
    expect(nazeForA.className).toContain('toolbox__tool--obtained');

    // Reload: a fresh MissionShell instance, reading the same localStorage from scratch.
    unmount();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );

    // Profile B is a second, brand-new profile — untouched by anything profile A did.
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🐰'));
    await user.click(screen.getByText('うさぎ'));
    await user.click(screen.getByText(ui.profileConfirm));

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles).toHaveLength(2);
    // Profile A's progress survived the reload untouched.
    expect(saved.profiles[0].moveProgress['follow-naze'].rung).toBe('moratta');
    // Profile B is fully independent — no follow-naze entry at all yet.
    expect(saved.profiles[1].moveProgress ?? {}).toEqual({});
  });

  it('WO-05: reaching tsukaeru does not change Dig — the hand is still complete and unfiltered', async () => {
    // Seed storage with a profile whose follow-naze is already at tsukaeru, then confirm the
    // dig phase plays out exactly like a fresh profile's — same cards, same gate, no hiding.
    localStorage.setItem('m-app.v1', JSON.stringify({
      profiles: [{
        id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2, progress: {},
        moveProgress: { 'follow-naze': { rung: 'tsukaeru', aptUseDomains: ['日常', 'ことば', '社会とひと'] } },
      }],
      entitlements: ['m1:free'], founder: false, abVariant: 'A', deviceId: 'd1',
    }));

    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await user.click(screen.getByText('たぬき')); // selects the seeded (already-existing) profile directly
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await user.click(screen.getByText(ui.judgeNotEnough));

    // Gap Naming still shows all three authored choices, and the hand (once reached) is the
    // same three cards — tsukaeru changed nothing about what Dig shows or how it behaves.
    expect(document.querySelectorAll('.dig__gap-naming-option')).toHaveLength(3);
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement);
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
    expect(screen.getByText('パンは すきですか？')).toBeInTheDocument();
    expect(screen.getByText('もう いちど いって')).toBeInTheDocument();
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
