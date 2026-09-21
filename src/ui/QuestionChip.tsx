import { Ruby } from '../engine/ruby';
import { CARD_KIND_META, type CardKind } from './cardKinds';
import './question-chip.css';

/**
 * WO-23 WP-2 (AD-06 RC-3): the DIGITAL interaction component — a 64-80px tall, full-width tap
 * target, no mm dimensions, no print geometry. Split out of the old shared `Card` component,
 * which let the print deck's real 63x88mm sizing leak into on-screen rendering (the audit's
 * "333px cards" finding, and the direct cause of "CTA below fold"/"card overflow"). See
 * `PrintCard.tsx` for the physical counterpart — the two share only `cardKinds.ts`'s identity
 * tokens (icon, corner shape via a border accent), never dimensions.
 *
 * AD-06 D5/D7: designed for one-screen decision making — a horizontal tray item or a full-width
 * row, never a card the child has to scroll past to reach the primary action.
 */
export interface QuestionChipProps {
  kind: CardKind;
  /** Type label. Comes from module.json cardTypes — never hard-coded here (CI gate 3). */
  label?: string;
  /** Ruby markup allowed: {漢字|かんじ} */
  text: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function QuestionChip({ kind, label, text, selected, disabled, onClick }: QuestionChipProps) {
  const meta = CARD_KIND_META[kind];
  const cls = [
    'question-chip', `question-chip--${kind}`, `question-chip--corner-${meta.corner}`,
    selected ? 'is-selected' : '', disabled ? 'is-disabled' : '',
  ].filter(Boolean).join(' ');

  const body = (
    <>
      <span className="question-chip__icon" aria-hidden="true">{meta.icon}</span>
      {label && <span className="question-chip__label">{label}</span>}
      <span className="question-chip__text"><Ruby text={text} /></span>
    </>
  );

  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}
