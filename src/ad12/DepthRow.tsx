import { useEffect, useRef } from 'react';
import { animate, tokenMs } from './motion';
import './primitives.css';
import './depth-row.css';

export interface DepthRowProps {
  /** Total tabs = layer count + 1 (root), matching `depth(digPhase, state)`. */
  total: number;
  /** 1-indexed current depth, matching `depth(digPhase, state).current`. */
  current: number;
  /** The root tab is the one place this row ever uses the accent yellow (a reached root is the
   *  child's own achievement). F7: it must drop to a muted tone whenever ANOTHER yellow is
   *  active elsewhere on screen — e.g. a guidance cue or a just-committed move card — so the
   *  caller passes that down rather than this row deciding it in isolation. */
  rootReached: boolean;
  otherYellowActive?: boolean;
}

/** AD-12 §4 state 6/11: the depth tabs — one filled per breakthrough, the root tab gold only
 *  when actually reached, and only when it's the SCREEN's one active yellow (F7). The tab that
 *  just filled (Breakthrough, §3: "one step deeper, Progress Fill") gets a small WAAPI pop on
 *  top of the CSS colour transition every tab already has, so the child's own most recent step
 *  reads as the one that just happened, not just one more already-filled dot. */
export function DepthRow({ total, current, rootReached, otherYellowActive }: DepthRowProps) {
  const refs = useRef<Array<HTMLSpanElement | null>>([]);
  const prevCurrent = useRef(current);

  useEffect(() => {
    if (current > prevCurrent.current) {
      const el = refs.current[current - 1];
      if (el) {
        animate(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(1)' }], {
          duration: tokenMs('--ad12-t-settle', 450, el),
        });
      }
    }
    prevCurrent.current = current;
  }, [current]);

  return (
    <div className="ad12-depth-row" role="img" aria-label={`${current} / ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((tab) => {
        const isRootTab = tab === total;
        const filled = tab <= current;
        const cls = [
          'ad12-depth-row__tab',
          filled ? 'is-filled' : '',
          isRootTab && rootReached ? (otherYellowActive ? 'is-root-muted' : 'is-root-active') : '',
        ].filter(Boolean).join(' ');
        return (
          <span
            key={tab}
            ref={(el) => {
              refs.current[tab - 1] = el;
            }}
            data-tab-index={tab}
            className={cls}
          />
        );
      })}
    </div>
  );
}
