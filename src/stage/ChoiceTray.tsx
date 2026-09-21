import { QuestionChip } from '../ui/QuestionChip';
import type { CardKind } from '../ui/cardKinds';
import './choice-tray.css';

export interface ChoiceTrayItem {
  id: string;
  text: string;
  kind?: CardKind;
}

export interface ChoiceTrayProps {
  items: ChoiceTrayItem[];
  onSelect: (id: string) => void;
  /** AD-07 §5/WO-25 #4: a card that just resolved non-deepen plays its settle/impact animation
   *  here, right before it becomes permanently `blocked` — never removed from the tray (WO-25's
   *  own "used QuestionChip settles at/near the stone as already tried" — a persistent marker,
   *  not a disappearance). */
  settlingId?: string | null;
  /** WO-24/25 §B/F: "the question is the shovel" — the just-tapped card drives toward the soil
   *  before the world (deepen) or a stone (non-deepen) responds. */
  drivingId?: string | null;
  /** WO-25 #4: cards that have already hit a stone this layer — kept visible, disabled, badged,
   *  never removed from the array (fixes the earlier bug where a settled card was filtered out
   *  of `items` before its own settle animation ever had a chance to render). */
  blockedIds?: ReadonlySet<string>;
}

/**
 * WO-24 (AD-07 §4B えらぶ/Choose): a tray that rises from the bottom with 2-4 choices — the
 * child taps one directly, no separate confirm button anywhere. Reused for every "choose"
 * moment in Mission 1's stage: the initial question pick, Gap Naming, the dig hand, and
 * Blind-first's single-button commit tray.
 */
export function ChoiceTray({ items, onSelect, settlingId, drivingId, blockedIds }: ChoiceTrayProps) {
  return (
    <div className="choice-tray stage__beat-enter">
      {items.map((item) => {
        const blocked = blockedIds?.has(item.id) ?? false;
        const settling = settlingId === item.id;
        const driving = drivingId === item.id;
        return (
          <QuestionChip
            key={item.id}
            kind={item.kind ?? 'dig'}
            text={item.text}
            disabled={blocked || settling || driving}
            badge={blocked ? '🪨' : undefined}
            className={
              settling ? 'is-settling' : driving ? 'is-driving' : blocked ? 'is-blocked' : undefined
            }
            onClick={() => onSelect(item.id)}
          />
        );
      })}
    </div>
  );
}
