import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { MissionLibrary, BankLibrary } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
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
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;

const STORY = [
  chantoJson, genkanJson, roukaJson, oyatsuJson, minnaJson, zuruiJson, kashiteJson, randoseruJson,
].map((m) => m as unknown as Mission);
const BANKS = [bankAtodeJson, bankEscalatorJson].map((m) => m as unknown as Mission);

const missionLibrary: MissionLibrary = {
  missionOrder: STORY.map((m) => m.id),
  missions: Object.fromEntries(STORY.map((m) => [m.id, m])),
};
const bankLibrary: BankLibrary = {
  bankOrder: BANKS.map((m) => m.id),
  missions: Object.fromEntries(BANKS.map((m) => [m.id, m])),
};

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

async function createProfileWithDoneStories(user: ReturnType<typeof userEvent.setup>, doneCount: number) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
  await skipM0RitualIfPresent(user, ui);

  if (doneCount > 0) {
    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    const profile = saved.profiles[0];
    profile.progress = {};
    for (let i = 0; i < doneCount; i++) {
      profile.progress[STORY[i]!.id] = { done: true, stamps: 0, coop: false };
    }
    localStorage.setItem('m-app.v1', JSON.stringify(saved));
    cleanup();
    renderShell();
    await user.click(screen.getByText('たぬき'));
  }
}

function renderShell() {
  return render(
    <MissionShell
      moduleId="m1" freeMissionIds={[]} mission={chantoJson as unknown as Mission}
      missionLibrary={missionLibrary} bankLibrary={bankLibrary} ui={ui} familyTestMode
      followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
    />,
  );
}

describe('WO-26A — Course Home Module Completion CTA', () => {
  it('1. Stories 1-7 complete: Story 8 is CURRENT, the ordinary continue CTA is present', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfileWithDoneStories(user, 7);

    expect(document.querySelector('.course-home__depth.is-current')).toBeTruthy();
    expect(screen.getByText(ui.courseHomeContinueLabel)).toBeInTheDocument();
    expect(screen.queryByText(ui.completeCourseFinishedLabel)).not.toBeInTheDocument();
  });

  it('2. Stories 1-8 complete: there is no CURRENT Story', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfileWithDoneStories(user, 8);

    expect(document.querySelector('.course-home__depth.is-current')).toBeNull();
    expect(document.querySelectorAll('.course-home__depth.is-done')).toHaveLength(8);
  });

  it('3. Stories 1-8 complete: the ordinary main-story continue CTA is gone', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfileWithDoneStories(user, 8);

    expect(screen.queryByText(ui.courseHomeContinueLabel)).not.toBeInTheDocument();
    // Not just hidden text — the button that would silently replay Story 1 is gone entirely.
    expect(document.querySelector('.course-home__continue')).toBeNull();
  });

  it('4. Stories 1-8 complete: the Module 1 completed state is clearly visible', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfileWithDoneStories(user, 8);

    expect(screen.getByText(ui.completeCourseFinishedLabel)).toBeInTheDocument();
  });

  it('5. Stories 1-8 complete: Bank access remains available (12/12... here 2/2 sampled banks reachable)', async () => {
    const user = userEvent.setup();
    renderShell();
    await createProfileWithDoneStories(user, 8);

    expect(screen.getByText(ui.courseHomeBankLabel)).toBeInTheDocument();
    await user.click(screen.getByText(ui.courseHomeBankLabel));
    expect(screen.getByText(ui.bankHeading)).toBeInTheDocument();
    for (const bank of BANKS) {
      const btn = screen.getByText(bank.title).closest('button')!;
      expect(btn.className).not.toContain('is-locked'); // both unlock well before Story 8
    }

    // A COMPLETED Story Mission's own replay affordance (tapping it) is untouched by this patch.
    await user.click(screen.getByText(ui.bankBackButton));
    const doneDepth = screen.getByText(STORY[0]!.title).closest('.course-home__depth-button')!;
    await user.click(doneDepth);
    expect(screen.getByText(ui.coopQuestion)).toBeInTheDocument();
  });
});
