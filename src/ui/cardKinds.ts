/**
 * WO-23 WP-2 (AD-06 D5/RC-3): the identity tokens shared between the digital `QuestionChip` and
 * the physical `PrintCard` — kind, icon glyph, corner shape. Never dimensions: that's exactly
 * the thing AD-06 says a shared component must not carry across from print into digital layout
 * again. Both components import this same mapping so a move/card kind reads as the same visual
 * identity everywhere, without either one owning the other's geometry.
 */
export type CardKind =
  | 'odai' | 'what' | 'why' | 'who' | 'format'
  | 'follow-naze' | 'follow-tatoeba' | 'follow-tsumari' | 'follow-hokaniwa'
  | 'himitsu' | 'reaction' | 'rules' | 'blank' | 'dig'
  // 'check': src/modules/m2-test (spec v0.5 §13 acceptance criterion — a new card type + a
  // dummy s3.json must render without touching /engine). Only this file (+ its two consuming
  // components) changes; the engine never needed to know this kind exists.
  | 'check';

export const CARD_KIND_META: Record<CardKind, { icon: string; corner: 'round' | 'cut' | 'notch' | 'square' }> = {
  odai:              { icon: '◆', corner: 'square' },
  what:              { icon: '●', corner: 'round'  },
  why:               { icon: '▲', corner: 'round'  },
  who:               { icon: '■', corner: 'round'  },
  format:            { icon: '★', corner: 'round'  },
  'follow-naze':     { icon: '↓', corner: 'cut'    },
  'follow-tatoeba':  { icon: '↓', corner: 'cut'    },
  'follow-tsumari':  { icon: '↓', corner: 'cut'    },
  'follow-hokaniwa': { icon: '↓', corner: 'cut'    },
  himitsu:           { icon: '✕', corner: 'notch'  },
  reaction:          { icon: '！', corner: 'notch'  },
  rules:             { icon: '☰', corner: 'square' },
  blank:             { icon: '＋', corner: 'square' },
  // Dig-phase hand cards: deliberately UNDIFFERENTIATED. The dig tag (deepen/sideways/
  // repeat/offtopic) that a card carries must never be visible to the player — that would let
  // them learn "always pick the star" instead of thinking. Spec v0.5 pillar 1.
  dig:               { icon: '•', corner: 'round'  },
  check:             { icon: '✓', corner: 'round'  },
};
