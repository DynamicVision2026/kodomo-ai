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

  it('WO-07: reaching tsukaeru routes Gap Naming into Blind-first, and the complete unfiltered hand still appears after commit', async () => {
    // Seed storage with a profile whose follow-naze is already at tsukaeru.
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

    // Gap Naming still shows all three authored choices, unaffected by eligibility.
    expect(document.querySelectorAll('.dig__gap-naming-option')).toHaveLength(3);
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement);

    // Eligible (tsukaeru): Blind-first now runs — hand hidden, only いえた to commit.
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText(ui.blindCommit)).toBeInTheDocument();
    await user.click(screen.getByText(ui.blindCommit));

    // After commit, the complete authored hand is revealed, unchanged and unfiltered.
    expect(screen.getByText('なぜ イーストで ふくらむの？')).toBeInTheDocument();
    expect(screen.getByText('パンは すきですか？')).toBeInTheDocument();
    expect(screen.getByText('もう いちど いって')).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].moveProgress['follow-naze'].rung).toBe('hitoride');
  });

  it('WO-07: blind_selfreport is tracked but never changes moveProgress, whichever option is chosen', async () => {
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
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement);
    await user.click(screen.getByText(ui.blindCommit));

    const beforeSelfReport = JSON.parse(localStorage.getItem('m-app.v1')!).profiles[0].moveProgress;
    await user.click(screen.getByText(ui.blindSelfReportDifferent)); // "ちがった" — still non-evaluative

    expect(plausible).toHaveBeenCalledWith(
      'blind_selfreport',
      expect.objectContaining({ props: expect.objectContaining({ classification: 'different' }) }),
    );
    const afterSelfReport = JSON.parse(localStorage.getItem('m-app.v1')!).profiles[0].moveProgress;
    expect(afterSelfReport).toEqual(beforeSelfReport); // unchanged by self-report
  });

  it('WO-07: the Toolbox reflects hitoride after normal state propagation and a reload', async () => {
    localStorage.setItem('m-app.v1', JSON.stringify({
      profiles: [{
        id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2, progress: {},
        moveProgress: { 'follow-naze': { rung: 'hitoride', aptUseDomains: ['日常', 'ことば', '社会とひと'] } },
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
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement);
    await user.click(screen.getByText(ui.blindCommit));
    await user.click(screen.getByText(ui.blindSelfReportSame));
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await user.click(screen.getByText(ui.judgeNotEnough)); // layer 1's own gate (still hitoride)
    const [secondChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(secondChoice as HTMLElement);
    await user.click(screen.getByText(ui.blindCommit)); // layer 1 is also Blind-first eligible
    await user.click(screen.getByText('なぜ ガスが 出ると ふくらむの？'));
    await user.click(screen.getByText(ui.earlyOk));
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText(ui.teachbackSkip));
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText(ui.handoffContinue));

    // No scores/counters — just the tool's growth state, still just hitoride (no fabricated sotode).
    const naze = screen.getByText(moduleJson.cardTypes['follow-naze'].label).closest('.toolbox__tool')!;
    expect(naze.className).toContain('toolbox__tool--independent');
    expect(document.querySelector('.toolbox')!.textContent ?? '').not.toMatch(/\d\s*\/\s*\d/);
  });

  it('shows the locked screen when hasAccess denies the mission, never starting it', async () => {
    const user = userEvent.setup();
    // Not in freeMissionIds, and the default AppState has no "m1:full" entitlement.
    render(<MissionShell moduleId="m1" freeMissionIds={[]} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);

    expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
  });

  // --- WO-08: milestones & memory moments -------------------------------------------------

  /** A minimal second, distinct dig mission (single layer, reaches root on its one deepen) —
   *  needed because bread is the only shipped Stage-2 mission and WO-08's M2a proxy needs
   *  evidence from two DISTINCT missions to prove cross-mission accumulation. */
  const missionB: Mission = {
    id: 'synthetic-b', stage: 2, title: 'B', sources: [],
    phases: [{
      template: 'dig',
      layers: [{
        robotSays: 'こたえB', claims: [],
        hand: [{ id: 'bd1', text: 'なぜB？', tag: 'deepen', move: 'follow-naze', domain: '日常' }],
        replies: {},
        gap: 'わからないことB',
        gapDistractors: [{ text: 'こたえちがいB', kind: 'answered' }, { text: 'べつのそうB', kind: 'other-layer' }],
      }],
      root: { robotSays: 'ねっこB', claims: [], label: 'ねっこB' },
    }],
    tip: 'tipB', teachBack: 'teachBackB', ouchiTalk: 'ouchiB',
  };

  /** A minimal synthetic 3-layer dig mission — needed because bread only ever authors 2 layers,
   *  so M3 (3れん ホリ) and the first-3-chain memory moment are otherwise unreachable in this
   *  codebase's real content. Proves the mechanism independently of that content gap. */
  const missionC: Mission = {
    id: 'synthetic-c', stage: 2, title: 'C', sources: [],
    phases: [{
      template: 'dig',
      layers: [1, 2, 3].map((n) => ({
        robotSays: `こたえC${n}`, claims: [],
        hand: [{ id: `cd${n}`, text: `なぜC${n}？`, tag: 'deepen' as const, move: 'follow-naze', domain: '日常' }],
        replies: {},
        gap: `わからないことC${n}`,
        gapDistractors: [
          { text: `こたえちがいC${n}`, kind: 'answered' as const },
          { text: `べつのそうC${n}`, kind: 'other-layer' as const },
        ],
      })),
      root: { robotSays: 'ねっこC', claims: [], label: 'ねっこC' },
    }],
    tip: 'tipC', teachBack: 'teachBackC', ouchiTalk: 'ouchiC',
  };

  it('achieves M1 as soon as a layer\'s hand is rendered, before any card is played', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));

    let saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones?.M1).toBeUndefined(); // hand not revealed yet

    await passGate(user); // reveals layer 0's hand -> onMoveRendered -> M1 derivation
    saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones.M1.achieved).toBe(true);
    expect(typeof saved.profiles[0].milestones.M1.achievedAt).toBe('number');
  });

  it('the same Gap Naming resolution persists BOTH m2Evidence AND moveProgress/M1 from one tick (the persistProfile race-condition fix)', async () => {
    // gapChosen() in Dig.tsx fires onGapNamed then onMoveRendered synchronously in one call —
    // exactly the scenario that broke the original stale-closure persistProfile.
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await passGate(user);

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].m2Evidence.proxyMissionIds).toEqual([mission.id]);
    expect(saved.profiles[0].moveProgress['follow-naze'].rung).toBe('moratta');
    expect(saved.profiles[0].milestones.M1.achieved).toBe(true);
  });

  it('M2a accumulates only DISTINCT mission ids — repeated Gap Naming within the same mission does not double-count', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await passGate(user); // layer 0's Gap Naming — mission.id
    await user.click(screen.getByText('なぜ イーストで ふくらむの？'));
    await passGate(user); // layer 1's Gap Naming — same mission.id again

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].m2Evidence.proxyMissionIds).toEqual([mission.id]);
    expect(saved.profiles[0].milestones?.M2).toBeUndefined(); // M2a alone never sets M2
  });

  it('M2a accumulates across two DISTINCT missions, but still never sets milestones.M2 by itself', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />,
    );
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await passGate(user); // mission A's Gap Naming
    unmount();

    render(<MissionShell moduleId="m1" freeMissionIds={[missionB.id]} mission={missionB} ui={ui} />);
    await user.click(screen.getByText('たぬき')); // same seeded profile
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText(ui.judgeNotEnough)); // missionB's single dig phase, no slot-assembly
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement); // mission B's Gap Naming

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].m2Evidence.proxyMissionIds.sort()).toEqual([mission.id, missionB.id].sort());
    expect(saved.profiles[0].milestones?.M2).toBeUndefined();
  });

  it('achieves M3 and records first_three_chain on a genuine 3-layer chain (synthetic content — bread itself never reaches this)', async () => {
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={[missionC.id]} mission={missionC} ui={ui} />);
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));

    await passGate(user);
    await user.click(screen.getByText('なぜC1？'));
    await passGate(user);
    await user.click(screen.getByText('なぜC2？'));
    await passGate(user);
    await user.click(screen.getByText('なぜC3？')); // 3rd deepen reaches root directly

    let saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones?.M3).toBeUndefined(); // not yet — onComplete hasn't fired

    await user.click(screen.getByText(ui.earlyOk)); // acknowledge ねっこ -> onComplete fires
    saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones.M3.achieved).toBe(true);
    expect(saved.profiles[0].memories.first_three_chain).toEqual({
      kind: 'first_three_chain',
      recordedAt: expect.any(Number),
      missionId: missionC.id,
    });
  });

  it('bread\'s own (2-layer) mission never achieves M3 or records first_three_chain', async () => {
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

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones?.M3).toBeUndefined();
    expect(saved.profiles[0].memories?.first_three_chain).toBeUndefined();
  });

  it('achieves M4 and records first_blind_commit through the existing blind_commit flow', async () => {
    localStorage.setItem('m-app.v1', JSON.stringify({
      profiles: [{
        id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2, progress: {},
        moveProgress: { 'follow-naze': { rung: 'tsukaeru', aptUseDomains: ['日常', 'ことば', '社会とひと'] } },
      }],
      entitlements: ['m1:free'], founder: false, abVariant: 'A', deviceId: 'd1',
    }));

    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [choice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(choice as HTMLElement);

    let saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones?.M4).toBeUndefined(); // Blind-first shown, not yet committed

    await user.click(screen.getByText(ui.blindCommit));
    saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles[0].milestones.M4.achieved).toBe(true);
    expect(saved.profiles[0].memories.first_blind_commit).toEqual({
      kind: 'first_blind_commit',
      recordedAt: expect.any(Number),
      missionId: mission.id,
    });
  });

  it('milestones and memories are independent per profile, and survive a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);

    // Profile A: plays enough to achieve M1.
    await createAndSelectProfile(user);
    await user.click(screen.getByText(ui.coopSolo));
    await user.click(screen.getByText('パンが ふくらむ りゆうを おしえて'));
    await passGate(user);

    unmount();
    render(<MissionShell moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={mission} ui={ui} />);

    // Profile B: brand new, untouched.
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🐰'));
    await user.click(screen.getByText('うさぎ'));
    await user.click(screen.getByText(ui.profileConfirm));

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    expect(saved.profiles).toHaveLength(2);
    expect(saved.profiles[0].milestones.M1.achieved).toBe(true); // profile A, survived the reload
    expect(saved.profiles[1].milestones ?? {}).toEqual({}); // profile B, fully independent
    expect(saved.profiles[1].m2Evidence ?? { proxyMissionIds: [] }).toEqual({ proxyMissionIds: [] });
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
