import { MoveCard, type MoveCardVariant } from './MoveCard';
import { GuidanceAffordance } from './GuidanceAffordance';
import type { GuidanceLevel } from '../stage/Guidance';
import './primitives.css';
import './move-tray.css';

export interface TrayCard {
  id: string;
  text: string;
  /** Only used to pick which card renders which static variant for a screenshot fixture (e.g.
   *  "the pressed one"), or — for a live, engine-driven tray — to keep the caller as the sole
   *  authority over each card's own moment in the grammar (rest/pressed/magnified/committed)
   *  rather than letting the card manage that itself; never rendered as a colour/size difference
   *  tied to move/tag/domain. */
  variant?: MoveCardVariant;
  /** Real-coverage addition — see MoveCard.tsx's own `blocked`/`badge`. */
  blocked?: boolean;
  badge?: string;
}

export interface MoveTrayProps {
  cards: TrayCard[];
  guidanceLevel: GuidanceLevel;
  onCommit?: (id: string) => void;
  /** Builder work order §2: forwarded verbatim to every card in this tray — see MoveCard.tsx's
   *  own `live` doc comment. Opts the WHOLE tray into real pointer-driven commit grammar even
   *  though each card also carries a caller-driven `variant`. Omitted for every tray that isn't
   *  AD-12 §4's own "move card" grammar target (self-report/blind-commit/gap-naming stay on the
   *  original static-snapshot contract, unchanged). */
  live?: boolean;
}

/** AD-12 §4 state 3: "elastic sheet rises from beneath the answer" (§3 grammar) — Pass 1 renders
 *  its settled/risen resting shape only. The guidance cue (F1) wraps the tray AS A WHOLE, never
 *  one card. */
export function MoveTray({ cards, guidanceLevel, onCommit, live }: MoveTrayProps) {
  return (
    <GuidanceAffordance level={guidanceLevel}>
      <div className="ad12-move-tray">
        {cards.map((card) => (
          <MoveCard
            key={card.id}
            text={card.text}
            variant={card.variant}
            live={live}
            blocked={card.blocked}
            badge={card.badge}
            onCommit={() => onCommit?.(card.id)}
          />
        ))}
      </div>
    </GuidanceAffordance>
  );
}
