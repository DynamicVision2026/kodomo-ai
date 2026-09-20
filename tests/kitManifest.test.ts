import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePrintSheet, type PrintSheetFile } from '../src/print/sheet/schema';
import { checkDeckComposition, FULL_DECK_COMPOSITION, BONUS_SHEET_COMPOSITION, type DeckFile } from '../pipeline/lib/kitDeckComposition';
import manifest from '../src/print/kit-data/manifest.json';

const ROOT = resolve(__dirname, '..');

/** spec v0.5 §4.4's kit list, as WO-19 Phase 4 itemizes it, plus the Question Recipe Sheet
 *  (質問レシピシート — spec v0.5 §4.4 names it, but WO-19 Phase 4's own 8-item list omitted it;
 *  WO-21 Phase 3 resolves that Human Decision Queue item by adding it as its own manifest item,
 *  counted inside Package 6's existing DoD weight, never a new package). */
const EXPECTED_ITEM_IDS = [
  'full-45-card-deck', 'rules-a4x5', 'parent-handbook', 'adult-memo',
  'certificate', 'question-recipe-sheet', 'real-ai-guide', 'envelope-sheet', 'founders-bonus-deck',
];

describe('WO-19 Phase 4 kit manifest (WO-21 Phase 3: real content added)', () => {
  it('lists exactly the 9 required production containers (8 + the newly-resolved Question Recipe Sheet), no more and no fewer', () => {
    expect(manifest.items.map((i) => i.id).sort()).toEqual([...EXPECTED_ITEM_IDS].sort());
  });

  it('every item is honestly marked "pending", "candidate" or "ready" — none claims "ready" without real human review having actually happened', () => {
    for (const item of manifest.items) {
      expect(['pending', 'candidate', 'ready']).toContain(item.status);
      expect(item.status).not.toBe('ready');
    }
  });

  it('WO-21 Phase 3: every item is now "candidate" — real, drafted content exists for all 9, none is still genuinely "pending"', () => {
    for (const item of manifest.items) {
      expect(item.status, item.id).toBe('candidate');
    }
  });

  it('every item\'s declared dataPath exists on disk', () => {
    for (const item of manifest.items) {
      expect(existsSync(resolve(ROOT, item.dataPath))).toBe(true);
    }
  });

  it('every PrintSheet-schema data file (rules/handbook/memo/certificate/question-recipe/guide/envelope) is schema-valid, candidate, and has real non-empty content', () => {
    const sheetItemIds = [
      'rules-a4x5', 'parent-handbook', 'adult-memo', 'certificate',
      'question-recipe-sheet', 'real-ai-guide', 'envelope-sheet',
    ];
    for (const item of manifest.items.filter((i) => sheetItemIds.includes(i.id))) {
      const file = JSON.parse(readFileSync(resolve(ROOT, item.dataPath), 'utf8')) as PrintSheetFile;
      expect(validatePrintSheet(file), item.id).toEqual([]);
      expect(file.status, item.id).toBe('candidate');
      expect(file.sections.length, item.id).toBeGreaterThan(0);
      for (const section of file.sections) {
        expect(section.body.length, item.id).toBeGreaterThan(0);
        for (const line of section.body) expect(line.trim().length, item.id).toBeGreaterThan(0);
      }
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

  it('WO-21 Phase 3: the founders-bonus-deck data file has real content matching BONUS_SHEET_COMPOSITION exactly (9 odai cards, unique ids, no placeholder text)', () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'src/print/kit-data/bonus-deck.json'), 'utf8')) as DeckFile & { status: string };
    expect(raw.status).toBe('candidate');
    const issues = checkDeckComposition(raw, BONUS_SHEET_COMPOSITION);
    expect(issues).toEqual([]);
    expect(new Set(raw.cards.map((c) => c.id)).size).toBe(raw.cards.length);
    for (const c of raw.cards) {
      expect(c.text.trim().length).toBeGreaterThan(0);
      expect(c.text).not.toMatch(/TODO|TBD|placeholder|xxx/i);
    }
  });
});
