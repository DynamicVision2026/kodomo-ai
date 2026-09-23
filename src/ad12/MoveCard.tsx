import { useRef, useState } from 'react';
import { Ruby } from '../engine/ruby';
import { animate, tokenMs } from './motion';
import './primitives.css';
import './move-card.css';

export type MoveCardVariant = 'rest' | 'pressed' | 'magnified' | 'committed';

export interface MoveCardProps {
  /** Deliberately the only content prop: no `move`/`domain`/`tag` — a move card's colour/size
   *  at rest must never hint which one is `deepen` (equal choices stay visually equal, §1
   *  confirmation #4 / F3). Move/domain/tag remain engine-only, read by MissionShell for
   *  evidence, never surfaced as a visual cue here. */
  text: string;
  /** Omitted (the normal, interactive case): the card drives itself through the grammar from
   *  real pointer events. Passed explicitly: a fully static snapshot for a Pass 1 screenshot
   *  fixture — pointer events are ignored and `onCommit` fires straight from the click, same as
   *  before Pass 2. The two modes never mix for one card. */
  variant?: MoveCardVariant;
  onCommit?: () => void;
  /** Real-coverage addition (not one of AD-12 §4's 12 sample states, but a real requirement the
   *  live dig hand has): a card that already resolved non-deepen this layer — kept visible
   *  (never removed, F9's own "still occupies its place" discipline applied here too), disabled,
   *  and dimmed via the SAME opacity treatment BankPlane already uses for an unavailable item
   *  (`.is-unavailable`) rather than inventing a new token. Independent of `variant`: a blocked
   *  card is always shown at rest, dimmed. */
  blocked?: boolean;
  /** A small decorative glyph marking a blocked card — mirrors QuestionChip's own pre-AD-12
   *  badge convention (never child-facing text, so it's exempt from the copy gate). */
  badge?: string;
}

/**
 * AD-12 §4 states 3-4. F4 commit semantics: pressing down only compresses the card; releasing
 * INSIDE commits (fires once); sliding off cancels and records nothing.
 *
 * Uncontrolled (no `variant`), this now drives that sequence from real pointer events: pointerdown
 * compresses (rest -> pressed, plain CSS transition on --ad12-t-press — fast tap feedback);
 * a genuine DOM `click` only ever fires when the pointer released INSIDE the element (the
 * platform's own "slide off cancels" rule, not reimplemented here), so `onClick` alone is already
 * the correct, single commit signal. `committedRef` additionally makes a second click on an
 * already-committed card a no-op — belt-and-braces for "the event fires exactly once". The final
 * magnified -> committed settle plays over the slower --ad12-t-settle via the Web Animations API
 * (`animate`, motion.ts) rather than the CSS transition alone, because the two beats — the quick
 * press and the slower settle — need different durations off one `transform` property; WAAPI is
 * the tool for that, and it already resolves to a short reduced-motion crossfade automatically.
 */
export function MoveCard({ text, variant, onCommit, blocked, badge }: MoveCardProps) {
  const [phase, setPhase] = useState<MoveCardVariant>('rest');
  const committedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controlled = variant !== undefined;
  const effective = blocked ? 'rest' : controlled ? variant : phase;

  function handlePointerDown() {
    if (controlled || committedRef.current) return;
    setPhase('pressed');
  }

  function handlePointerLeave() {
    if (controlled || committedRef.current) return;
    setPhase('rest');
  }

  function handleClick() {
    if (controlled) {
      onCommit?.();
      return;
    }
    if (committedRef.current) return; // F4: the commit event fires exactly once.
    committedRef.current = true;
    setPhase('magnified');
    const el = buttonRef.current;
    const settle = () => setPhase('committed');
    const anim = el
      ? animate(el, [{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], {
          duration: tokenMs('--ad12-t-settle', 450, el),
        })
      : undefined;
    if (anim) anim.finished.then(settle).catch(settle);
    else settle();
    onCommit?.();
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={blocked}
      className={`ad12-move-card ad12-tappable ad12-reading-text ad12-move-card--${effective}${blocked ? ' ad12-move-card--blocked' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      onClick={handleClick}
    >
      <span className="ad12-move-card__text"><Ruby text={text} /></span>
      {badge && <span className="ad12-move-card__badge" aria-hidden="true">{badge}</span>}
    </button>
  );
}
