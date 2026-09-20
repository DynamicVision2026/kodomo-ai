// App entry (/play).
//
// WO-12/WO-13: bread (m1-s2-1-1's old occupant) and ice (m1-s2-1-2's old occupant) remain
// contentClass: "archived" and are still never imported here (WO-11 decision 5 — archived
// content must never be production-reachable). This entry point wires in both real release
// missions authored so far: topics/chanto/s2.json — Mission 1-1「ちゃんと しなさい」の
//「ちゃんと」(release-approved, WO-12) — and topics/genkan/s2.json — Mission 1-2「玄関で くつを
// ぬぐ」(WO-13), both reusing their id's rightful predecessor slot now that bread/ice are
// archived (module.json's freeMissionIds/missionOrder already pointed at both ids, unchanged by
// either ticket). `mission` (the fallback/default prop) stays chanto, since it's first in
// missionOrder; missionLibrary + pickNextMission is what actually walks a profile to genkan once
// 1-1 is done.
//
// Mission 1-2's facts.yaml claims are still status: pending and its mission JSON carries no
// review stamp — WO-13 explicitly forbids fabricating Founder (Gate 1) or native-speaker
// (Gate 2) approval, so gate:claims (both normal and RELEASE=1 mode) correctly fails on genkan
// until a human actually approves it, exactly the same honest-pending pattern chanto went
// through under WO-12 before its own Gate 1/Gate 2 passes (see git history on topics/chanto).
// Mission 1-1 itself is untouched by this change — same file, same content, same review stamp.
//
// WO-16 adds topics/rouka/s2.json — Mission 1-3「ろうかは 走らない」, the first genuine 3-layer
// Stage-2 mission. Same honest-pending pattern as genkan before it: facts.yaml's c1-c4 are all
// status: pending and s2.json carries no `review` field — WO-16 explicitly forbids fabricating
// either human gate, so gate:claims correctly fails on rouka until a human actually approves it.
// Wiring it in here (rather than leaving it unreachable) matches how genkan itself was wired in
// before its own gates passed — reachability is gated by contentClass, not by gate:claims state.
import { createRoot } from 'react-dom/client';
import type { Mission, ModuleUiStrings } from './engine/types';
import { MissionShell } from './shell';
import chantoMissionJson from './modules/m1/topics/chanto/s2.json';
import genkanMissionJson from './modules/m1/topics/genkan/s2.json';
import roukaMissionJson from './modules/m1/topics/rouka/s2.json';
import moduleJson from './modules/m1/module.json';

const chantoMission = chantoMissionJson as unknown as Mission;
const genkanMission = genkanMissionJson as unknown as Mission;
const roukaMission = roukaMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const missions: Record<string, Mission> = {
  [chantoMission.id]: chantoMission,
  [genkanMission.id]: genkanMission,
  [roukaMission.id]: roukaMission,
};

createRoot(document.getElementById('root')!).render(
  <MissionShell
    moduleId={moduleJson.id}
    freeMissionIds={moduleJson.freeMissionIds}
    mission={chantoMission}
    missionLibrary={{ missionOrder: moduleJson.missionOrder, missions }}
    ui={ui}
    followMoves={moduleJson.followMoves}
    cardTypes={moduleJson.cardTypes}
  />,
);
