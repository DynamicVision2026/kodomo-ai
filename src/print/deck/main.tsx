// Printable deck entry (/print/deck): this stage's thin wiring for the shared PrintDeck
// component (Sprint 1-A §2.5) — a Stage 1/3 deck gets its own such entry once deck.sN.json
// content exists, never a fork of PrintDeck.tsx itself.
import { createRoot } from 'react-dom/client';
import { PrintDeck } from './PrintDeck';
import deck from '../../modules/m1/deck.s2.json';
import moduleJson from '../../modules/m1/module.json';

createRoot(document.getElementById('root')!).render(
  <PrintDeck deck={deck} cardTypes={moduleJson.cardTypes} />,
);
