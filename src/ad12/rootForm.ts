import rootFormMap from './root-form-map.json';

/** The three static root forms F5 specifies — romanized, visual-layer-only identifiers, never
 *  the authored rootType vocabulary itself (that stays in module JSON/facts, per spec v0.5 §7 —
 *  see root-form-map.json, the one place this file's own mapping keys those Japanese values). */
export type RootForm = 'upward' | 'interlocking' | 'twoEqual';

/**
 * Resolves a mission's own authored `rootType` (src/engine/types.ts's `RootType`, a plain
 * opaque string at the engine layer) to which static F5 form its root plane renders. Never
 * branches on the literal Japanese value in code — the mapping itself lives in root-form-map.json
 * (data, not source), the same "child-facing/content vocabulary lives in JSON" discipline
 * gate:no-hardcoded-copy already enforces everywhere else under src/. Returns null for a rootType
 * outside the three accepted values (scripts/lib/rootType.ts's own closed set) — the caller
 * decides what to do with an unauthored/invalid mission rather than this silently guessing.
 */
export function rootFormFor(rootType: string | undefined): RootForm | null {
  if (!rootType) return null;
  const form = (rootFormMap as Record<string, RootForm>)[rootType];
  return form ?? null;
}
