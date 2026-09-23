import { useEffect, useRef, useState } from 'react';

/** AD-07 §9: SHOW -> NUDGE -> FADE -> INDEPENDENT, per verb, per profile. */
export type GuidanceLevel = 'show' | 'nudge' | 'fade' | 'independent';

/** AD-07 §D: the three non-diegetic-guided verbs Mission 1's stage exercises. わたす is excluded
 *  — AD-07 gives it no SHOW/NUDGE/FADE curve ("always explicit... the instruction simply
 *  shortens"), and it's a single one-time full-screen curtain, not a repeated decision. */
export type StageVerb = 'yomu' | 'erabu' | 'mikiwameru';

/** Persisted on the active profile (`Profile.guidance`, src/engine/storage.ts) — how many times
 *  this profile has completed each verb, ever. A plain count, not itself a level: the level is
 *  always re-derived from it via `guidanceLevelFor`, so nothing here needs migrating if AD-07's
 *  own thresholds ever change. */
export type GuidanceUses = Partial<Record<StageVerb, number>>;

/** AD-07 §D's own advancement table — SHOW ends at the Nth use, NUDGE at the Mth, FADE at the
 *  Pth, INDEPENDENT after. [N, M, P] per verb. */
const THRESHOLDS: Record<StageVerb, readonly [number, number, number]> = {
  yomu: [1, 3, 6],
  erabu: [1, 3, 5],
  mikiwameru: [1, 2, 4],
};

/** Derives the current guidance level for one verb from this profile's own use count — never
 *  steps back down except via the temporary stall bump `useStall` reports separately. */
export function guidanceLevelFor(verb: StageVerb, uses: GuidanceUses): GuidanceLevel {
  const n = uses[verb] ?? 0;
  const [nudgeAt, fadeAt, independentAt] = THRESHOLDS[verb];
  if (n < nudgeAt) return 'show';
  if (n < fadeAt) return 'nudge';
  if (n < independentAt) return 'fade';
  return 'independent';
}

/**
 * AD-07 §10: after `delayMs` of inactivity on the CURRENT beat, report a stall once. `resetKey`
 * changes whenever the child does something relevant to this beat — that's what re-arms the
 * timer for the next beat, without this hook needing to know anything about verbs or beats.
 */
export function useStall(active: boolean, resetKey: unknown, delayMs: number): boolean {
  const [stalled, setStalled] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStalled(false);
    if (timer.current) clearTimeout(timer.current);
    if (!active) return;
    timer.current = setTimeout(() => setStalled(true), delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, resetKey, delayMs]);

  return stalled;
}

