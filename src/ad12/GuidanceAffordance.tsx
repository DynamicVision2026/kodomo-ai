import type { ReactNode } from 'react';
import type { GuidanceLevel } from '../stage/Guidance';
import './primitives.css';
import './guidance-affordance.css';

export interface GuidanceAffordanceProps {
  /** Reused from src/stage/Guidance.tsx's own `guidanceLevelFor` — this component never derives
   *  a level itself, it only renders whichever one the caller already computed from the real
   *  profile's own per-verb use count. */
  level: GuidanceLevel;
  children: ReactNode;
}

/**
 * AD-12 F1/F2: the ENTIRE wrapped area is the cue target — the judgment bar as a whole, the
 * slip area as a whole, or the tray as a whole (§1 confirmation #2, F1). There is no prop here
 * that could single out one slip or one move card: whatever `children` this wraps gets the same
 * one pulse treatment as a group, which is what makes "never an answer key" structurally true
 * rather than a convention someone could violate by passing the wrong id. FADE renders nothing
 * (matches src/stage/Guidance.tsx's own GuidancePulse: independent/fade-complete = no affordance
 * at all, never a lingering hint once a verb is fluent).
 */
export function GuidanceAffordance({ level, children }: GuidanceAffordanceProps) {
  if (level === 'independent') return <>{children}</>;
  return (
    <div className={`ad12-guidance ad12-guidance--${level}`} aria-hidden={false}>
      {children}
    </div>
  );
}
