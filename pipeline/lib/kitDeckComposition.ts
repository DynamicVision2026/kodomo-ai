/**
 * WO-19 Phase 4: the accepted card-count composition for the full v0.6 printable deck (spec
 * v0.5 §8) and the founders' winter bonus sheet (spec v0.5 §8's own "9 「冬休みスペシャル」
 * おだい"). PrintDeck.tsx already renders any DeckFile regardless of composition (Sprint 1-A
 * §2.5) — that renderer needing no change is exactly why the 45-card deck cannot be marked
 * COMPLETE from the renderer alone (WO-19's own explicit boundary). What's still missing is
 * real card CONTENT, which depends on Story Missions 1-4 through 1-8 and the Bank topics that
 * haven't been authored yet.
 *
 * This module is the deterministic check that a FUTURE deck.s2.json (once that content exists)
 * actually matches the accepted composition — so inserting real content later is a pass/fail
 * check, not a guess. It validates composition only; child-facing text itself still goes through
 * lintDeck (pipeline/04_lint.ts) unchanged.
 */

export interface DeckCard { id: string; kind: string; text: string }
export interface DeckFile { stage: number; cards: DeckCard[] }

/** spec v0.5 §8's card-type table for the full 45-card Stage-2 deck. */
export const FULL_DECK_COMPOSITION: Record<string, number> = {
  odai: 10,
  // "Core slots ×4 (2 pre-filled + 1 blank each)" = 4 slot types * 3 cards each.
  what: 3,
  why: 3,
  who: 3,
  format: 3,
  // "追問カード ×4 moves (3 each)"
  'follow-naze': 3,
  'follow-tatoeba': 3,
  'follow-tsumari': 3,
  'follow-hokaniwa': 3,
  himitsu: 4,
  reaction: 3,
  rules: 2,
  blank: 2,
};

export const FULL_DECK_TOTAL = Object.values(FULL_DECK_COMPOSITION).reduce((a, b) => a + b, 0); // 45

/** spec v0.5 §8: "Founders' bonus sheet: 9 「冬休みスペシャル」おだい" — all one kind. */
export const BONUS_SHEET_COMPOSITION: Record<string, number> = { odai: 9 };
export const BONUS_SHEET_TOTAL = 9;

export interface CompositionIssue { kind: string; expected: number; actual: number }

/**
 * Compares `deck.cards`' actual per-kind counts against `expected`. Empty array = deck matches
 * exactly. Pure — no filesystem access, so it can validate an in-memory draft before it's ever
 * written to disk.
 */
export function checkDeckComposition(deck: DeckFile, expected: Record<string, number>): CompositionIssue[] {
  const actual: Record<string, number> = {};
  for (const card of deck.cards) actual[card.kind] = (actual[card.kind] ?? 0) + 1;

  const issues: CompositionIssue[] = [];
  const kinds = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const kind of kinds) {
    const expectedCount = expected[kind] ?? 0;
    const actualCount = actual[kind] ?? 0;
    if (expectedCount !== actualCount) issues.push({ kind, expected: expectedCount, actual: actualCount });
  }
  return issues;
}
