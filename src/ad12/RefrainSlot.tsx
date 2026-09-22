import { Ruby } from '../engine/ruby';
import './primitives.css';
import './refrain-slot.css';

export interface RefrainSlotProps {
  /** Present once the child (R2) or ポン太 (R3) has spoken this slot; absent while the slot is
   *  still an empty, waiting placeholder (§3 "Audio recalls an answer | tab ⇄ plane | ... the
   *  empty slot stays visible"). */
  text?: string;
}

/**
 * AD-12 F6: "The refrain slots look tappable, but this is a speaking turn." Non-interactive by
 * construction — no `onClick`/navigation prop exists on this component at all, so there is no
 * way for a caller to accidentally wire one up. A tap only presses (Pass 2); it can never
 * navigate. R1 lessons show no slots (the caller simply never renders this component for R1).
 */
export function RefrainSlot({ text }: RefrainSlotProps) {
  return (
    <div className={`ad12-refrain-slot ad12-tappable${text ? ' is-filled' : ' is-empty'}`} aria-hidden="true">
      {text ? <span className="ad12-reading-text"><Ruby text={text} /></span> : null}
    </div>
  );
}
