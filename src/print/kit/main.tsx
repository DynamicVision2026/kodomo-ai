// Printable kit entry (/print/kit): WO-19 Phase 4 — one page rendering every kit item's current
// production state (pending placeholder today; real pages once content lands and status flips
// to "ready", with no other code change needed here). Mirrors src/print/deck/main.tsx's own thin
// wiring, reusing PrintSheet/PrintDeck unmodified.
import { createRoot } from 'react-dom/client';
import { PrintSheet } from '../sheet/PrintSheet';
import { PrintDeck } from '../deck/PrintDeck';
import type { PrintSheetFile } from '../sheet/schema';
import type { DeckFile } from '../deck/PrintDeck';
import kitUi from '../kit-data/kit-ui.json';
import rules from '../kit-data/rules.json';
import parentHandbook from '../kit-data/parent-handbook.json';
import adultMemo from '../kit-data/adult-memo.json';
import certificate from '../kit-data/certificate.json';
import realAiGuide from '../kit-data/real-ai-guide.json';
import envelopeSheet from '../kit-data/envelope-sheet.json';
import fullDeck from '../kit-data/full-deck.json';
import bonusDeck from '../kit-data/bonus-deck.json';
import moduleJson from '../../modules/m1/module.json';

const sheets = [rules, parentHandbook, adultMemo, certificate, realAiGuide, envelopeSheet] as PrintSheetFile[];
const decks = [fullDeck, bonusDeck] as unknown as DeckFile[];

createRoot(document.getElementById('root')!).render(
  <div>
    {sheets.map((sheet) => (
      <PrintSheet key={sheet.kitItem} sheet={sheet} pendingLabel={kitUi.pendingLabel} />
    ))}
    {decks.map((deck, i) => (
      <PrintDeck key={i} deck={deck} cardTypes={moduleJson.cardTypes} />
    ))}
  </div>,
);
