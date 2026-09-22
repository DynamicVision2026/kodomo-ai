import { useEffect, useRef } from 'react';
import { Ruby } from '../engine/ruby';
import { animate, tokenMs } from './motion';
import './primitives.css';
import './slip-cascade.css';

export interface Slip {
  id: string;
  text: string;
}

export interface SlipCascadeProps {
  /** Already shuffled by the engine (`buildGapChoices`, src/engine/digMachine.ts) — this
   *  component renders them in the order given, never reorders or ranks them. Deliberately
   *  typed WITHOUT the engine's own `kind: 'target' | 'answered' | 'other-layer'` field: this
   *  component has no way to single out the target slip even by accident, because it never
   *  receives which one it is (F1 — guidance must never reveal the correct slip). */
  slips: [Slip, Slip, Slip];
  onChoose?: (id: string) => void;
  selectedId?: string | null;
}

/**
 * AD-12 §4 state 2: the lid open, slip cascade already settled. F3: "once settled, all three
 * slips have equal weight and opacity" — same width, same elevation, same type size, for
 * every slip, regardless of position. Rendered inside the recess tone (a darker paper-on-field
 * step, not the main answer plane) per §3's "Name the gap | slips | ... into the recess".
 *
 * Pass 2: the three slips settle in with a staggered entrance (§3 "cascade") on mount/whenever
 * the gap changes — WAAPI so each slip's start delay is a real per-index --ad12-t-stagger step,
 * not three separate CSS animation-delay rules. F3's "magnify happens only after the child's tap,
 * it is never a resting state" plays as a brief lift on the tapped slip before `onChoose` fires —
 * purely visual feedback layered over whatever the caller does next, never a gate on it.
 */
export function SlipCascade({ slips, onChoose, selectedId }: SlipCascadeProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const ids = slips.map((s) => s.id).join('|');

  useEffect(() => {
    const stagger = tokenMs('--ad12-t-stagger', 70, refs.current[0] ?? undefined);
    const settle = tokenMs('--ad12-t-settle', 450, refs.current[0] ?? undefined);
    refs.current.forEach((el, i) => {
      if (!el) return;
      animate(
        el,
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: settle, delay: i * stagger },
      );
    });
    // Replays only when the actual set of slips changes (a new gap), not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  function handleChoose(id: string, el: HTMLButtonElement | null) {
    if (el) {
      animate(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }], {
        duration: tokenMs('--ad12-t-press', 90, el),
      });
    }
    onChoose?.(id);
  }

  return (
    <div className="ad12-recess" role="group">
      {slips.map((slip, i) => (
        <button
          key={slip.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className={`ad12-slip ad12-tappable ad12-reading-text${selectedId === slip.id ? ' is-chosen' : ''}`}
          onClick={(e) => handleChoose(slip.id, e.currentTarget)}
        >
          <Ruby text={slip.text} />
        </button>
      ))}
    </div>
  );
}
