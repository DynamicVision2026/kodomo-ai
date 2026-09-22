import { MoveCard, type MoveCardVariant } from './MoveCard';
import { GuidanceAffordance } from './GuidanceAffordance';
import type { GuidanceLevel } from '../stage/Guidance';
import './primitives.css';
import './move-tray.css';

export interface TrayCard {
  id: string;
  text: string;
  /** Only used to pick which card renders which static variant for a screenshot fixture (e.g.
   *  "the pressed one") — never rendered as a colour/size difference tied to move/tag/domain. */
  variant?: MoveCardVariant;
}

export interface MoveTrayProps {
  cards: TrayCard[];
  guidanceLevel: GuidanceLevel;
  onCommit?: (id: string) => void;
}

/** AD-12 §4 state 3: "elastic sheet rises from beneath the answer" (§3 grammar) — Pass 1 renders
 *  its settled/risen resting shape only. The guidance cue (F1) wraps the tray AS A WHOLE, never
 *  one card. */
export function MoveTray({ cards, guidanceLevel, onCommit }: MoveTrayProps) {
  return (
    <GuidanceAffordance level={guidanceLevel}>
      <div className="ad12-move-tray">
        {cards.map((card) => (
          <MoveCard
            key={card.id}
            text={card.text}
            variant={card.variant}
            onCommit={() => onCommit?.(card.id)}
          />
        ))}
      </div>
    </GuidanceAffordance>
  );
}
