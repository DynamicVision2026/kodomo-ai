import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MissionShell } from '../src/shell/MissionShell';
import type { BankLibrary, MissionLibrary } from '../src/shell/MissionShell';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaJson from '../src/modules/m1/topics/rouka/s2.json';
import oyatsuJson from '../src/modules/m1/topics/oyatsu/s2.json';
import minnaJson from '../src/modules/m1/topics/minna/s2.json';
import zuruiJson from '../src/modules/m1/topics/zurui/s2.json';
import kashiteJson from '../src/modules/m1/topics/kashite/s2.json';
import randoseruJson from '../src/modules/m1/topics/randoseru/s2.json';
import bankAtodeJson from '../src/modules/m1/topics/bank-atode/s2.json';
import bankEscalatorJson from '../src/modules/m1/topics/bank-escalator/s2.json';
import bankJankenJson from '../src/modules/m1/topics/bank-janken/s2.json';
import bankTeamJson from '../src/modules/m1/topics/bank-team/s2.json';
import bankGakunenJson from '../src/modules/m1/topics/bank-gakunen/s2.json';
import bankNedanJson from '../src/modules/m1/topics/bank-nedan/s2.json';
import bankKireiJson from '../src/modules/m1/topics/bank-kirei/s2.json';
import bankHoshiiJson from '../src/modules/m1/topics/bank-hoshii/s2.json';
import bankKotobaJson from '../src/modules/m1/topics/bank-kotoba/s2.json';
import bankItadakimasuJson from '../src/modules/m1/topics/bank-itadakimasu/s2.json';
import bankArigatouJson from '../src/modules/m1/topics/bank-arigatou/s2.json';
import bank100yenJson from '../src/modules/m1/topics/bank-100yen/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;

const storyMissions = [
  chantoJson, genkanJson, roukaJson, oyatsuJson, minnaJson, zuruiJson, kashiteJson, randoseruJson,
].map((m) => m as unknown as Mission);
const missionsById: Record<string, Mission> = Object.fromEntries(storyMissions.map((m) => [m.id, m]));
const missionLibrary: MissionLibrary = { missionOrder: moduleJson.missionOrder, missions: missionsById };

const bankMissions = [
  bankAtodeJson, bankEscalatorJson, bankJankenJson, bankTeamJson, bankGakunenJson, bankNedanJson,
  bankKireiJson, bankHoshiiJson, bankKotobaJson, bankItadakimasuJson, bankArigatouJson, bank100yenJson,
].map((m) => m as unknown as Mission);
const bankMissionsById: Record<string, Mission> = Object.fromEntries(bankMissions.map((m) => [m.id, m]));
const bankLibrary: BankLibrary = { bankOrder: bankMissions.map((m) => m.id), missions: bankMissionsById };

const chantoMission = missionsById[storyMissions[0]!.id]!;

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

async function createProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
}

/**
 * WO-23 §15: the 9 required family-test regression scenarios, proven against the real production
 * mission/bank libraries (main.tsx's own wiring), not a synthetic fixture — matching the rigor
 * GrowthJourneyRealContent.test.tsx/BankDigs.test.tsx already established for this codebase.
 * `familyTestMode` mirrors src/main.tsx's own VITE_FAMILY_TEST_MODE=1 build (docs/family-test-mode.md).
 */
describe('WO-23 §15 — family-test regression suite', () => {
  it('1. a non-deepening card play always exposes the continuation cue (RC-2)', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission}
        missionLibrary={missionLibrary} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    const clearCard = (chantoMission.phases[0] as Extract<typeof chantoMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement); // reveals the hand

    expect(screen.queryByText(ui.digContinuePrompt)).not.toBeInTheDocument(); // not yet — no play made

    const digPhase = chantoMission.phases[1] as DigPhase;
    const offtopic = digPhase.layers[0]!.hand.find((c) => c.tag === 'offtopic')!;
    await user.click(screen.getByText(offtopic.text)); // a play, but non-advancing

    // The hand is still open (digMachine.ts never closed it) AND the explicit cue now shows.
    expect(screen.getByText(offtopic.text).closest('button')).toBeInTheDocument();
    expect(screen.getByText(ui.digContinuePrompt)).toBeInTheDocument();
  });

  it('2. Mission Complete always exposes a next-navigation action when a next mission exists', async () => {
    localStorage.setItem('m-app.v1', JSON.stringify({
      // WO-30 §0: a real purchase now also requires the code itself, not just the derived
      // entitlement tag — see src/engine/entitlements.ts's reconcileEntitlements().
      profiles: [], entitlements: ['m1:full'], redeemedCode: 'NAZE-TEST-TEST', founder: false, abVariant: 'A', deviceId: 'd1',
    }));
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission}
        missionLibrary={missionLibrary} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    const clearCard = (chantoMission.phases[0] as Extract<typeof chantoMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));
    const digPhase = chantoMission.phases[1] as DigPhase;
    for (const layer of digPhase.layers) {
      await user.click(screen.getByText(ui.judgeNotEnough));
      const [choice] = document.querySelectorAll('.dig__gap-naming-option');
      await user.click(choice as HTMLElement);
      const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
      await user.click(screen.getByText(deepen.text));
    }
    await user.click(screen.getByText(ui.earlyOk));
    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    await user.click(screen.getByText(ui.teachbackSkip)); // -> おうちトーク
    await user.click(screen.getByText(ui.handoffContinue)); // -> handoff
    await user.click(screen.getByText(ui.handoffContinue)); // -> parent
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // parent -> complete (mission-shell__to-complete)

    expect(screen.getByText(ui.completeHeading)).toBeInTheDocument();
    // A second Story mission is undone at this profile's stage, so the primary CTA must appear —
    // never left implicit, the audit's own "completion lacks navigation" finding.
    expect(screen.getByText(ui.completeNextMissionLabel)).toBeInTheDocument();
    expect(screen.getByText(ui.completeBackToMapLabel)).toBeInTheDocument();
    expect(screen.getByText(ui.completeTryOutsideLabel)).toBeInTheDocument();

    await user.click(screen.getByText(ui.completeNextMissionLabel));
    // Lands directly in the next mission's own coop question — no course-home detour needed,
    // no dead end, no reload.
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });

  it('3. Course Home always exposes the profile\'s current Mission, highlighted and continuable', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission}
        missionLibrary={missionLibrary} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await createProfile(user);

    expect(screen.getByText(ui.courseHomeHeading)).toBeInTheDocument();
    const currentTitle = within(document.querySelector('.course-home__depth.is-current')!).getByText(
      (_c, el) => el?.tagName === 'SPAN' && el.className === 'course-home__depth-title',
    );
    expect(currentTitle).toBeInTheDocument();
    expect(screen.getByText(ui.courseHomeContinueLabel)).toBeInTheDocument();
    // All 8 depths are listed, not just the current one — the shaft, not a single-mission view.
    expect(document.querySelectorAll('.course-home__depth')).toHaveLength(8);
  });

  /** WO-26 §3.1/§5: seeds the just-created profile's own `progress` directly in storage (the
   *  same shape MissionShell itself persists to), marking the first `doneCount` Story Missions
   *  done — the only way to legitimately reach a later Story/Bank in a single test now that
   *  free-skipping is gone. Requires a profile to already exist in storage. */
  function seedStoryProgress(doneCount: number) {
    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    const profile = saved.profiles[0];
    profile.progress = {};
    for (let j = 0; j < doneCount; j++) {
      profile.progress[storyMissions[j]!.id] = { done: true, stamps: 0, coop: false };
    }
    localStorage.setItem('m-app.v1', JSON.stringify(saved));
  }

  function renderShellWithBank() {
    return render(
      <MissionShell
        moduleId="m1" freeMissionIds={[]} mission={chantoMission}
        missionLibrary={missionLibrary} bankLibrary={bankLibrary} ui={ui} familyTestMode
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
  }

  it('4. all 8 Story Missions are reachable, IN SEQUENCE, in family-test mode — none show the entitlement-locked screen once their own prerequisite Stories are done', async () => {
    // One profile, created once; each iteration seeds it straight to the needed point instead
    // of actually re-playing 0..i-1 Stories — WO-26 §3.1 only forbids skipping via the real UI.
    {
      const user = userEvent.setup();
      const { unmount } = renderShellWithBank();
      await createProfile(user);
      unmount();
    }
    for (let i = 0; i < storyMissions.length; i++) {
      seedStoryProgress(i); // Stories 0..i-1 done -> Story i is now CURRENT
      const user = userEvent.setup();
      const { unmount } = renderShellWithBank();
      await user.click(screen.getByText('たぬき')); // the same, seeded profile
      const depthButtons = document.querySelectorAll('.course-home__depth-button');
      expect(depthButtons).toHaveLength(8);
      await user.click(depthButtons[i] as HTMLElement);

      expect(screen.queryByText(ui.lockedMessage)).not.toBeInTheDocument();
      expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
      unmount();
    }
  });

  it('5. all 12 Bank Digs are reachable in family-test mode once the Story spine is complete — none show the entitlement-locked screen', async () => {
    {
      const user = userEvent.setup();
      const { unmount } = renderShellWithBank();
      await createProfile(user);
      unmount();
    }
    // WO-26 §5: every Bank Dig unlocks once the Story spine is complete (the most conservative
    // unlock point any of them requires) — seeded once, satisfies all 12 iterations below.
    seedStoryProgress(storyMissions.length);
    for (let i = 0; i < bankMissions.length; i++) {
      const user = userEvent.setup();
      const { unmount } = renderShellWithBank();
      await user.click(screen.getByText('たぬき'));
      await user.click(screen.getByText(ui.courseHomeBankLabel));
      const topicButtons = document.querySelectorAll('.bank-select__topic');
      expect(topicButtons).toHaveLength(12);
      await user.click(topicButtons[i] as HTMLElement);

      expect(screen.queryByText(ui.lockedMessage)).not.toBeInTheDocument();
      expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
      unmount();
    }
  });

  it('6. QuestionChip carries no physical (mm) sizing dependency — only PrintCard does', () => {
    const chipCss = readFileSync(join(process.cwd(), 'src/ui/question-chip.css'), 'utf8');
    const printCss = readFileSync(join(process.cwd(), 'src/ui/print-card.css'), 'utf8');
    expect(chipCss).not.toMatch(/\d+mm\b/); // no mm-based dimension value anywhere
    expect(printCss).toMatch(/\d+mm\b/); // the physical split still exists on the print side
  });

  it('8. the parent screen always exposes an explicit next action, before and after every M0/M2b/M5 interaction', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission}
        missionLibrary={missionLibrary} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await createProfile(user);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    const clearCard = (chantoMission.phases[0] as Extract<typeof chantoMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));
    const digPhase = chantoMission.phases[1] as DigPhase;
    for (const layer of digPhase.layers) {
      await user.click(screen.getByText(ui.judgeNotEnough));
      const [choice] = document.querySelectorAll('.dig__gap-naming-option');
      await user.click(choice as HTMLElement);
      const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
      await user.click(screen.getByText(deepen.text));
    }
    await user.click(screen.getByText(ui.earlyOk));
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText(ui.teachbackSkip));
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText(ui.handoffContinue));

    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();
    expect(document.querySelector('.mission-shell__to-complete')).toBeInTheDocument();
    expect(screen.getByText(ui.handoffContinue).closest('.mission-shell__to-complete')).toBeTruthy();
  });

  // WO-26 §3.1/§7 revises this scenario's own premise: a depth ahead of CURRENT is no longer
  // "exactly as reachable" — it is deliberately LOCKED (Story Missions must not be freely
  // skipped). What the original RC-1 finding actually demanded still holds: a locked depth must
  // never look broken, never show a raw/denied screen, and CURRENT must remain fully reachable
  // with no dead end anywhere.
  it('9. a locked depth never shows a broken/dead-end state — a short diegetic explanation instead, on Course Home, never "ACCESS DENIED" — and CURRENT stays fully reachable', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={[]} mission={chantoMission}
        missionLibrary={missionLibrary} bankLibrary={bankLibrary} ui={ui} familyTestMode
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await createProfile(user);
    expect(document.querySelector('.mission-shell__locked')).not.toBeInTheDocument();

    // The LAST story, deliberately not the current one, is LOCKED — tapping it stays on Course
    // Home with a short diegetic explanation, never a browser-style error, never a navigation.
    const depthButtons = document.querySelectorAll('.course-home__depth-button');
    await user.click(depthButtons[7] as HTMLElement);
    expect(document.querySelector('.mission-shell__locked')).not.toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument(); // never entered
    expect(screen.getByText(ui.courseHomeSequentialLockedMessage)).toBeInTheDocument();
    expect(screen.getByText(ui.courseHomeHeading)).toBeInTheDocument(); // still on Course Home

    // CURRENT itself remains exactly as reachable as ever.
    await user.click(depthButtons[0] as HTMLElement);
    expect(document.querySelector('.mission-shell__locked')).not.toBeInTheDocument();
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });
});
