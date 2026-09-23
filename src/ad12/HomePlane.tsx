import { Ruby } from '../engine/ruby';
import { DepthRow } from './DepthRow';
import './primitives.css';
import './home-plane.css';

export interface HomePlaneProps {
  title: string;
  /** Matches `progress[id].done` (src/engine/storage.ts) — a plain completion marker, never a
   *  score. */
  done: boolean;
  /** Only rendered when `done` — F9: "A completed lesson shows its row of depth tabs — no
   *  numbers or stars." */
  depthTotal?: number;
  onSelect?: () => void;
  /** Real-coverage addition (WO-26's own CURRENT state, not one of AD-12 §4's 12 sample states):
   *  the ONE depth Course Home is inviting the child to play next. F7's one active yellow per
   *  screen holds structurally here — Course Home only ever marks a single depth `current` at a
   *  time, so this plane's own accent can never collide with a `done` row's own (deliberately
   *  muted, `otherYellowActive`) root tab elsewhere on the same shaft. */
  current?: boolean;
  /** Real-coverage addition: a depth ahead of current, not yet reachable (WO-26 §7's own LOCKED
   *  state — "shown dimmed, never hidden, never a dead end"; still tappable, so still shows its
   *  own real cursor, just visually quieter). */
  locked?: boolean;
}

/** AD-12 §4 state 11 (Home): "each lesson is a white plane" (F9). No numbers, no stars — the
 *  only completion signal is the depth-tab row itself, reused unchanged from the dig stage. */
export function HomePlane({ title, done, depthTotal, onSelect, current, locked }: HomePlaneProps) {
  const cls = [
    'ad12-home-plane', 'ad12-tappable',
    current ? 'ad12-accent-active' : '',
    locked ? 'ad12-home-plane--locked' : '',
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onSelect}>
      <span className="ad12-reading-text ad12-home-plane__title"><Ruby text={title} /></span>
      {done && depthTotal ? (
        // F7 (≤1 active yellow per screen): Home can show several completed lessons at once —
        // if every one of their root tabs used the active accent, a course with 3+ completed
        // lessons would put 3+ yellows on screen at the same time. `otherYellowActive` mutes
        // every one of them here; Home never lets a root tab be the screen's own one yellow.
        <DepthRow total={depthTotal} current={depthTotal} rootReached otherYellowActive />
      ) : null}
    </button>
  );
}
