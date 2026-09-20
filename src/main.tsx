// App entry (/play).
//
// WO-12: bread (m1-s2-1-1's old occupant) and ice (m1-s2-1-2) remain contentClass: "archived"
// and are still never imported here (WO-11 decision 5 — archived content must never be
// production-reachable). This entry point now wires in topics/chanto/s2.json — Mission 1-1
//「ちゃんと しなさい」の「ちゃんと」 — the first real release-content vertical slice from the
// commissioned AD-04 v1 library, reusing the id "m1-s2-1-1" as its rightful successor now that
// the old occupant is archived (see module.json's freeMissionIds/missionOrder, unchanged by this
// ticket since they already point at that id).
//
// This mission's facts.yaml claims are still status: pending and its mission JSON carries no
// review stamp — WO-12 explicitly forbids fabricating Founder (Gate 1) or native-speaker
// (Gate 2) approval, so gate:claims (both normal and RELEASE=1 mode) correctly fails until a
// human actually approves it. That failure is expected and does not block local play/testing —
// exactly the same honest-pending pattern ice went through under WO-10 before its own Gate 1/
// Gate 2 passes (see git history on topics/ice).
import { createRoot } from 'react-dom/client';
import type { Mission, ModuleUiStrings } from './engine/types';
import { MissionShell } from './shell';
import missionJson from './modules/m1/topics/chanto/s2.json';
import moduleJson from './modules/m1/module.json';

const mission = missionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const missions: Record<string, Mission> = { [mission.id]: mission };

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
