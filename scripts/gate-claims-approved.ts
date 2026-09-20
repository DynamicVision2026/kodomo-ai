/**
 * CI GATE 4 — no mission ships on unapproved claims or without a native-review stamp.
 * This is the fact gate from spec v0.5 §6, made mechanical.
 *
 * Since the release-content classification decision (WO-9, migrated to per-mission granularity
 * by WO-11 / AD-02): every mission must declare its own contentClass "release", "synthetic" or
 * "archived" (on the mission JSON itself, not module.json — see scripts/lib/
 * moduleClassification.ts for why), and each class is gated differently — see that file for the
 * authoritative rules. This file is filesystem/CLI plumbing only; the actual checks are pure and
 * unit-tested there.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import {
  checkMissions, extractImportedTopicKeys,
  type MissionEntry, type FactsFile, type MissionRecord,
} from './lib/moduleClassification.js';

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src');
const MODULES = resolve(ROOT, 'src/modules');
const STRICT = process.env.RELEASE === '1'; // review stamp required only for release missions
const relPath = (p: string) => p.replace(ROOT + '/', '');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
  })(dir);
  return out;
}

function loadMissions(moduleDir: string, moduleId: string): MissionEntry[] {
  const missionFiles: string[] = [];
  (function walk(d: string) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.json') && !p.endsWith('module.json') && !/deck\.s\d+\.json$/.test(p)) missionFiles.push(p);
    }
  })(moduleDir);

  return missionFiles.map((f) => {
    const mission = JSON.parse(readFileSync(f, 'utf8')) as MissionRecord & { contentClass?: unknown };
    const factsPath = join(f, '..', 'facts.yaml');
    const facts = existsSync(factsPath)
      ? (parse(readFileSync(factsPath, 'utf8')) as FactsFile)
      : null;
    return { moduleId, relPath: relPath(f), contentClassRaw: mission.contentClass, mission, facts };
  });
}

if (!existsSync(MODULES)) {
  console.log('gate:claims: OK (0 release topic(s), 0 synthetic topic(s), 0 archived topic(s))');
  process.exit(0);
}

const missions = readdirSync(MODULES)
  .map((n) => join(MODULES, n))
  .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'module.json')))
  .flatMap((moduleDir) => {
    const manifest = JSON.parse(readFileSync(join(moduleDir, 'module.json'), 'utf8')) as { id: string };
    return loadMissions(moduleDir, manifest.id);
  });

const productionImportedTopicKeys = extractImportedTopicKeys(
  listSourceFiles(SRC).map((f) => readFileSync(f, 'utf8')),
);

const { issues, releaseTopicCount, syntheticTopicCount, archivedTopicCount } = checkMissions(missions, {
  strict: STRICT,
  productionImportedTopicKeys,
});

for (const issue of issues) console.error(`FAIL gate:claims — ${issue}`);
if (issues.length) process.exit(1);

console.log(
  `gate:claims: OK (${releaseTopicCount} release topic(s), ${syntheticTopicCount} synthetic topic(s), ` +
  `${archivedTopicCount} archived topic(s)${STRICT ? ', release mode' : ''})`,
);
