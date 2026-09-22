import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { MissionLibrary, BankLibrary } from '../src/shell/MissionShell';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import { playMissionStageToCompletion, playMissionScreenToCompletion } from './helpers/stageConformance';
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

const STORY_MISSIONS: { label: string; mission: Mission }[] = [
  { label: 'Story 1 (chanto)', mission: chantoJson as unknown as Mission },
  { label: 'Story 2 (genkan)', mission: genkanJson as unknown as Mission },
  { label: 'Story 3 (rouka)', mission: roukaJson as unknown as Mission },
  { label: 'Story 4 (oyatsu) — Mid-Boss', mission: oyatsuJson as unknown as Mission },
  { label: 'Story 5 (minna)', mission: minnaJson as unknown as Mission },
  { label: 'Story 6 (zurui)', mission: zuruiJson as unknown as Mission },
  { label: 'Story 7 (kashite)', mission: kashiteJson as unknown as Mission },
  { label: 'Story 8 (randoseru) — Boss', mission: randoseruJson as unknown as Mission },
];

const BANK_DIGS: { label: string; mission: Mission }[] = [
  { label: 'B01 (atode)', mission: bankAtodeJson as unknown as Mission },
  { label: 'B02 (escalator)', mission: bankEscalatorJson as unknown as Mission },
  { label: 'B03 (janken)', mission: bankJankenJson as unknown as Mission },
  { label: 'B04 (team)', mission: bankTeamJson as unknown as Mission },
  { label: 'B05 (gakunen)', mission: bankGakunenJson as unknown as Mission },
  { label: 'B06 (nedan)', mission: bankNedanJson as unknown as Mission },
  { label: 'B07 (kirei)', mission: bankKireiJson as unknown as Mission },
  { label: 'B08 (hoshii)', mission: bankHoshiiJson as unknown as Mission },
  { label: 'B09 (kotoba)', mission: bankKotobaJson as unknown as Mission },
  { label: 'B10 (itadakimasu)', mission: bankItadakimasuJson as unknown as Mission },
  { label: 'B11 (arigatou)', mission: bankArigatouJson as unknown as Mission },
  { label: 'B12 (100yen)', mission: bank100yenJson as unknown as Mission },
];

const ALL_20 = [...STORY_MISSIONS, ...BANK_DIGS];

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

/**
 * WO-26 §26 (Golden Reference Conformance): the validated Mission 1 interaction invariants,
 * proven structurally against EVERY one of the 20 real Module 1 digs (8 Story + 12 Bank), not
 * just a sample — using one reusable, content-agnostic helper
 * (tests/helpers/stageConformance.ts) instead of 20 near-duplicate test bodies. At minimum, per
 * mission: bubble one-tap, explicit GAP prompt, explicit question prompt, QuestionChip causal
 * dig, non-deepen blocked recovery, root/discovery state. Solo-safety and co-play ownership
 * transitions are covered separately (sampled, via full MissionShell rendering) below and in
 * tests/Mission1Stage.test.tsx.
 */
describe('WO-26 §26 — Golden Reference Conformance: all 20 Module 1 digs, structurally', () => {
  for (const { label, mission } of ALL_20) {
    it(`${label}: the golden interaction grammar holds end to end (slot/dig one-tap, explicit prompts, causal dig, non-deepen recovery, root discovery, completion)`, async () => {
      const user = userEvent.setup();
      const { onComplete } = await playMissionStageToCompletion(user, mission, ui);
      const digPhase = mission.phases.find((p) => p.template === 'dig') as DigPhase;
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ layerCount: digPhase.layers.length }),
      );
    });
  }
});

// ---------------------------------------------------------------------------------------------
// WO-26 §27/§26: sampled full MissionShell E2E — solo-safety (never entering parent UI) and
// co-play ownership transitions (explicit handoff/parent/handback), through the real profile ->
// Course Home -> mission -> completion product surface, for the browser-QA sample set (Story 2,
// 4, 7, 8) plus one representative Bank Dig from each of the two derived unlock tiers.
// ---------------------------------------------------------------------------------------------

const missionLibrary: MissionLibrary = {
  missionOrder: STORY_MISSIONS.map((s) => s.mission.id),
  missions: Object.fromEntries(STORY_MISSIONS.map((s) => [s.mission.id, s.mission])),
};
const bankLibrary: BankLibrary = {
  bankOrder: BANK_DIGS.map((b) => b.mission.id),
  missions: Object.fromEntries(BANK_DIGS.map((b) => [b.mission.id, b.mission])),
};
const continuousStageMissionIds = new Set<string>([
  ...STORY_MISSIONS.map((s) => s.mission.id),
  ...BANK_DIGS.map((b) => b.mission.id),
]);

function seedProgress(doneStoryLabels: string[]) {
  const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
  const profile = saved.profiles[0];
  profile.progress = profile.progress ?? {};
  for (const label of doneStoryLabels) {
    const story = STORY_MISSIONS.find((s) => s.label === label)!;
    profile.progress[story.mission.id] = { done: true, stamps: 0, coop: false };
  }
  localStorage.setItem('m-app.v1', JSON.stringify(saved));
}

async function createProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(ui.profileCreateLabel));
  await user.click(screen.getByText('🦊'));
  await user.click(screen.getByText('たぬき'));
  await user.click(screen.getByText(ui.profileConfirm));
}

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

describe('WO-26 §26/§27 — sampled solo-safety + co-play ownership transitions (Story 2/4/7/8, one Bank per unlock tier)', () => {
  const SAMPLE = [
    STORY_MISSIONS[1]!, // Story 2
    STORY_MISSIONS[3]!, // Story 4 — Mid-Boss
    STORY_MISSIONS[6]!, // Story 7
    STORY_MISSIONS[7]!, // Story 8 — Boss
    BANK_DIGS.find((b) => b.label.includes('escalator'))!, // めあて — opens at Story 1-4
    BANK_DIGS.find((b) => b.label.includes('atode'))!, // わかれ — opens at Story 1-5
  ];

  for (const { label, mission } of SAMPLE) {
    const isStory = STORY_MISSIONS.some((s) => s.mission.id === mission.id);

    it(`${label} — SOLO never enters parent UI, completion reached cleanly`, async () => {
      const user = userEvent.setup();
      renderShell();
      await createProfile(user);
      seedProgress(STORY_MISSIONS.map((s) => s.label)); // every prerequisite satisfied
      cleanup();
      const freshUser = userEvent.setup();
      renderShell();
      await freshUser.click(screen.getByText('たぬき'));
      if (isStory) {
        await freshUser.click(screen.getByText(mission.title));
      } else {
        await freshUser.click(screen.getByText(ui.courseHomeBankLabel));
        await freshUser.click(screen.getByText(mission.title));
      }
      await freshUser.click(screen.getByText(ui.coopSolo));
      await playMissionScreenToCompletion(freshUser, mission, ui);

      await waitFor(() => expect(screen.getByText(ui.completeHeading)).toBeInTheDocument());
      expect(screen.queryByText(ui.parentScreenHeading)).not.toBeInTheDocument();
      expect(screen.queryByText(ui.stageHandoffPrompt)).not.toBeInTheDocument();
    });

    it(`${label} — CO-PLAY: explicit handoff -> parent register -> explicit return-to-child, never a direct switch`, async () => {
      const user = userEvent.setup();
      renderShell();
      await createProfile(user);
      seedProgress(STORY_MISSIONS.map((s) => s.label));
      cleanup();
      const freshUser = userEvent.setup();
      renderShell();
      await freshUser.click(screen.getByText('たぬき'));
      if (isStory) {
        await freshUser.click(screen.getByText(mission.title));
      } else {
        await freshUser.click(screen.getByText(ui.courseHomeBankLabel));
        await freshUser.click(screen.getByText(mission.title));
      }
      await freshUser.click(screen.getByText(ui.coopYes));
      await playMissionScreenToCompletion(freshUser, mission, ui);

      await waitFor(() => expect(screen.getByText(ui.stageHandoffPrompt)).toBeInTheDocument());
      expect(screen.queryByText(ui.parentScreenHeading)).not.toBeInTheDocument();
      await freshUser.click(screen.getByText(ui.stageHandoffGiven));

      await waitFor(() => expect(screen.getByText(mission.teachBack)).toBeInTheDocument());
      await freshUser.click(screen.getByText(ui.stageParentGotItLabel));
      expect(screen.getByText(ui.stageReturnToChild)).toBeInTheDocument();
      await freshUser.click(screen.getByText(ui.stageReturnToChild));

      expect(screen.getByText(ui.completeHeading)).toBeInTheDocument();
    });
  }
});
