import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { AppState } from '../src/engine/storage';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import bread from '../src/modules/m1/topics/bread/s2.json';
import dummy from '../src/modules/m2-test/topics/dummy/s3.json';
import moduleJson from '../src/modules/m1/module.json';

const stage2Mission = bread as unknown as Mission;
const stage3Mission = dummy as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;

const missionLibrary = {
  missionOrder: [stage2Mission.id, stage3Mission.id],
  missions: { [stage2Mission.id]: stage2Mission, [stage3Mission.id]: stage3Mission },
};
const freeMissionIds = [stage2Mission.id, stage3Mission.id];

function seed(stage: 2 | 3) {
  const state: AppState = {
    // milestones.M0 pre-seeded achieved — this fixture proves stage-based mission selection, not
    // the M0 ritual (tests/CompletionRitual.test.tsx's own concern); a fresh profile without it
    // would land on the 'm0-ritual' screen instead of Course Home.
    profiles: [{
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage, progress: {},
      milestones: { M0: { achieved: true, achievedAt: 0 } },
    }],
    familyId: null,
    cachedEntitlements: [],
    pendingSyncKeys: [],
    abVariant: 'A',
    deviceId: 'device-seed-1',
  };
  localStorage.setItem('m-app.v2', JSON.stringify(state));
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

/**
 * Sprint 1-A gap E (docs/work-order-w2-stage-expansion.md §2.4): the mission a profile actually
 * plays must follow that profile's own `stage`, not whichever mission happened to be passed in
 * as the default. Both fixtures here are content this repo already ships and tests elsewhere
 * (bread/s2.json = Stage 2, m2-test's dummy s3.json = Stage 3) — this test only proves the
 * *selection*, not the content itself.
 */
describe('MissionShell + missionLibrary: mission selection follows the profile\'s stage', () => {
  it('a Stage 3 profile reaches the Stage 3 mission even though the default mission is Stage 2', async () => {
    seed(3);
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1"
        freeMissionIds={freeMissionIds}
        mission={stage2Mission}
        missionLibrary={missionLibrary}
        ui={ui}
      />,
    );

    await user.click(screen.getByText('たぬき')); // selects the seeded Stage 3 profile
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    // The Stage 3 dummy mission's own "check" card, not bread's slot-assembly card.
    expect(screen.getByText('これで ただしいか みなおしてみよう')).toBeInTheDocument();
  });

  it('a Stage 2 profile still reaches the Stage 2 mission when a library is supplied', async () => {
    seed(2);
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1"
        freeMissionIds={freeMissionIds}
        mission={stage2Mission}
        missionLibrary={missionLibrary}
        ui={ui}
      />,
    );

    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    expect(screen.getByText('パンが ふくらむのは なぜ？')).toBeInTheDocument();
  });

  it('falls back to the default mission when no missionLibrary is supplied at all', async () => {
    seed(3); // even a Stage 3 profile, with no library to consult, gets the default mission
    const user = userEvent.setup();
    render(<MissionShell moduleId="m1" freeMissionIds={freeMissionIds} mission={stage2Mission} ui={ui} />);

    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    expect(screen.getByText('パンが ふくらむのは なぜ？')).toBeInTheDocument();
  });
});
