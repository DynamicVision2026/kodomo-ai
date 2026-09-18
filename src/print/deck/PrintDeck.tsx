import { Card, type CardKind } from '../../ui/Card';
import './print-deck.css';

const CARDS_PER_SHEET = 9;

/** Exported for tests — pure, no rendering. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface DeckFile {
  stage: number;
  cards: { id: string; kind: string; text: string }[];
}

export interface PrintDeckProps {
  deck: DeckFile;
  cardTypes: Record<string, { label: string }>;
}

/**
 * Printable card deck. Spec v0.5 §8: poker size, 9 per A4 sheet, cut lines, legible in
 * black and white (Card.tsx already carries colour + icon + corner shape per type, so
 * nothing here needs to reason about colour at all). Takes its deck + card-type labels as
 * props (Sprint 1-A §2.5) rather than importing one stage's deck.s2.json directly — a new
 * stage's printable deck is a thin entry point (deck.sN.json + a module.json) passing this
 * same component new props, not a copy of the rendering logic.
 */
export function PrintDeck({ deck, cardTypes }: PrintDeckProps) {
  const sheets = chunk(deck.cards, CARDS_PER_SHEET);

  return (
    <div className="print-deck">
      {sheets.map((sheet, i) => (
        <div key={i} className="print-deck__sheet">
          {sheet.map((c) => (
            <Card
              key={c.id}
              kind={c.kind as CardKind}
              label={cardTypes[c.kind]?.label}
              text={c.text}
              print
            />
          ))}
        </div>
      ))}
    </div>
  );
}
