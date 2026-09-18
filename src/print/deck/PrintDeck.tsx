import { Card, type CardKind } from '../../ui/Card';
import deck from '../../modules/m1/deck.s2.json';
import moduleJson from '../../modules/m1/module.json';
import './print-deck.css';

const CARDS_PER_SHEET = 9;

/** Exported for tests — pure, no rendering. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Printable card deck. Spec v0.5 §8: poker size, 9 per A4 sheet, cut lines, legible in
 * black and white (Card.tsx already carries colour + icon + corner shape per type, so
 * nothing here needs to reason about colour at all). Generated straight from deck.s2.json —
 * a second sheet's worth of cards needs no code change, only more entries in that file.
 */
export function PrintDeck() {
  const sheets = chunk(deck.cards, CARDS_PER_SHEET);
  const cardTypes = moduleJson.cardTypes as Record<string, { label: string }>;

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
