/**
 * Release-content classification (Architect decision, post-bd92ec7). Every module under
 * src/modules must explicitly declare exactly one `contentClass`:
 *   - "release"   — reachable by real families; every content gate applies; genuine Gate 1
 *                    (facts.yaml claim approval) and Gate 2 (mission review stamp, RELEASE=1
 *                    only) human approvals are required.
 *   - "synthetic" — engine/test fixture only; never rendered to a real family; structural/
 *                    deterministic validation (pipeline/04_lint.ts) still applies to it
 *                    unconditionally, but it must never carry a human approval artifact
 *                    (an "approved" claim status, or a mission `review` stamp) — those would
 *                    misrepresent test content as having passed real human review.
 *
 * There is no default: a module.json with a missing or unrecognised `contentClass` fails
 * unconditionally (in both normal and RELEASE=1 gate:claims), not just release-mode checks —
 * this is a structural manifest error, not a release-readiness gap.
 *
 * Pure and framework-free (mirrors pipeline/04_lint.ts's own lintMission/lintDeck split) so the
 * classification and reachability rules can be unit-tested without touching the filesystem;
 * scripts/gate-claims-approved.ts supplies the real filesystem/import-scan data.
 */

export type ContentClass = 'release' | 'synthetic';

export interface ClaimRecord {
  id: string;
  status: string;
}

export interface FactsFile {
  claims?: ClaimRecord[];
}

export interface MissionRecord {
  review?: { by: string; date: string };
}

export interface MissionEntry {
  /** Path reported in issue messages — repo-relative, e.g. "src/modules/m1/topics/bread/s2.json". */
  relPath: string;
  mission: MissionRecord;
  /** null when no facts.yaml sits beside this mission file. */
  facts: FactsFile | null;
}

export interface ModuleEntry {
  id: string;
  /** Read straight off module.json, unvalidated — checkModules() is what validates it. */
  contentClassRaw: unknown;
  missions: MissionEntry[];
}

export interface CheckOptions {
  /** RELEASE=1 — Gate 2's review-stamp requirement only applies in this mode. */
  strict: boolean;
  /** Module ids actually reachable via a static import somewhere under src/ (production source),
   *  as found by extractImportedModuleIds() over every non-data file there. */
  productionImportedModuleIds: Set<string>;
}

export interface CheckResult {
  issues: string[];
  releaseModuleCount: number;
  syntheticModuleCount: number;
}

/** Validates a raw contentClass value. Returns the narrowed type, or null if missing/unrecognised
 *  — the caller decides how to report that (checkModules turns it into an issue). No inference:
 *  any value other than the two literal strings is invalid, including "" or a typo. */
export function parseContentClass(raw: unknown): ContentClass | null {
  return raw === 'release' || raw === 'synthetic' ? raw : null;
}

/**
 * Scans raw file contents (e.g. every .ts/.tsx source under src/) for a static import path of
 * the form `modules/<id>/...` and returns the set of module ids so referenced. Pure string
 * scanning, no module resolution — matches how simply src/main.tsx and src/print/deck/main.tsx
 * actually reference module content (`from './modules/m1/module.json'`,
 * `from '../../modules/m1/deck.s2.json'`), which is the repository's one real "is this module
 * reachable from production" mechanism. Deliberately not a maintained registry: this reads the
 * actual import graph, the same one Vite bundles from.
 */
export function extractImportedModuleIds(fileContents: string[]): Set<string> {
  const ids = new Set<string>();
  const pattern = /modules\/([^/'"`]+)\//g;
  for (const content of fileContents) {
    for (const match of content.matchAll(pattern)) {
      const id = match[1];
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Core check, shared by both gate:claims modes. For every module: validates contentClass (no
 * default), enforces the production-reachability invariant for synthetic modules, then applies
 * class-appropriate mission checks — release missions need approved claims (+ a review stamp
 * under `strict`); synthetic missions must NOT carry either (an approved claim or a review stamp
 * is itself a failure, not merely unrequired — synthetic content must never look human-approved).
 */
export function checkModules(modules: ModuleEntry[], opts: CheckOptions): CheckResult {
  const issues: string[] = [];
  let releaseModuleCount = 0;
  let syntheticModuleCount = 0;

  for (const mod of modules) {
    const contentClass = parseContentClass(mod.contentClassRaw);
    if (!contentClass) {
      issues.push(
        `module "${mod.id}" has a missing or unrecognised contentClass (got ${JSON.stringify(mod.contentClassRaw)}` +
        ') — every module must explicitly declare "release" or "synthetic"; there is no default',
      );
      continue; // nothing else about this module can be meaningfully checked
    }

    if (contentClass === 'release') releaseModuleCount++;
    else syntheticModuleCount++;

    if (contentClass === 'synthetic' && opts.productionImportedModuleIds.has(mod.id)) {
      issues.push(
        `module "${mod.id}" is classified synthetic but is imported from production source under src/ — ` +
        'synthetic modules must never be reachable from production',
      );
    }

    for (const { relPath, mission, facts } of mod.missions) {
      if (contentClass === 'release') {
        if (!facts) { issues.push(`${relPath} has no facts.yaml beside it`); continue; }
        const unapproved = (facts.claims ?? []).filter((c) => c.status !== 'approved').map((c) => c.id);
        if (unapproved.length) {
          issues.push(`${relPath} uses facts.yaml with unapproved claims: ${unapproved.join(', ')}`);
        }
        if (opts.strict && !mission.review?.by) {
          issues.push(`${relPath} has no native-speaker review stamp (RELEASE=1)`);
        }
      } else {
        const approvedClaims = (facts?.claims ?? []).filter((c) => c.status === 'approved').map((c) => c.id);
        if (approvedClaims.length) {
          issues.push(
            `${relPath} is in synthetic module "${mod.id}" but facts.yaml has claim(s) marked approved: ` +
            `${approvedClaims.join(', ')} — synthetic content must never carry Gate 1 human approval`,
          );
        }
        if (mission.review?.by) {
          issues.push(
            `${relPath} is in synthetic module "${mod.id}" but carries a Gate 2 review stamp ` +
            `(by: ${mission.review.by}) — synthetic content must never carry Gate 2 native-review approval`,
          );
        }
      }
    }
  }

  return { issues, releaseModuleCount, syntheticModuleCount };
}
