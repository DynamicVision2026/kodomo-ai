/**
 * WO-29 §J — production validation for the generated Home Kit. Run AFTER
 * `npx tsx scripts/build-home-kit.ts` has produced `public/kit/...`.
 *
 * Checks, in order: every PDF exists and opens (pdf-lib); page counts are sensible (exact for
 * the two card decks, whose 9-per-page grid makes the count fully deterministic; a sane range
 * for the text sheets, whose page count depends on content length/overflow); the full deck is
 * exactly 45 cards via the SAME live deriveFullDeck() the product itself uses; the printable
 * card's own physical geometry (63x88mm) and the A4 3x3 sheet layout, asserted at the CSS source
 * level (print-card.css / print-deck.css) rather than guessed from a rendered screenshot; the
 * Winter Bonus/Adult Trap deck is exactly the accepted 9-odai composition; the ZIP contains every
 * file the manifest expects, nothing else; and no kit-data source content contains placeholder or
 * draft/candidate-labelled text (scanning only the actual rendered fields — heading/body/text —
 * never the file's own internal `status`/`note` metadata, which legitimately says "candidate").
 *
 * Usage: npx tsx scripts/validate-home-kit.ts
 */
import { PDFDocument } from 'pdf-lib';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { homeKitPackage } from '../src/print/kit-data/homeKitPackage';
import { deriveFullDeck } from '../src/print/kit/deriveFullDeck';
import {
  checkDeckComposition, FULL_DECK_COMPOSITION, FULL_DECK_TOTAL, BONUS_SHEET_COMPOSITION, BONUS_SHEET_TOTAL,
  type DeckFile,
} from '../pipeline/lib/kitDeckComposition';
import type { PrintSheetFile } from '../src/print/sheet/schema';
import type { Mission } from '../src/engine/types';

import moduleJson from '../src/modules/m1/module.json';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanMissionJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaMissionJson from '../src/modules/m1/topics/rouka/s2.json';
import oyatsuMissionJson from '../src/modules/m1/topics/oyatsu/s2.json';
import minnaMissionJson from '../src/modules/m1/topics/minna/s2.json';
import zuruiMissionJson from '../src/modules/m1/topics/zurui/s2.json';
import kashiteMissionJson from '../src/modules/m1/topics/kashite/s2.json';
import randoseruMissionJson from '../src/modules/m1/topics/randoseru/s2.json';
import bankAtode from '../src/modules/m1/topics/bank-atode/s2.json';
import bankEscalator from '../src/modules/m1/topics/bank-escalator/s2.json';
import bankJanken from '../src/modules/m1/topics/bank-janken/s2.json';
import bankTeam from '../src/modules/m1/topics/bank-team/s2.json';
import bankGakunen from '../src/modules/m1/topics/bank-gakunen/s2.json';
import bankNedan from '../src/modules/m1/topics/bank-nedan/s2.json';
import bankKirei from '../src/modules/m1/topics/bank-kirei/s2.json';
import bankHoshii from '../src/modules/m1/topics/bank-hoshii/s2.json';
import bankKotoba from '../src/modules/m1/topics/bank-kotoba/s2.json';
import bankItadakimasu from '../src/modules/m1/topics/bank-itadakimasu/s2.json';
import bankArigatou from '../src/modules/m1/topics/bank-arigatou/s2.json';
import bank100yen from '../src/modules/m1/topics/bank-100yen/s2.json';
import bonusDeck from '../src/print/kit-data/bonus-deck.json';
import rules from '../src/print/kit-data/rules.json';
import parentHandbook from '../src/print/kit-data/parent-handbook.json';
import adultMemo from '../src/print/kit-data/adult-memo.json';
import certificate from '../src/print/kit-data/certificate.json';
import realAiGuide from '../src/print/kit-data/real-ai-guide.json';
import envelopeSheet from '../src/print/kit-data/envelope-sheet.json';
import questionRecipeSheet from '../src/print/kit-data/question-recipe-sheet.json';

const ROOT = process.cwd();
const PUBLIC_KIT = resolve(ROOT, 'public/kit');
const CARDS_PER_SHEET = 9;

let failures = 0;
function fail(message: string) {
  failures++;
  console.error(`FAIL: ${message}`);
}
function ok(message: string) {
  console.log(`ok:   ${message}`);
}

async function checkPdf(relPath: string, expectPages: { exact?: number; min?: number; max?: number }) {
  const path = resolve(PUBLIC_KIT, relPath);
  if (!existsSync(path)) { fail(`missing PDF: ${relPath}`); return; }
  const bytes = readFileSync(path);
  if (bytes.length < 200) { fail(`${relPath} is suspiciously small (${bytes.length} bytes) — likely not a real PDF`); return; }
  let doc;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (e) {
    fail(`${relPath} did not open as a valid PDF: ${(e as Error).message}`);
    return;
  }
  const pages = doc.getPageCount();
  if (expectPages.exact !== undefined && pages !== expectPages.exact) {
    fail(`${relPath} has ${pages} page(s), expected exactly ${expectPages.exact}`);
  } else if (expectPages.min !== undefined && pages < expectPages.min) {
    fail(`${relPath} has ${pages} page(s), expected at least ${expectPages.min}`);
  } else if (expectPages.max !== undefined && pages > expectPages.max) {
    fail(`${relPath} has ${pages} page(s), expected at most ${expectPages.max} (sanity ceiling)`);
  } else {
    ok(`${relPath} opens, ${pages} page(s)`);
  }
}

function sheetPageEstimate(sheet: PrintSheetFile): { min: number; max: number } {
  const copies = Math.max(1, sheet.intendedCount ?? 1);
  // Each section forces at least the start of one new page; a long section can overflow onto
  // more. min = one page per section per copy; max is a generous ceiling (4 A4 pages per
  // section) that would only be hit by a genuinely broken render.
  return { min: copies * sheet.sections.length, max: copies * sheet.sections.length * 4 };
}

const FORBIDDEN_TEXT = /TODO|TBD|placeholder|プレースホルダ|xxx|候補|下書き|ないよう じゅんびちゅう|じゅんびちゅう/i;
const JA = /[぀-ゟ゠-ヿ一-鿿]/;

function checkSheetContent(id: string, sheet: PrintSheetFile) {
  if (sheet.status === 'pending') { fail(`${id}: status is "pending" — no real content to ship`); return; }
  if (sheet.sections.length === 0) { fail(`${id}: no sections`); return; }
  for (const section of sheet.sections) {
    if (section.heading && FORBIDDEN_TEXT.test(section.heading)) fail(`${id}: forbidden text in heading "${section.heading}"`);
    if (section.heading && !JA.test(section.heading)) fail(`${id}: heading has no Japanese text: "${section.heading}"`);
    for (const line of section.body) {
      if (FORBIDDEN_TEXT.test(line)) fail(`${id}: forbidden text in body line "${line}"`);
      if (!JA.test(line)) fail(`${id}: body line has no Japanese text: "${line}"`);
    }
  }
  ok(`${id}: content clean (no placeholder/draft text, real Japanese)`);
}

function checkDeckContent(id: string, deck: DeckFile) {
  for (const c of deck.cards) {
    if (FORBIDDEN_TEXT.test(c.text)) fail(`${id}: forbidden text on card ${c.id}: "${c.text}"`);
    if (!JA.test(c.text)) fail(`${id}: card ${c.id} has no Japanese text: "${c.text}"`);
  }
  ok(`${id}: content clean (no placeholder/draft text, real Japanese)`);
}

async function main() {
  console.log('== WO-29 Home Kit production validation ==\n');

  // ---- 1. card count = 45, via the SAME live derivation the product/build actually uses ----
  const storyMissions = [
    chantoMissionJson, genkanMissionJson, roukaMissionJson, oyatsuMissionJson,
    minnaMissionJson, zuruiMissionJson, kashiteMissionJson, randoseruMissionJson,
  ] as unknown as Mission[];
  const bankTopics = [
    bankAtode, bankEscalator, bankJanken, bankTeam, bankGakunen, bankNedan,
    bankKirei, bankHoshii, bankKotoba, bankItadakimasu, bankArigatou, bank100yen,
  ] as unknown as Mission[];
  const fullDeckCards = deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations });
  const fullDeck: DeckFile = { stage: 2, cards: fullDeckCards };
  if (fullDeckCards.length !== 45) fail(`full deck has ${fullDeckCards.length} cards, expected exactly 45`);
  else ok(`full deck: exactly ${FULL_DECK_TOTAL} cards`);
  const compIssues = checkDeckComposition(fullDeck, FULL_DECK_COMPOSITION);
  if (compIssues.length) fail(`full deck composition mismatch: ${JSON.stringify(compIssues)}`);
  else ok('full deck: composition matches spec v0.5 §8 exactly');

  // ---- 2. Winter Bonus / Adult Trap = exactly 9 items ----
  const bonus = bonusDeck as unknown as DeckFile;
  if (bonus.cards.length !== 9) fail(`Winter Bonus/Adult Trap deck has ${bonus.cards.length} cards, expected exactly 9`);
  else ok(`Winter Bonus/Adult Trap: exactly ${BONUS_SHEET_TOTAL} items`);
  const bonusIssues = checkDeckComposition(bonus, BONUS_SHEET_COMPOSITION);
  if (bonusIssues.length) fail(`Winter Bonus/Adult Trap composition mismatch: ${JSON.stringify(bonusIssues)}`);
  else ok('Winter Bonus/Adult Trap: composition matches (9 odai)');
  checkDeckContent('founders-bonus-deck', bonus);

  // ---- 3. card physical geometry: 63x88mm, A4 3x3 layout — asserted at the CSS source ----
  const printCardCss = readFileSync(resolve(ROOT, 'src/ui/print-card.css'), 'utf8');
  const hasWidth63mm = /width:\s*63mm/.test(printCardCss);
  const hasHeight88mm = /min-height:\s*88mm/.test(printCardCss);
  if (!hasWidth63mm) fail('print-card.css: card width is not 63mm');
  if (!hasHeight88mm) fail('print-card.css: card min-height is not 88mm');
  if (hasWidth63mm && hasHeight88mm) ok('card geometry: 63x88mm confirmed in print-card.css');
  const printDeckCss = readFileSync(resolve(ROOT, 'src/print/deck/print-deck.css'), 'utf8');
  const has3x3 = /grid-template-columns:\s*repeat\(3,\s*63mm\)/.test(printDeckCss)
    && /grid-template-rows:\s*repeat\(3,\s*88mm\)/.test(printDeckCss);
  const hasA4 = /@page\s*\{[^}]*size:\s*A4/.test(printDeckCss);
  if (!has3x3) fail('print-deck.css: sheet grid is not a 3x3 of 63x88mm cards');
  if (!hasA4) fail('print-deck.css: @page size is not A4');
  if (has3x3 && hasA4) ok('sheet layout: A4, 9 cards per sheet in a 3x3 grid confirmed in print-deck.css');

  // ---- 4. every PDF exists, opens, and has a sensible page count ----
  const sheetSources: Record<string, PrintSheetFile> = {
    'rules-a4x5': rules as PrintSheetFile,
    'parent-handbook': parentHandbook as PrintSheetFile,
    'adult-memo': adultMemo as PrintSheetFile,
    'certificate': certificate as PrintSheetFile,
    'real-ai-guide': realAiGuide as PrintSheetFile,
    'envelope-sheet': envelopeSheet as PrintSheetFile,
    'question-recipe-sheet': questionRecipeSheet as PrintSheetFile,
  };

  for (const folder of homeKitPackage.folders) {
    for (const item of folder.items) {
      const relPath = `${folder.id}/${item.fileName}`;
      if (item.kind === 'deck') {
        const exact = item.kitItem === 'full-45-card-deck'
          ? Math.ceil(FULL_DECK_TOTAL / CARDS_PER_SHEET)
          : Math.ceil(BONUS_SHEET_TOTAL / CARDS_PER_SHEET);
        await checkPdf(relPath, { exact });
      } else {
        const sheet = sheetSources[item.kitItem];
        if (!sheet) { fail(`no source content registered for kitItem "${item.kitItem}"`); continue; }
        const { min, max } = sheetPageEstimate(sheet);
        await checkPdf(relPath, { min, max });
      }
    }
  }

  // ---- 5. no placeholder/candidate-draft text in any sheet's actual rendered content ----
  for (const [id, sheet] of Object.entries(sheetSources)) checkSheetContent(id, sheet);

  // ---- 6. the ZIP contains every required deliverable, nothing more ----
  const zipPath = resolve(PUBLIC_KIT, `${homeKitPackage.zipBaseName}.zip`);
  if (!existsSync(zipPath)) {
    fail(`ZIP missing: ${zipPath}`);
  } else {
    const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
    const zipEntries = new Set(listing.split('\n').map((l) => l.trim()).filter(Boolean));
    const expectedFiles = homeKitPackage.folders.flatMap((folder) =>
      folder.items.map((item) => `${homeKitPackage.zipBaseName}/${folder.id}/${item.fileName}`));
    for (const expected of expectedFiles) {
      if (!zipEntries.has(expected)) fail(`ZIP is missing expected file: ${expected}`);
    }
    const fileEntries = [...zipEntries].filter((e) => !e.endsWith('/'));
    const unexpected = fileEntries.filter((e) => !expectedFiles.includes(e));
    if (unexpected.length) fail(`ZIP contains unexpected file(s): ${JSON.stringify(unexpected)}`);
    if (unexpected.length === 0 && expectedFiles.every((e) => zipEntries.has(e))) {
      ok(`ZIP contains exactly the ${expectedFiles.length} expected deliverable files, no more`);
    }
  }

  console.log(`\n== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ==`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
