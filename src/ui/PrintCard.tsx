import { Ruby } from '../engine/ruby';
import { CARD_KIND_META, type CardKind } from './cardKinds';
import './print-card.css';

/**
 * WO-23 WP-2 (AD-06 RC-3): the PHYSICAL artifact — real 63x88mm geometry, print-specific layout,
 * never interactive. Split out of the old shared `Card` component, which let this exact physical
 * sizing leak into on-screen digital rendering (the audit's "333px cards" finding). See
 * `QuestionChip.tsx` for the digital counterpart — the two share only `cardKinds.ts`'s identity
 * tokens (icon, corner shape), never dimensions.
 */
export interface PrintCardProps {
  kind: CardKind;
  /** Type label. Comes from module.json cardTypes — never hard-coded here (CI gate 3). */
  label?: string;
  /** Ruby markup allowed: {漢字|かんじ} */
  text: string;
}

export function PrintCard({ kind, label, text }: PrintCardProps) {
  const meta = CARD_KIND_META[kind];
  const cls = ['print-card', `print-card--${kind}`, `print-card--corner-${meta.corner}`].join(' ');
  return (
    <div className={cls}>
      <span className="print-card__icon" aria-hidden="true">{meta.icon}</span>
      {label && <span className="print-card__label">{label}</span>}
      <span className="print-card__text"><Ruby text={text} /></span>
    </div>
  );
}
