/**
 * CI GATE 4 — no mission ships on unapproved claims or without a native-review stamp.
 * This is the fact gate from spec v0.5 §6, made mechanical.
 *
 * Since the release-content classification decision (post-bd92ec7): every module must declare
 * contentClass "release" or "synthetic" (module.json), and release vs. synthetic content is
 * gated differently — see scripts/lib/moduleClassification.ts for the authoritative rules. This
 * file is filesystem/CLI plumbing only; the actual checks are pure and unit-tested there.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import {
  checkModules, extractImportedModuleIds,
  type ModuleEntry, type MissionEntry, type FactsFile, type MissionRecord,
} from './lib/moduleClassification.js';

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src');
const MODULES = resolve(ROOT, 'src/modules');
const STRICT = process.env.RELEASE === '1'; // review stamp required only for release builds
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

function loadModule(moduleDir: string): ModuleEntry {
  const manifest = JSON.parse(readFileSync(join(moduleDir, 'module.json'), 'utf8')) as { id: string; contentClass?: unknown };

  const missionFiles: string[] = [];
  (function walk(d: string) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.json') && !p.endsWith('module.json') && !/deck\.s\d+\.json$/.test(p)) missionFiles.push(p);
    }
  })(moduleDir);

  const missions: MissionEntry[] = missionFiles.map((f) => {
    const mission = JSON.parse(readFileSync(f, 'utf8')) as MissionRecord;
    const factsPath = join(f, '..', 'facts.yaml');
    const facts = existsSync(factsPath)
      ? (parse(readFileSync(factsPath, 'utf8')) as FactsFile)
      : null;
    return { relPath: relPath(f), mission, facts };
  });

  return { id: manifest.id, contentClassRaw: manifest.contentClass, missions };
}

if (!existsSync(MODULES)) {
  console.log('gate:claims: OK (0 release module(s), 0 mission file(s))');
  process.exit(0);
}

const modules = readdirSync(MODULES)
  .map((n) => join(MODULES, n))
  .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'module.json')))
  .map(loadModule);

const productionImportedModuleIds = extractImportedModuleIds(
  listSourceFiles(SRC).map((f) => readFileSync(f, 'utf8')),
);

const { issues, releaseModuleCount, syntheticModuleCount } = checkModules(modules, {
  strict: STRICT,
  productionImportedModuleIds,
});

for (const issue of issues) console.error(`FAIL gate:claims — ${issue}`);
if (issues.length) process.exit(1);

const missionFileCount = modules.reduce((n, m) => n + m.missions.length, 0);
console.log(
  `gate:claims: OK (${releaseModuleCount} release module(s), ${syntheticModuleCount} synthetic module(s), ` +
  `${missionFileCount} mission file(s)${STRICT ? ', release mode' : ''})`,
);
