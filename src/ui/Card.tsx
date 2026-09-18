import { Ruby } from '../engine/ruby';
import './card.css';

/**
 * ONE card component for the app and the printable deck (spec v0.5 §7, §8).
 * Type is carried by colour + icon + corner shape so the deck survives black-and-white printing
 * and colour-blind players.
 */
export type CardKind =
  | 'odai' | 'what' | 'why' | 'who' | 'format'
  | 'follow-naze' | 'follow-tatoeba' | 'follow-tsumari' | 'follow-hokaniwa'
  | 'himitsu' | 'reaction' | 'rules' | 'blank' | 'dig';

const META: Record<CardKind, { icon: string; corner: 'round' | 'cut' | 'notch' | 'square' }> = {
  odai:              { icon: '\u25C6', corner: 'square' },
  what:              { icon: '\u25CF', corner: 'round'  },
  why:               { icon: '\u25B2', corner: 'round'  },
  who:               { icon: '\u25A0', corner: 'round'  },
  format:            { icon: '\u2605', corner: 'round'  },
  'follow-naze':     { icon: '\u2193', corner: 'cut'    },
  'follow-tatoeba':  { icon: '\u2193', corner: 'cut'    },
  'follow-tsumari':  { icon: '\u2193', corner: 'cut'    },
  'follow-hokaniwa': { icon: '\u2193', corner: 'cut'    },
  himitsu:           { icon: '\u2715', corner: 'notch'  },
  reaction:          { icon: '\uFF01', corner: 'notch'  },
  rules:             { icon: '\u2630', corner: 'square' },
  blank:             { icon: '\uFF0B', corner: 'square' },
  // Dig-phase hand cards: deliberately UNDIFFERENTIATED. The dig tag (deepen/sideways/
  // repeat/offtopic) that a card carries must never be visible to the player \u2014 that would
  // let them learn "always pick the star" instead of thinking. Spec v0.5 pillar 1.
  dig:               { icon: '\u2022', corner: 'round'  },
};

export interface CardProps {
  kind: CardKind;
  /** Type label. Comes from module.json cardTypes — never hard-coded here (CI gate 3). */
  label?: string;
  /** Ruby markup allowed: {漢字|かんじ} */
  text: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Print mode removes interaction and fixes physical dimensions. */
  print?: boolean;
}

export function Card({ kind, label, text, selected, disabled, onClick, print }: CardProps) {
  const meta = META[kind];
  const cls = [
    'card', `card--${kind}`, `card--corner-${meta.corner}`,
    selected ? 'is-selected' : '', disabled ? 'is-disabled' : '', print ? 'card--print' : '',
  ].filter(Boolean).join(' ');

  const body = (
    <>
      <span className="card__icon" aria-hidden="true">{meta.icon}</span>
      {label && <span className="card__label">{label}</span>}
      <span className="card__text"><Ruby text={text} /></span>
    </>
  );

  if (print || !onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}
