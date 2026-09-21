// Printable kit entry (/print/kit): WO-19 Phase 4 — one page rendering every kit item's current
// production state (pending placeholder for slots with no real source; real cards/pages once
// content exists, with no other code change needed here). Mirrors src/print/deck/main.tsx's own
// thin wiring, reusing PrintSheet/PrintDeck unmodified.
//
// WO-20 Phase 7 / WO-21 Phase 2: the full 45-card deck is derived LIVE from real accepted/
// candidate course content (deriveFullDeck) rather than read from a static stub — see that
// module's own doc comment for exactly which of the 45 slots are populated and how (WO-21 Phase 2
// completed all 45; none is a placeholder). WO-21 Phase 0 recorded Founder Gate 1 + a Gate 2
// waiver for every Story Mission and Bank topic imported here except chanto/genkan/rouka (already
// fully release-clear before WO-21) — see kit-data/manifest.json's own status for the
// full-45-card-deck entry, still "candidate" (not "ready") since the DECK ITSELF as a printable
// artifact has not had its own separate print/layout sign-off.
//
// WO-21 Phase 3: the other 7 PrintSheet-based kit items, plus the newly-added Question Recipe
// Sheet (質問レシピシート, spec v0.5 §4.4 — previously flagged in the Human Decision Queue as
// unresolved, resolved by this same work order) and the Founders' Winter Bonus deck, now carry
// real authored content, status "candidate" (drafted, not yet human-reviewed) rather than
// "pending".
import { createRoot } from 'react-dom/client';
import { PrintSheet } from '../sheet/PrintSheet';
import { PrintDeck } from '../deck/PrintDeck';
import type { PrintSheetFile } from '../sheet/schema';
import type { DeckFile } from '../deck/PrintDeck';
import type { Mission } from '../../engine/types';
import { deriveFullDeck } from './deriveFullDeck';
import kitUi from '../kit-data/kit-ui.json';
import rules from '../kit-data/rules.json';
import parentHandbook from '../kit-data/parent-handbook.json';
import adultMemo from '../kit-data/adult-memo.json';
import certificate from '../kit-data/certificate.json';
import realAiGuide from '../kit-data/real-ai-guide.json';
import envelopeSheet from '../kit-data/envelope-sheet.json';
import questionRecipeSheet from '../kit-data/question-recipe-sheet.json';
import bonusDeck from '../kit-data/bonus-deck.json';
import moduleJson from '../../modules/m1/module.json';
import chantoMissionJson from '../../modules/m1/topics/chanto/s2.json';
import genkanMissionJson from '../../modules/m1/topics/genkan/s2.json';
import roukaMissionJson from '../../modules/m1/topics/rouka/s2.json';
import oyatsuMissionJson from '../../modules/m1/topics/oyatsu/s2.json';
import minnaMissionJson from '../../modules/m1/topics/minna/s2.json';
import zuruiMissionJson from '../../modules/m1/topics/zurui/s2.json';
import kashiteMissionJson from '../../modules/m1/topics/kashite/s2.json';
import randoseruMissionJson from '../../modules/m1/topics/randoseru/s2.json';
import bankAtode from '../../modules/m1/topics/bank-atode/s2.json';
import bankEscalator from '../../modules/m1/topics/bank-escalator/s2.json';
import bankJanken from '../../modules/m1/topics/bank-janken/s2.json';
import bankTeam from '../../modules/m1/topics/bank-team/s2.json';
import bankGakunen from '../../modules/m1/topics/bank-gakunen/s2.json';
import bankNedan from '../../modules/m1/topics/bank-nedan/s2.json';
import bankKirei from '../../modules/m1/topics/bank-kirei/s2.json';
import bankHoshii from '../../modules/m1/topics/bank-hoshii/s2.json';
import bankKotoba from '../../modules/m1/topics/bank-kotoba/s2.json';
import bankItadakimasu from '../../modules/m1/topics/bank-itadakimasu/s2.json';
import bankArigatou from '../../modules/m1/topics/bank-arigatou/s2.json';
import bank100yen from '../../modules/m1/topics/bank-100yen/s2.json';

const allSheets = [
  rules, parentHandbook, adultMemo, certificate, realAiGuide, envelopeSheet, questionRecipeSheet,
] as PrintSheetFile[];

// WO-29 §A/§I: the home-kit PDF build (scripts/build-home-kit.ts) needs to render exactly ONE
// deliverable per PDF file, not this page's own everything-at-once preview. ?item=<kitItem id>
// (manifest.json's own id, e.g. "parent-handbook", "full-45-card-deck") filters to just that one
// sheet or deck; no param (or an id that matches nothing) keeps the original combined-preview
// behavior this page has always had, so nothing about the existing manual-preview usage changes.
const onlyItem = new URLSearchParams(location.search).get('item');
const sheets = onlyItem ? allSheets.filter((s) => s.kitItem === onlyItem) : allSheets;

const storyMissions = [
  chantoMissionJson, genkanMissionJson, roukaMissionJson, oyatsuMissionJson,
  minnaMissionJson, zuruiMissionJson, kashiteMissionJson, randoseruMissionJson,
] as unknown as Mission[];
const bankTopics = [
  bankAtode, bankEscalator, bankJanken, bankTeam, bankGakunen, bankNedan,
  bankKirei, bankHoshii, bankKotoba, bankItadakimasu, bankArigatou, bank100yen,
] as unknown as Mission[];

const fullDeck: DeckFile = {
  stage: 2,
  cards: deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations }),
};
const allDecks: { id: string; deck: DeckFile }[] = [
  { id: 'full-45-card-deck', deck: fullDeck },
  { id: 'founders-bonus-deck', deck: bonusDeck as unknown as DeckFile },
];
const decks = (onlyItem ? allDecks.filter((d) => d.id === onlyItem) : allDecks).map((d) => d.deck);

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
