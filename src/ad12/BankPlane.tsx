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
  /** Real-coverage addition: `progress[id].done` (src/engine/storage.ts) — a plain completion
   *  marker for an available item, same "no score, just done or not" discipline as HomePlane's
   *  own `done`. */
  done?: boolean;
  /** The label shown next to a done item (`ui.bankDoneLabel`) — threaded through rather than
   *  hard-coded here, same as every other AD-12 component's own copy discipline. */
  doneLabel?: string;
}

export interface BankPlaneProps {
  /** True until Story 1-4 is complete — the section-visibility floor every Bank Dig sits behind
   *  (F9: "one plane with a closed lid until 1-4 is complete"). */
  sectionLocked: boolean;
  items: BankItem[];
  onSelect?: (id: string) => void;
  /** Real-coverage addition: WO-26 §7's own real requirement — "tapping a LOCKED item shows a
   *  short diegetic explanation instead of entering," which means a locked item must still be
   *  genuinely tappable, just not enterable. Native `disabled` (this component's own Pass 1
   *  default, still correct for a Bank Dig that's simply not unlocked yet with nothing more to
   *  say about it) would make that impossible — a disabled button never dispatches a click at
   *  all. Opting in here changes ONLY whether the click still fires for an unavailable item;
   *  the dimmed `.is-unavailable` visual treatment itself (F9: "rendered-but-disabled, not
   *  hidden") is unchanged either way — `onSelect` deciding what an unavailable tap DOES (an
   *  explanation vs. nothing) is a correctness/instructional call for the caller to make, never
   *  this component's own. */
  tappableWhenUnavailable?: boolean;
  /** Real-coverage addition: WO-26 §7's own "a short diegetic explanation right where the tap
   *  happened" — an optional line of context rendered directly under ONE specific item (the one
   *  a caller just tapped), never detached from it at the bottom of the whole list. */
  noteForId?: string;
  note?: string;
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
export function BankPlane({ sectionLocked, items, onSelect, tappableWhenUnavailable, noteForId, note }: BankPlaneProps) {
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
        <div key={item.id} className="ad12-bank-plane__row">
          <button
            type="button"
            className={`ad12-bank-plane__item ad12-tappable ad12-ui-text${item.available ? '' : ' is-unavailable'}`}
            disabled={!item.available && !tappableWhenUnavailable}
            onClick={() => onSelect?.(item.id)}
          >
            <span className="ad12-bank-plane__title"><Ruby text={item.title} /></span>
            {item.done && item.doneLabel && (
              <span className="ad12-bank-plane__done">{item.doneLabel}</span>
            )}
          </button>
          {noteForId === item.id && note && (
            <p className="ad12-bank-plane__note"><Ruby text={note} /></p>
          )}
        </div>
      ))}
    </div>
  );
}
