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
   *  real pointer events. Passed explicitly WITHOUT `live`: a fully static snapshot for a Pass 1
   *  screenshot fixture — pointer events are ignored and `onCommit` fires straight from the
   *  click, same as before Pass 2. Passed explicitly WITH `live: true`: see `live` below. */
  variant?: MoveCardVariant;
  /** Builder work order §2: opts a caller-choreographed card (one that also supplies `variant`)
   *  into the SAME real pointer-driven commit grammar an uncontrolled card already has — genuine
   *  pointerdown press-scale, pointerup-inside commits exactly once, pointerleave/pointercancel
   *  cancels with nothing recorded. `variant` still governs the visual once that one guaranteed
   *  commit has fired (e.g. MissionStage's own post-commit "drive to soil then settle" beats) —
   *  the two concerns are independent. Omitted (the default): `variant`, when supplied, keeps its
   *  original, unrelated meaning — a fully static snapshot; pointer events are ignored and a
   *  click forwards straight to `onCommit` every time, unchanged, for every caller that predates
   *  this flag (Pass 1 gallery fixtures, the self-report/blind-commit/gap-naming single-choice
   *  trays, none of which are AD-12 §4's own "move card" grammar target). */
  live?: boolean;
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
 * AD-12 §4 states 3-4 + Builder work order §2 (AD-12 completion, live wiring). F4/§2 commit
 * semantics apply whenever the card is NOT a bare static snapshot — i.e. either fully
 * uncontrolled (`variant` omitted) or `live` (`variant` supplied for post-commit choreography,
 * but real pointer grammar still drives the commit itself):
 *  - `pointerdown` on the card -> press-scale only (`localPressed`, below). Nothing is recorded.
 *  - a genuine DOM `click` only ever fires when the pointer released INSIDE the element (the
 *    platform's own "slide off cancels" rule, not reimplemented here) — so it is already the
 *    correct "pointerup inside the same card" commit signal, firing the move event exactly once
 *    per gesture, guarded by `committedRef` (§2: "the move event fires exactly once, then the
 *    magnify animation runs" — the magnify itself may still be a caller-driven `variant`, e.g.
 *    MissionStage's own post-commit "drive to soil" choreography; only the ONE guaranteed-
 *    exactly-once event is this component's own job here).
 *  - `pointerleave`/`pointercancel` before release cancels (`localPressed` clears) — nothing
 *    recorded, matching native `click`'s own "released outside never fires click" behavior.
 *  - Enter/Space: a native `<button>` already dispatches `click` on either, so keyboard commits
 *    through the exact same guarded path — no separate keyboard handler needed.
 *
 * For a `live` card, `variant` (e.g. MissionStage's own `drivingCardId`/`impactingId` post-commit
 * "drive to soil then settle" beats) governs the visual ONLY after this component's own real-time
 * `localPressed` (finger/pointer genuinely down, pre-commit) releases — it was never a substitute
 * for genuine pointer-driven press feedback, only for what happens once a commit has already,
 * unconditionally, fired. `variant === undefined` (Pass 1 fixtures, self-driving trays like the
 * Gap/self-report/blind-commit ones) keeps the ORIGINAL fully self-managed magnified -> committed
 * settle, played over the slower --ad12-t-settle via the Web Animations API (`animate`, motion.ts)
 * — the quick press and the slower settle need different durations off one `transform` property,
 * and WAAPI already resolves to a short reduced-motion crossfade automatically. `variant` supplied
 * WITHOUT `live` keeps the ORIGINAL static-snapshot contract exactly as it always was (see
 * `staticSnapshot`, below) — untouched by any of the above.
 */
export function MoveCard({ text, variant, live, onCommit, blocked, badge }: MoveCardProps) {
  const [phase, setPhase] = useState<MoveCardVariant>('rest');
  /** Real-time press feedback for `live` cards, independent of `variant` — pointer/keyboard-
   *  driven, never parent-controlled, so a caller supplying `variant` for its OWN post-commit
   *  choreography can never suppress the live pre-commit press-scale §2 requires. Unused (stays
   *  false) for the original static-snapshot contract (`variant` without `live`). */
  const [localPressed, setLocalPressed] = useState(false);
  const committedRef = useRef(false);
  const pressedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controlled = variant !== undefined;
  /** The ORIGINAL contract, unchanged: `variant` alone (no `live`) is a fully static snapshot —
   *  pointer events are ignored and a click forwards straight to `onCommit`, every time. */
  const staticSnapshot = controlled && !live;
  const effective = blocked
    ? 'rest'
    : !staticSnapshot && localPressed && !committedRef.current
      ? 'pressed'
      : controlled
        ? variant
        : phase;

  function handlePointerDown() {
    if (staticSnapshot || blocked || committedRef.current) return;
    pressedRef.current = true;
    setLocalPressed(true);
  }

  function handlePointerLeave() {
    if (staticSnapshot || !pressedRef.current) return;
    pressedRef.current = false;
    setLocalPressed(false); // cancel: springs back, nothing recorded.
    if (!controlled) setPhase('rest');
  }

  function handleClick() {
    if (staticSnapshot) {
      // Unchanged: static-snapshot callers (Pass 1 fixtures aside) forward every click straight
      // through — never AD-12 §4's own "move card" grammar target, so never guarded here.
      onCommit?.();
      return;
    }
    pressedRef.current = false;
    setLocalPressed(false);
    if (committedRef.current) return; // §2/F4: the commit event fires exactly once.
    committedRef.current = true;
    if (controlled) {
      onCommit?.(); // `live`: variant (caller-driven) takes over the post-commit visual.
      return;
    }
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
