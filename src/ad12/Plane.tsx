import type { ReactNode } from 'react';
import './primitives.css';

export interface PlaneProps {
  children: ReactNode;
  className?: string;
  /** Applies `.ad12-accent-active` — reserve for the ONE element per screen carrying the active
   *  yellow (F7). Never set on more than one Plane at a time; see tests/ad12/yellowDiscipline. */
  accentActive?: boolean;
}

/** AD-12's one resting-object shape: paper, ink, one elevation step. Every state in src/ad12/
 *  that renders "a dominant reading object" (§1 confirmation #1) composes this rather than
 *  re-declaring its own paper surface. */
export function Plane({ children, className, accentActive }: PlaneProps) {
  const cls = ['ad12-plane', accentActive ? 'ad12-accent-active' : '', className ?? '']
    .filter(Boolean).join(' ');
  return <div className={cls}>{children}</div>;
}
