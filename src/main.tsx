// App entry (/play).
import { createRoot } from 'react-dom/client';
import type { Mission, ModuleUiStrings } from './engine/types';
import { MissionShell } from './shell';
import missionJson from './modules/m1/topics/bread/s2.json';
import iceMissionJson from './modules/m1/topics/ice/s2.json';
import moduleJson from './modules/m1/module.json';

const mission = missionJson as unknown as Mission;
const iceMission = iceMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;

// Every mission this bundle ships, keyed by id — the shell resolves which one a profile
// actually plays via missionOrder + the profile's own stage (Sprint 1-A:
// docs/work-order-w2-stage-expansion.md §2.4), not a fixed import. Adding a mission here is a
// content change, not an engine change.
//
// WO-10: m1-s2-1-2 (topics/ice, "こおりは なぜ みずに うくの？") is real release content —
// reachable and playable here like any other m1 mission — but its facts.yaml claims are still
// status: pending and its mission JSON carries no review stamp, exactly like bread once did
// before its own Gate 1/Gate 2 passes. gate:claims (both modes) correctly fails until a human
// approves it; that failure is expected and does not block local play/testing, only RELEASE=1.
const missions: Record<string, Mission> = { [mission.id]: mission, [iceMission.id]: iceMission };

createRoot(document.getElementById('root')!).render(
  <MissionShell
    moduleId={moduleJson.id}
    freeMissionIds={moduleJson.freeMissionIds}
    mission={mission}
    missionLibrary={{ missionOrder: moduleJson.missionOrder, missions }}
    ui={ui}
    followMoves={moduleJson.followMoves}
    cardTypes={moduleJson.cardTypes}
  />,
);
