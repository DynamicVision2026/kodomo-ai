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
// Stage-2 mission. Mission 1-3 reached full release-clear (both gates) in WO-20 Phase 0.
//
// WO-20 Phase 2 adds Missions 1-4 through 1-8 (topics/oyatsu, minna, zurui, kashite, randoseru)
// as candidate release content — same honest-pending pattern as every mission before its own
// gates passed: each one's facts.yaml claims are status: pending and its s2.json carries no
// `review` field. Wiring them in here (rather than leaving them unreachable) matches every prior
// mission's own precedent — reachability is gated by contentClass, not by gate:claims state.
//
// WO-21 Phase 1: Bank topics (B01-B12, src/modules/m1/topics/bank-*) are now wired in via
// `bankLibrary` — the free-pick list added to MissionShell (src/shell/BankSelect.tsx), reached
// from the parent screen. Order below matches docs/AD-04-bank-topics.md's accepted B01-B12
// numbering exactly (display order only — spec's "pickable in any order" is the family's own
// choice, not an enforced sequence, so this is not a second missionOrder).
//
// WO-23 (AD-06 §8): `familyTestMode` is a build-time opt-in (`VITE_FAMILY_TEST_MODE=1`),
// completely isolated from real entitlement logic — `hasAccess()` (src/engine/entitlements.ts)
// is never touched, never bypassed at the engine level, and every real production build ships
// with this env var unset. When set, MissionShell's two entitlement checkpoints skip the
// `hasAccess()` call entirely (see MissionShellProps.familyTestMode's own doc comment) so a
// QA/family-test build can reach all 8 Story Missions and all 12 Bank Digs without a real
// purchase. Documented in docs/family-test-mode.md.
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import type { Mission, ModuleUiStrings } from './engine/types';
import { MissionShell } from './shell';
import chantoMissionJson from './modules/m1/topics/chanto/s2.json';
import genkanMissionJson from './modules/m1/topics/genkan/s2.json';
import roukaMissionJson from './modules/m1/topics/rouka/s2.json';
import oyatsuMissionJson from './modules/m1/topics/oyatsu/s2.json';
import minnaMissionJson from './modules/m1/topics/minna/s2.json';
import zuruiMissionJson from './modules/m1/topics/zurui/s2.json';
import kashiteMissionJson from './modules/m1/topics/kashite/s2.json';
import randoseruMissionJson from './modules/m1/topics/randoseru/s2.json';
import bankAtodeJson from './modules/m1/topics/bank-atode/s2.json';
import bankEscalatorJson from './modules/m1/topics/bank-escalator/s2.json';
import bankJankenJson from './modules/m1/topics/bank-janken/s2.json';
import bankTeamJson from './modules/m1/topics/bank-team/s2.json';
import bankGakunenJson from './modules/m1/topics/bank-gakunen/s2.json';
import bankNedanJson from './modules/m1/topics/bank-nedan/s2.json';
import bankKireiJson from './modules/m1/topics/bank-kirei/s2.json';
import bankHoshiiJson from './modules/m1/topics/bank-hoshii/s2.json';
import bankKotobaJson from './modules/m1/topics/bank-kotoba/s2.json';
import bankItadakimasuJson from './modules/m1/topics/bank-itadakimasu/s2.json';
import bankArigatouJson from './modules/m1/topics/bank-arigatou/s2.json';
import bank100yenJson from './modules/m1/topics/bank-100yen/s2.json';
import moduleJson from './modules/m1/module.json';

const chantoMission = chantoMissionJson as unknown as Mission;
const genkanMission = genkanMissionJson as unknown as Mission;
const roukaMission = roukaMissionJson as unknown as Mission;
const oyatsuMission = oyatsuMissionJson as unknown as Mission;
const minnaMission = minnaMissionJson as unknown as Mission;
const zuruiMission = zuruiMissionJson as unknown as Mission;
const kashiteMission = kashiteMissionJson as unknown as Mission;
const randoseruMission = randoseruMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const missions: Record<string, Mission> = {
  [chantoMission.id]: chantoMission,
  [genkanMission.id]: genkanMission,
  [roukaMission.id]: roukaMission,
  [oyatsuMission.id]: oyatsuMission,
  [minnaMission.id]: minnaMission,
  [zuruiMission.id]: zuruiMission,
  [kashiteMission.id]: kashiteMission,
  [randoseruMission.id]: randoseruMission,
};

const bankMissions = [
  bankAtodeJson, bankEscalatorJson, bankJankenJson, bankTeamJson, bankGakunenJson, bankNedanJson,
  bankKireiJson, bankHoshiiJson, bankKotobaJson, bankItadakimasuJson, bankArigatouJson,
  bank100yenJson,
].map((m) => m as unknown as Mission);
const bankMissionsById: Record<string, Mission> = Object.fromEntries(
  bankMissions.map((m) => [m.id, m]),
);

const familyTestMode = import.meta.env.VITE_FAMILY_TEST_MODE === '1';

createRoot(document.getElementById('root')!).render(
  <MissionShell
    moduleId={moduleJson.id}
    freeMissionIds={moduleJson.freeMissionIds}
    mission={chantoMission}
    missionLibrary={{ missionOrder: moduleJson.missionOrder, missions }}
    bankLibrary={{ bankOrder: bankMissions.map((m) => m.id), missions: bankMissionsById }}
    ui={ui}
    followMoves={moduleJson.followMoves}
    cardTypes={moduleJson.cardTypes}
    familyTestMode={familyTestMode}
  />,
);
