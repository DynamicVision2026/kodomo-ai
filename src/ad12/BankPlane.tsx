import { useEffect, useRef } from 'react';
import { Ruby } from '../engine/ruby';
import { animate, tokenMs } from './motion';
import './primitives.css';
import './bank-plane.css';

export interface BankItem {
  id: string;
  title: string;
  /** False until its own real prerequisite resolves (Story 1-4 floor, then each dig's own
   *  rootType/move gate — src/shell/progression.ts's `bankState`, unchanged by this ticket). */
  available: boolean;
}

export interface BankPlaneProps {
  /** True until Story 1-4 is complete — the section-visibility floor every Bank Dig sits behind
   *  (F9: "one plane with a closed lid until 1-4 is complete"). */
  sectionLocked: boolean;
  items: BankItem[];
  onSelect?: (id: string) => void;
}

/** AD-12 §4 state 11 (Bank): closed lid until Story 1-4, opening once it's done; the わかれ digs
 *  simply render `available: false` until their own Story 1-5 prerequisite resolves — F9's own
 *  "stagger" is Pass 2's arrival animation, not a resting-state difference (an unavailable item
 *  still occupies its place, it isn't hidden/reflowed).
 *
 * Pass 2: when `sectionLocked` flips true -> false, the now-open plane fades/slides up into view
 * (WAAPI, no 3D lid-lift — §3's own "Rejected" list rules that out) rather than the CSS-only
 * class swap Pass 1 left it as. Hooks stay unconditional above the locked/unlocked branch so the
 * same component instance can track "was this locked a moment ago" across the two shapes.
 */
export function BankPlane({ sectionLocked, items, onSelect }: BankPlaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wasLockedRef = useRef(sectionLocked);

  useEffect(() => {
    const el = containerRef.current;
    if (wasLockedRef.current && !sectionLocked && el) {
      animate(
        el,
        [
          { opacity: 0, transform: 'translateY(-8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: tokenMs('--ad12-t-settle', 450, el) },
      );
    }
    wasLockedRef.current = sectionLocked;
  }, [sectionLocked]);

  if (sectionLocked) {
    return (
      <div className="ad12-bank-plane ad12-bank-plane--locked" aria-hidden={false}>
        <span className="ad12-bank-plane__lid" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div ref={containerRef} className="ad12-bank-plane">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`ad12-bank-plane__item ad12-tappable ad12-ui-text${item.available ? '' : ' is-unavailable'}`}
          disabled={!item.available}
          onClick={() => onSelect?.(item.id)}
        >
          <Ruby text={item.title} />
        </button>
      ))}
    </div>
  );
}
