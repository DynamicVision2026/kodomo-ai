import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePrintSheet, type PrintSheetFile } from '../src/print/sheet/schema';
import { checkDeckComposition, FULL_DECK_COMPOSITION, BONUS_SHEET_COMPOSITION, type DeckFile } from '../pipeline/lib/kitDeckComposition';
import manifest from '../src/print/kit-data/manifest.json';

const ROOT = resolve(__dirname, '..');

/** spec v0.5 §4.4's kit list, as WO-19 Phase 4 itemizes it — the fixed 8-item source of truth
 *  for this sprint's Printable/Home Kit audit. */
const EXPECTED_ITEM_IDS = [
  'full-45-card-deck', 'rules-a4x5', 'parent-handbook', 'adult-memo',
  'certificate', 'real-ai-guide', 'envelope-sheet', 'founders-bonus-deck',
];

describe('WO-19 Phase 4 kit manifest', () => {
  it('lists exactly the 8 required production containers, no more and no fewer (no invented Package 9)', () => {
    expect(manifest.items.map((i) => i.id).sort()).toEqual([...EXPECTED_ITEM_IDS].sort());
  });

  it('every item is honestly marked "pending" or "candidate" — none claims "ready" merely because a renderer exists or content is candidate-derived', () => {
    for (const item of manifest.items) {
      expect(['pending', 'candidate']).toContain(item.status);
      expect(item.status).not.toBe('ready');
    }
  });

  it('only the full-45-card-deck is "candidate" (WO-20 Phase 7 live derivation) — every other item remains genuinely "pending"', () => {
    for (const item of manifest.items) {
      if (item.id === 'full-45-card-deck') expect(item.status).toBe('candidate');
      else expect(item.status).toBe('pending');
    }
  });

  it('every item\'s declared dataPath exists on disk', () => {
    for (const item of manifest.items) {
      expect(existsSync(resolve(ROOT, item.dataPath))).toBe(true);
    }
  });

  it('every PrintSheet-schema data file (rules/handbook/memo/certificate/guide/envelope) is schema-valid and honestly pending', () => {
    const sheetItemIds = ['rules-a4x5', 'parent-handbook', 'adult-memo', 'certificate', 'real-ai-guide', 'envelope-sheet'];
    for (const item of manifest.items.filter((i) => sheetItemIds.includes(i.id))) {
      const file = JSON.parse(readFileSync(resolve(ROOT, item.dataPath), 'utf8')) as PrintSheetFile;
      expect(validatePrintSheet(file)).toEqual([]);
      expect(file.status).toBe('pending');
    }
  });

  it('the full-45-card-deck STATIC STUB file is a documentation record only (candidate, empty cards array) — the real deck is live-derived by src/print/kit/deriveFullDeck.ts, proven in tests/deriveFullDeck.test.ts', () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'src/print/kit-data/full-deck.json'), 'utf8'));
    expect(raw.status).toBe('candidate');
    expect(raw.cards).toEqual([]);
    // The composition CHECK works even against an empty deck — every kind is reported missing,
    // proving the validator is live and ready for real content, not a stub that always passes.
    const issues = checkDeckComposition(raw as DeckFile, FULL_DECK_COMPOSITION);
    expect(issues.length).toBe(Object.keys(FULL_DECK_COMPOSITION).length);
  });

  it('the founders-bonus-deck data file is pending, empty, and would validate against BONUS_SHEET_COMPOSITION once real content is inserted', () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'src/print/kit-data/bonus-deck.json'), 'utf8'));
    expect(raw.status).toBe('pending');
    expect(raw.cards).toEqual([]);
    const issues = checkDeckComposition(raw as DeckFile, BONUS_SHEET_COMPOSITION);
    expect(issues).toEqual([{ kind: 'odai', expected: 9, actual: 0 }]);
  });
});
