import { useEffect, useRef, useState } from 'react';
import './guidance.css';

/** AD-07 §9: SHOW -> NUDGE -> FADE -> INDEPENDENT, per verb. Session-local for this prototype —
 *  not yet written into the profile's own storage (see docs/family-test-mode.md-style note in
 *  MissionStage's own header comment; reported as a deviation, not silently dropped). */
export type GuidanceLevel = 'show' | 'nudge' | 'fade' | 'independent';

const LEVELS: GuidanceLevel[] = ['show', 'nudge', 'fade', 'independent'];

/** One successful, unprompted use of a verb steps its guidance down one level, permanently for
 *  this session (never back up — AD-07 never describes guidance re-escalating on its own,
 *  only the stall bump below, which is temporary). */
export function useGuidanceLevel(uses: number): GuidanceLevel {
  const idx = Math.min(uses, LEVELS.length - 1);
  return LEVELS[idx]!;
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

export interface GuidancePulseProps {
  level: GuidanceLevel;
}

/**
 * WO-24 (AD-07 §9): the overlay guidance affordance. Points at the TRAY AREA this wraps —
 * never at a specific chip, never at one of JUDGE's two answers — and fades with `level`. At
 * 'fade' it's barely visible; at 'independent' it renders nothing at all. Diegetic guidance
 * (Mascot state, Pon太's stall line) lives directly in MissionStage instead — this component is
 * the overlay layer only.
 */
export function GuidancePulse({ level }: GuidancePulseProps) {
  if (level === 'independent') return null;
  return <div className={`guidance-pulse guidance-pulse--${level}`} aria-hidden="true" />;
}
