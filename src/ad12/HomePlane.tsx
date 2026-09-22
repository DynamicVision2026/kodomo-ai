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
}

/** AD-12 §4 state 11 (Home): "each lesson is a white plane" (F9). No numbers, no stars — the
 *  only completion signal is the depth-tab row itself, reused unchanged from the dig stage. */
export function HomePlane({ title, done, depthTotal, onSelect }: HomePlaneProps) {
  return (
    <button type="button" className="ad12-home-plane ad12-tappable" onClick={onSelect}>
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
