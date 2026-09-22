import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { MissionLibrary, BankLibrary } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import { playMissionScreenToCompletion } from './helpers/stageConformance';
import { titleMatcher } from './helpers/titleText';
import chantoJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaJson from '../src/modules/m1/topics/rouka/s2.json';
import oyatsuJson from '../src/modules/m1/topics/oyatsu/s2.json';
import minnaJson from '../src/modules/m1/topics/minna/s2.json';
import zuruiJson from '../src/modules/m1/topics/zurui/s2.json';
import kashiteJson from '../src/modules/m1/topics/kashite/s2.json';
import randoseruJson from '../src/modules/m1/topics/randoseru/s2.json';
import bankAtodeJson from '../src/modules/m1/topics/bank-atode/s2.json'; // B01, わかれ (Tier 2)
import bankEscalatorJson from '../src/modules/m1/topics/bank-escalator/s2.json'; // B02, めあて (Tier 1)
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

const STORY = [
  chantoJson, genkanJson, roukaJson, oyatsuJson, minnaJson, zuruiJson, kashiteJson, randoseruJson,
].map((m) => m as unknown as Mission);

const BANK_TIER1_MEATE = [ // unlocks once Story 3 (rouka) is complete
  bankEscalatorJson, bankJankenJson, bankGakunenJson, bankKireiJson, bankItadakimasuJson,
  bankArigatouJson, bank100yenJson,
].map((m) => m as unknown as Mission);
const BANK_TIER2_WAKARE = [ // additionally waits for Story 5 (minna)
  bankAtodeJson, bankTeamJson, bankNedanJson, bankHoshiiJson, bankKotobaJson,
].map((m) => m as unknown as Mission);
const ALL_BANKS = [...BANK_TIER1_MEATE, ...BANK_TIER2_WAKARE];

const missionLibrary: MissionLibrary = {
  missionOrder: STORY.map((m) => m.id),
  missions: Object.fromEntries(STORY.map((m) => [m.id, m])),
};
const bankLibrary: BankLibrary = {
  bankOrder: ALL_BANKS.map((m) => m.id),
  missions: Object.fromEntries(ALL_BANKS.map((m) => [m.id, m])),
};
const continuousStageMissionIds = new Set<string>([...STORY.map((m) => m.id), ...ALL_BANKS.map((m) => m.id)]);

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function renderShell() {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={[]} mission={chantoJson as unknown as Mission}
      missionLibrary={missionLibrary} bankLibrary={bankLibrary} ui={ui} familyTestMode
      followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      continuousStageMissionIds={continuousStageMissionIds}
    />,
  );
}

async function createProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
}

/** Real reload behavior: unmount, re-render a fresh MissionShell, pick the same (now-persisted)
 *  profile — never a direct localStorage mutation, this test proves ACTUAL persistence through
 *  the real profile-picker re-entry path (WO-26 §17's own required test). */
async function reload(user: ReturnType<typeof userEvent.setup>) {
  cleanup();
  renderShell();
  await user.click(screen.getByText('たぬき'));
}

async function playCurrentStoryToMap(user: ReturnType<typeof userEvent.setup>, mission: Mission) {
  await user.click(screen.getByText(ui.courseHomeContinueLabel));
  await user.click(screen.getByText(ui.coopSolo));
  await playMissionScreenToCompletion(user, mission, ui);
  // Story 5 (minna) declares a perspective-shift moment (WO-19 Phase 3C) — preserved at its own
  // position (WO-26 §14), shown here before the child-facing completion screen since this whole
  // journey plays SOLO throughout.
  if (mission.perspective) {
    await waitFor(() => expect(screen.getByText(mission.perspective!.text)).toBeInTheDocument());
    await user.click(screen.getByText(ui.handoffContinue));
  }
  await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  await user.click(screen.getByText(ui.completeBackToMapLabel));
}

async function playBankToCompletion(user: ReturnType<typeof userEvent.setup>, mission: Mission) {
  await user.click(screen.getByText(ui.courseHomeBankLabel));
  await user.click(screen.getByText(titleMatcher(mission.title)));
  await user.click(screen.getByText(ui.coopSolo));
  await playMissionScreenToCompletion(user, mission, ui);
  await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
  await user.click(screen.getByText(ui.completeBackToMapLabel));
}

/**
 * WO-26 §25 (Automated Course Playthrough): the ONE required full-course journey regression —
 * a single profile plays Story 1 through Story 8 to completion, in order, through the real
 * product surface (profile -> Course Home -> mission -> completion -> back to map), verifying
 * along the way: Story progression (CURRENT advances, LOCKED blocks skipping ahead), staged
 * Bank unlocks (LOCKED -> AVAILABLE at the derived schedule, freely selectable once unlocked,
 * its own completion never blocking Story progression), milestone advancement, real persistence
 * (an actual reload through the profile picker, not a localStorage shortcut), and Module 1
 * completion once Story 8 is done. Deliberately SOLO throughout — co-play ownership transitions
 * already have dedicated, sampled coverage (tests/GoldenConformance.test.tsx).
 */
describe('WO-26 §25 — full Module 1 course playthrough (Story 1-8 + staged Bank unlocks + milestones + persistence + completion)', () => {
  it('plays the entire course end to end through the real product surface', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfile(user);

    // Story 1 is CURRENT on a fresh profile.
    expect(within(document.querySelector('.course-home__depth.is-current') as HTMLElement).getByText(STORY[0]!.title)).toBeTruthy();

    // No Bank Dig is reachable yet — Story 3 hasn't introduced follow-naze/follow-hokaniwa.
    await user.click(screen.getByText(ui.courseHomeBankLabel));
    await user.click(screen.getByText(BANK_TIER1_MEATE[0]!.title));
    expect(screen.getByText(ui.bankLockedMessage)).toBeInTheDocument();
    expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.bankBackButton)); // back to Course Home

    // Story 1 -> Story 3: play through in sequence.
    for (const mission of [STORY[0]!, STORY[1]!, STORY[2]!]) {
      await playCurrentStoryToMap(user, mission);
    }

    // Reload: persistence must survive a real re-entry through the profile picker.
    await reload(user);
    expect(document.querySelectorAll('.course-home__depth.is-done')).toHaveLength(3);
    const current = document.querySelector('.course-home__depth.is-current') as HTMLElement;
    expect(within(current).getByText(STORY[3]!.title)).toBeTruthy(); // Story 4 (oyatsu) is CURRENT

    // Story 4 (oyatsu) is now CURRENT — Story 5-8 remain LOCKED (never freely skippable).
    {
      const lockedStory = screen.getByText(STORY[7]!.title).closest('.course-home__depth-button')!;
      await user.click(lockedStory);
      expect(screen.queryByText(ui.coopQuestion)).not.toBeInTheDocument(); // never entered
      expect(screen.getByText(ui.courseHomeSequentialLockedMessage)).toBeInTheDocument();
    }

    // Tier 1 (めあて) Bank Digs are now AVAILABLE (Story 3 done); Tier 2 (わかれ) still LOCKED.
    await user.click(screen.getByText(ui.courseHomeBankLabel));
    for (const bank of BANK_TIER1_MEATE) {
      const btn = screen.getByText(titleMatcher(bank.title)).closest('button')!;
      expect(btn.className).not.toContain('is-locked');
    }
    for (const bank of BANK_TIER2_WAKARE) {
      const btn = screen.getByText(titleMatcher(bank.title)).closest('button')!;
      expect(btn.className).toContain('is-locked');
    }
    await user.click(screen.getByText(ui.bankBackButton));

    // Play one Tier-1 Bank Dig to completion — Story progression must be unaffected: Story 4
    // (oyatsu) is still CURRENT, not skipped, not regressed.
    await playBankToCompletion(user, BANK_TIER1_MEATE[0]!);
    const stillCurrent = document.querySelector('.course-home__depth.is-current') as HTMLElement;
    expect(within(stillCurrent).getByText(STORY[3]!.title)).toBeTruthy();

    // Its own completion evidence is retained (COMPLETED, not just AVAILABLE) without touching
    // the Story spine at all.
    await user.click(screen.getByText(ui.courseHomeBankLabel));
    expect(screen.getByText(BANK_TIER1_MEATE[0]!.title).closest('button')!.textContent).toContain(ui.bankDoneLabel);
    await user.click(screen.getByText(ui.bankBackButton));

    // Story 4 (Mid-Boss) and Story 5.
    await playCurrentStoryToMap(user, STORY[3]!);
    await playCurrentStoryToMap(user, STORY[4]!);

    // Tier 2 (わかれ) Bank Digs are now AVAILABLE too (Story 5 just completed).
    await user.click(screen.getByText(ui.courseHomeBankLabel));
    for (const bank of BANK_TIER2_WAKARE) {
      const btn = screen.getByText(titleMatcher(bank.title)).closest('button')!;
      expect(btn.className).not.toContain('is-locked');
    }
    await user.click(screen.getByText(ui.bankBackButton));

    // Story 6, 7, 8 (Boss) — the whole spine.
    await playCurrentStoryToMap(user, STORY[5]!);
    await playCurrentStoryToMap(user, STORY[6]!);

    // Story 8 completion -> Module 1 completion: no further undone mission.
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    await playMissionScreenToCompletion(user, STORY[7]!, ui);
    await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
    expect(screen.getByText(ui.completeCourseFinishedLabel)).toBeInTheDocument();
    expect(screen.queryByText(ui.completeNextMissionLabel)).not.toBeInTheDocument();

    // Milestones advanced through real play: M1 (a follow-up move was obtained) and M3 (a
    // genuine 3+ layer chain was completed — Story 3/4/5/8 are all 3-layer).
    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    const profile = saved.profiles[0];
    expect(profile.milestones.M1.achieved).toBe(true);
    expect(profile.milestones.M3.achieved).toBe(true);
    for (const mission of STORY) expect(profile.progress[mission.id].done).toBe(true);
    expect(profile.progress[BANK_TIER1_MEATE[0]!.id].done).toBe(true);

    // Module 1 completion persists through a reload too.
    await user.click(screen.getByText(ui.completeBackToMapLabel));
    await reload(user);
    expect(document.querySelectorAll('.course-home__depth.is-done')).toHaveLength(8);
    expect(document.querySelector('.course-home__depth.is-current')).toBeNull(); // nothing left CURRENT
  }, 60000);
});
