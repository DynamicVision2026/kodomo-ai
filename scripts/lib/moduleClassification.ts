import { ROOT_TYPES, parseRootType } from './rootType.js';

/**
 * Release-content classification (Architect decision, post-bd92ec7; migrated to per-mission
 * granularity by WO-11). Every mission file under src/modules must explicitly declare
 * exactly one `contentClass`, on the mission JSON itself (not the module manifest — see "Why
 * mission-level, not module-level" below):
 *   - "release"   — reachable by real families; every content gate applies; genuine Gate 1
 *                    (facts.yaml claim approval) and Gate 2 (mission review stamp, RELEASE=1
 *                    only) human approvals are required.
 *   - "synthetic" — engine/test fixture only; never rendered to a real family; structural/
 *                    deterministic validation (pipeline/04_lint.ts) still applies to it
 *                    unconditionally, but it must never carry a human approval artifact
 *                    (an "approved" claim status, or a mission `review` stamp) — those would
 *                    misrepresent test content as having passed real human review.
 *   - "archived"  — genuine historical release content that once passed real Gate 1/Gate 2
 *                    human approval but is no longer current release curriculum (WO-11 decision 5).
 *                    Preserves that approval/review history as-is (the opposite of synthetic's
 *                    rule: archived content is EXPECTED to carry real approval metadata, and
 *                    nothing here erases or invalidates it) but is excluded from ongoing
 *                    release-approval requirements (an archived mission's claims may sit at
 *                    "approved" forever without needing re-approval, and it needs no review
 *                    stamp to pass RELEASE=1) and, like synthetic, must never be reachable from
 *                    production — a family must never be able to play it.
 *
 * There is no default: a mission with a missing or unrecognised `contentClass` fails
 * unconditionally (in both normal and RELEASE=1 gate:claims), not just release-mode checks —
 * this is a structural manifest error, not a release-readiness gap.
 *
 * Why mission-level, not module-level (WO-11 migration note): the previous (WO-9) design put
 * `contentClass` on module.json, one value for every mission a module ships. That broke the
 * moment a single module (m1) needed to hold missions in different lifecycle states at once —
 * archiving bread and ice must not also silently archive m1's other assets (its cardTypes/ui
 * catalog, its printable deck) that a future release topic under the same module will still
 * need. Moving the field onto each mission's own JSON — the same file that already carries
 * `review` — makes "is THIS topic release-worthy" answerable per topic, which is what "0 release
 * topics" (WO-11) actually means. module.json no longer carries or requires a contentClass field.
 *
 * Pure and framework-free (mirrors pipeline/04_lint.ts's own lintMission/lintDeck split) so the
 * classification and reachability rules can be unit-tested without touching the filesystem;
 * scripts/gate-claims-approved.ts supplies the real filesystem/import-scan data.
 */

export type ContentClass = 'release' | 'synthetic' | 'archived';

export interface ClaimRecord {
  id: string;
  status: string;
}

export interface FactsFile {
  claims?: ClaimRecord[];
}

export interface MissionRecord {
  /** `note` (WO-14 final correction): optional free-text scope annotation, e.g. "register-only
   *  re-review" — never read here, gate:claims only ever checks `.by`. */
  review?: { by: string; date: string; note?: string };
  /** WO-21 Phase 0: an explicit Founder decision to waive the native-speaker Gate 2 round as a
   *  blocking step for this release cycle — never a substitute for `review`, never inferred from
   *  it. gate:claims accepts EITHER a real `review.by` OR this waiver in RELEASE=1 mode. */
  gate2Waiver?: { waivedBy: string; waivedAt: string; reason: string };
}

export interface MissionEntry {
  /** The owning module's id — for grouping/reporting and error messages only; no longer read for
   *  classification (see the module-note above). */
  moduleId: string;
  /** Path reported in issue messages — repo-relative, e.g. "src/modules/m1/topics/bread/s2.json". */
  relPath: string;
  /** Read straight off the mission JSON's own `contentClass` field, unvalidated —
   *  checkMissions() is what validates it. */
  contentClassRaw: unknown;
  /** Read straight off the mission JSON's own `rootType` field, unvalidated — checkMissions() is
   *  what validates it. Optional (`undefined`): no existing mission sets this yet, and its
   *  absence is not itself an error (WO-11 decision 2 records the contract for the next content
   *  ticket, it does not require every mission to carry it today). When a mission DOES set it,
   *  the value must be one of scripts/lib/rootType.ts's three accepted values — see WO-11C's
   *  adversarial coverage in tests/rootType.test.ts and this file's own test suite. */
  rootTypeRaw?: unknown;
  mission: MissionRecord;
  /** null when no facts.yaml sits beside this mission file. */
  facts: FactsFile | null;
}

export interface CheckOptions {
  /** RELEASE=1 — Gate 2's review-stamp requirement only applies to release missions in this mode. */
  strict: boolean;
  /** Topic keys actually reachable via a static import somewhere under src/ (production source),
   *  as found by extractImportedTopicKeys() over every non-data file there. Each key is the
   *  "modules/<moduleId>/topics/<topicId>/" path segment a real import references — see
   *  topicKeyOf(). */
  productionImportedTopicKeys: Set<string>;
}

export interface CheckResult {
  issues: string[];
  releaseTopicCount: number;
  syntheticTopicCount: number;
  archivedTopicCount: number;
}

/** Validates a raw contentClass value. Returns the narrowed type, or null if missing/unrecognised
 *  — the caller decides how to report that (checkMissions turns it into an issue). No inference:
 *  any value other than the three literal strings is invalid, including "" or a typo. */
export function parseContentClass(raw: unknown): ContentClass | null {
  return raw === 'release' || raw === 'synthetic' || raw === 'archived' ? raw : null;
}

/** The reachability key for a mission at `relPath` — the "modules/<moduleId>/topics/<topicId>/"
 *  segment of its own path. Two missions under the same topic directory (e.g. a future
 *  facts.yaml-adjacent asset) share one key; that's intentional; reachability is a topic-folder
 *  concept, not a single-file one. Returns null for a path that doesn't match that shape (should
 *  not happen for any real mission file, but the caller shouldn't crash on one that doesn't). */
export function topicKeyOf(relPath: string): string | null {
  const match = relPath.match(/(modules\/[^/]+\/topics\/[^/]+\/)/);
  return match ? match[1]! : null;
}

/**
 * Scans raw file contents (e.g. every .ts/.tsx source under src/) for a static import path
 * referencing a specific topic folder — `modules/<moduleId>/topics/<topicId>/...` — and returns
 * the set of topic keys so referenced (see topicKeyOf() for the key shape). Pure string
 * scanning, no module resolution — matches how src/main.tsx actually references mission content
 * (`from './modules/m1/topics/bread/s2.json'`), which is the repository's one real "is this
 * topic reachable from production" mechanism. Deliberately not a maintained registry: this reads
 * the actual import graph, the same one Vite bundles from.
 *
 * A plain `modules/<id>/module.json` or `modules/<id>/deck.sN.json` import (no /topics/ segment)
 * is NOT captured here — those aren't mission/topic content, and importing a module's shared
 * manifest or printable-deck asset does not make any of its topics reachable.
 */
export function extractImportedTopicKeys(fileContents: string[]): Set<string> {
  const keys = new Set<string>();
  const pattern = /modules\/[^/'"`]+\/topics\/[^/'"`]+\//g;
  for (const content of fileContents) {
    for (const match of content.match(pattern) ?? []) keys.add(match);
  }
  return keys;
}

/**
 * Core check, shared by both gate:claims modes. For every mission: validates contentClass (no
 * default), enforces the production-reachability invariant for synthetic and archived missions,
 * then applies class-appropriate checks —
 *   release:   needs approved claims (+ a review stamp under `strict`).
 *   synthetic: must NOT carry either (an approved claim or a review stamp is itself a failure,
 *              not merely unrequired — synthetic content must never look human-approved).
 *   archived:  no approval requirement of any kind (excluded from release-approval checking
 *              entirely) — and, unlike synthetic, an approved claim or review stamp already
 *              present is fine and expected; nothing here flags or touches it.
 */
export function checkMissions(missions: MissionEntry[], opts: CheckOptions): CheckResult {
  const issues: string[] = [];
  let releaseTopicCount = 0;
  let syntheticTopicCount = 0;
  let archivedTopicCount = 0;

  for (const entry of missions) {
    const { moduleId, relPath, mission, facts } = entry;

    // WO-11C: closed-set rootType enforcement, independent of contentClass — a mission with an
    // invalid rootType is a structural manifest error regardless of whether it's release,
    // synthetic or archived, so this runs even for a mission whose contentClass itself is broken.
    if (entry.rootTypeRaw !== undefined) {
      const rootType = parseRootType(entry.rootTypeRaw);
      if (!rootType) {
        issues.push(
          `${relPath} has an unsupported rootType (got ${JSON.stringify(entry.rootTypeRaw)}) — ` +
          `only ${ROOT_TYPES.join(', ')} are accepted`,
        );
      }
    }

    const contentClass = parseContentClass(entry.contentClassRaw);
    if (!contentClass) {
      issues.push(
        `${relPath} has a missing or unrecognised contentClass (got ${JSON.stringify(entry.contentClassRaw)}` +
        ') — every mission must explicitly declare "release", "synthetic" or "archived"; there is no default',
      );
      continue; // nothing else about this mission can be meaningfully checked
    }

    if (contentClass === 'release') releaseTopicCount++;
    else if (contentClass === 'synthetic') syntheticTopicCount++;
    else archivedTopicCount++;

    if (contentClass !== 'release') {
      const key = topicKeyOf(relPath);
      if (key && opts.productionImportedTopicKeys.has(key)) {
        issues.push(
          `${relPath} is classified ${contentClass} (module "${moduleId}") but is imported from ` +
          `production source under src/ — ${contentClass} content must never be reachable from production`,
        );
      }
    }

    if (contentClass === 'release') {
      if (!facts) { issues.push(`${relPath} has no facts.yaml beside it`); continue; }
      const unapproved = (facts.claims ?? []).filter((c) => c.status !== 'approved').map((c) => c.id);
      if (unapproved.length) {
        issues.push(`${relPath} uses facts.yaml with unapproved claims: ${unapproved.join(', ')}`);
      }
      // WO-21 Phase 0: a genuine, explicit Founder waiver of the Gate 2 blocking step satisfies
      // this check exactly like a real review stamp would — but the two are never conflated:
      // `gate2Waiver` never claims a native review happened, and `review.by` never gets inferred
      // from a waiver's mere presence.
      if (opts.strict && !mission.review?.by && !mission.gate2Waiver?.waivedBy) {
        issues.push(`${relPath} has no native-speaker review stamp and no Gate 2 waiver (RELEASE=1)`);
      }
    } else if (contentClass === 'synthetic') {
      const approvedClaims = (facts?.claims ?? []).filter((c) => c.status === 'approved').map((c) => c.id);
      if (approvedClaims.length) {
        issues.push(
          `${relPath} is classified synthetic but facts.yaml has claim(s) marked approved: ` +
          `${approvedClaims.join(', ')} — synthetic content must never carry Gate 1 human approval`,
        );
      }
      if (mission.review?.by) {
        issues.push(
          `${relPath} is classified synthetic but carries a Gate 2 review stamp ` +
          `(by: ${mission.review.by}) — synthetic content must never carry Gate 2 native-review approval`,
        );
      }
      if (mission.gate2Waiver?.waivedBy) {
        issues.push(
          `${relPath} is classified synthetic but carries a Gate 2 waiver — synthetic content ` +
          `must never carry a release-gate decision of any kind`,
        );
      }
    }
    // archived: no further checks — approval history, if present, is left exactly as-is.
  }

  return { issues, releaseTopicCount, syntheticTopicCount, archivedTopicCount };
}
