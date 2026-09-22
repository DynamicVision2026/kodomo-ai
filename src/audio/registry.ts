import type { AudioScript } from './types';
import chanto from './content/chanto.json';
import genkan from './content/genkan.json';
import oyatsu from './content/oyatsu.json';
import rouka from './content/rouka.json';
import minna from './content/minna.json';
import zurui from './content/zurui.json';
import kashite from './content/kashite.json';
import randoseru from './content/randoseru.json';
import bankAtode from './content/bank-atode.json';
import bankEscalator from './content/bank-escalator.json';
import bankJanken from './content/bank-janken.json';
import bankTeam from './content/bank-team.json';
import bankGakunen from './content/bank-gakunen.json';
import bankNedan from './content/bank-nedan.json';
import bankKirei from './content/bank-kirei.json';
import bankHoshii from './content/bank-hoshii.json';
import bankKotoba from './content/bank-kotoba.json';
import bankItadakimasu from './content/bank-itadakimasu.json';
import bankArigatou from './content/bank-arigatou.json';
import bank100yen from './content/bank-100yen.json';

// Deliberately outside src/modules: pipeline/04_lint.ts and scripts/gate-claims-approved.ts both
// walk src/modules for EVERY *.json file that isn't module.json/deck.sN.json and treat each one
// as a mission (requiring id/stage/phases, a facts.yaml, a review stamp, ...). These files are
// audio metadata, not mission content, so they live here instead — never swept into either gate,
// never mistaken for a 21st+ mission.
//
// Final Module 1 Audio Integration Pass: all 20 Module 1 units' own now-finalized, production-
// ready scripts (WO-33's original 3 plus the 17 the remaining-audio rollout produced) — every
// one of them actually reachable by the runtime audio path via `audioScriptFor` below. Before
// this pass, only the original 3 were registered here; the other 17's own `audioStatus: 'ready'`
// manifests existed on disk but `audioScriptFor` returned `undefined` for all of them, so
// src/shell/MissionShell.tsx's screen routing skipped their audio entirely — never even the
// text-anchor fallback — for every one of those 17 missions, in both solo and co-play.
const SCRIPTS: readonly AudioScript[] = [
  chanto as AudioScript,
  genkan as AudioScript,
  rouka as AudioScript,
  oyatsu as AudioScript,
  minna as AudioScript,
  zurui as AudioScript,
  kashite as AudioScript,
  randoseru as AudioScript,
  bankAtode as AudioScript,
  bankEscalator as AudioScript,
  bankJanken as AudioScript,
  bankTeam as AudioScript,
  bankGakunen as AudioScript,
  bankNedan as AudioScript,
  bankKirei as AudioScript,
  bankHoshii as AudioScript,
  bankKotoba as AudioScript,
  bankItadakimasu as AudioScript,
  bankArigatou as AudioScript,
  bank100yen as AudioScript,
];

const BY_MISSION_ID = new Map(SCRIPTS.map((s) => [s.missionId, s]));

/** All 20 Module 1 units' own registered scripts (Final Module 1 Audio Integration Pass) —
 *  `undefined` only for a mission id outside Module 1 entirely. */
export function audioScriptFor(missionId: string): AudioScript | undefined {
  return BY_MISSION_ID.get(missionId);
}
