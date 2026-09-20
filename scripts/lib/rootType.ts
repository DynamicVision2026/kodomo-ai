/**
 * The closed rootType contract — WO-11 decision 2 (the Founder's numbered ticket decision, not a
 * section of any AD-02 document present in this repository; see
 * docs/WO-11-implementation-notes-content-classification.md): exactly three accepted values for
 * what a commissioned topic's ねっこ resolves into. No quotas across them.
 *
 * Deliberately declared here, under scripts/, rather than as a literal union in
 * src/engine/types.ts: gate:no-hardcoded-copy scans every .tsx?/.ts? file under src/ for Japanese
 * string literals and reserves them for module JSON, never engine source (see that file's own
 * `Domain` type for the precedent this follows). scripts/ is outside that gate's scan root, so
 * the three real values can live here as an actual, enforced closed set instead of being
 * loosened to `string` with no runtime check anywhere.
 *
 * checkMissions() in ./moduleClassification.ts calls parseRootType() on every mission that
 * declares a rootType at all; a value outside this set fails gate:claims. A mission with no
 * rootType field is unaffected — the field is optional until a future ticket (C-03) starts
 * setting it.
 */

export const ROOT_TYPES = ['しくみ', 'めあて', 'わかれ'] as const;

export type RootType = (typeof ROOT_TYPES)[number];

/** Validates a raw rootType value. Returns the narrowed type, or null if it isn't exactly one of
 *  the three accepted values — no normalization, no case-folding, no trimming: a value that
 *  merely looks close (extra whitespace, romaji, a plausible fourth word) is rejected, not
 *  coerced. */
export function parseRootType(raw: unknown): RootType | null {
  return (ROOT_TYPES as readonly unknown[]).includes(raw) ? (raw as RootType) : null;
}
