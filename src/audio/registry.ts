import type { AudioScript } from './types';
import chanto from './content/chanto.json';
import genkan from './content/genkan.json';
import oyatsu from './content/oyatsu.json';

// Deliberately outside src/modules: pipeline/04_lint.ts and scripts/gate-claims-approved.ts both
// walk src/modules for EVERY *.json file that isn't module.json/deck.sN.json and treat each one
// as a mission (requiring id/stage/phases, a facts.yaml, a review stamp, ...). These three files
// are audio metadata, not mission content, so they live here instead — never swept into either
// gate, never mistaken for a 21st/22nd/23rd mission.
const SCRIPTS: readonly AudioScript[] = [
  chanto as AudioScript,
  genkan as AudioScript,
  oyatsu as AudioScript,
];

const BY_MISSION_ID = new Map(SCRIPTS.map((s) => [s.missionId, s]));

/** The Audio Reference Slice's three frozen scripts (WO-33) — `undefined` for every other
 *  mission id, which is the common case until the remaining Audio rollout happens. */
export function audioScriptFor(missionId: string): AudioScript | undefined {
  return BY_MISSION_ID.get(missionId);
}
