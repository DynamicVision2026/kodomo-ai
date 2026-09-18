// App entry (/play).
import { createRoot } from 'react-dom/client';
import type { Mission, ModuleUiStrings } from './engine/types';
import { MissionShell } from './shell';
import missionJson from './modules/m1/topics/bread/s2.json';
import moduleJson from './modules/m1/module.json';

const mission = missionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;

// Every mission this bundle ships, keyed by id — today that's just bread's Stage 2 mission,
// but the shell resolves which one a profile actually plays via missionOrder + the profile's
// own stage (Sprint 1-A: docs/work-order-w2-stage-expansion.md §2.4), not a fixed import.
// Adding a Stage 1 or Stage 3 mission here is a content change, not an engine change.
const missions: Record<string, Mission> = { [mission.id]: mission };

createRoot(document.getElementById('root')!).render(
  <MissionShell
    moduleId={moduleJson.id}
    freeMissionIds={moduleJson.freeMissionIds}
    mission={mission}
    missionLibrary={{ missionOrder: moduleJson.missionOrder, missions }}
    ui={ui}
  />,
);
