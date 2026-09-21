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
  /** AD-07 §5: a card that just resolved non-deepen plays its settle animation here, then
   *  disappears from the tray on the caller's own next render — never a red X, never removed
   *  mid-animation (which would cut the feedback off). */
  settlingId?: string | null;
  /** AD-07 §B/F: "the question is the shovel" — the just-tapped deepen card drives down into
   *  the soil before the world itself descends a layer. */
  drivingId?: string | null;
}

/**
 * WO-24 (AD-07 §4B えらぶ/Choose): a tray that rises from the bottom with 2-4 choices — the
 * child taps one directly, no separate confirm button anywhere. Reused for every "choose"
 * moment in Mission 1's stage: the initial question pick, Gap Naming, the dig hand, and
 * Blind-first's single-button commit tray.
 */
export function ChoiceTray({ items, onSelect, settlingId, drivingId }: ChoiceTrayProps) {
  return (
    <div className="choice-tray stage__beat-enter">
      {items.map((item) => (
        <QuestionChip
          key={item.id}
          kind={item.kind ?? 'dig'}
          text={item.text}
          disabled={settlingId === item.id || drivingId === item.id}
          className={
            settlingId === item.id ? 'is-settling' : drivingId === item.id ? 'is-driving' : undefined
          }
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}
