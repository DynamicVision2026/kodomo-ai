import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PrintDeck, chunk } from '../src/print/deck/PrintDeck';
import { deriveFullDeck } from '../src/print/kit/deriveFullDeck';
import deck from '../src/modules/m1/deck.s2.json';
import moduleJson from '../src/modules/m1/module.json';
import type { Mission } from '../src/engine/types';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanMissionJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaMissionJson from '../src/modules/m1/topics/rouka/s2.json';
import oyatsuMissionJson from '../src/modules/m1/topics/oyatsu/s2.json';
import minnaMissionJson from '../src/modules/m1/topics/minna/s2.json';
import zuruiMissionJson from '../src/modules/m1/topics/zurui/s2.json';
import kashiteMissionJson from '../src/modules/m1/topics/kashite/s2.json';
import randoseruMissionJson from '../src/modules/m1/topics/randoseru/s2.json';
import b01 from '../src/modules/m1/topics/bank-atode/s2.json';
import b02 from '../src/modules/m1/topics/bank-escalator/s2.json';
import b03 from '../src/modules/m1/topics/bank-janken/s2.json';
import b04 from '../src/modules/m1/topics/bank-team/s2.json';
import b05 from '../src/modules/m1/topics/bank-gakunen/s2.json';
import b06 from '../src/modules/m1/topics/bank-nedan/s2.json';
import b07 from '../src/modules/m1/topics/bank-kirei/s2.json';
import b08 from '../src/modules/m1/topics/bank-hoshii/s2.json';
import b09 from '../src/modules/m1/topics/bank-kotoba/s2.json';
import b10 from '../src/modules/m1/topics/bank-itadakimasu/s2.json';
import b11 from '../src/modules/m1/topics/bank-arigatou/s2.json';
import b12 from '../src/modules/m1/topics/bank-100yen/s2.json';

const cardTypes = moduleJson.cardTypes as Record<string, { label: string }>;

afterEach(() => cleanup());

describe('chunk', () => {
  it('splits into groups of the given size, with a shorter final group', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one group when everything fits', () => {
    expect(chunk([1, 2, 3], 9)).toEqual([[1, 2, 3]]);
  });

  it('returns nothing for an empty input', () => {
    expect(chunk([], 9)).toEqual([]);
  });
});

describe('PrintDeck', () => {
  it('renders exactly one sheet for the 9-card sampler, with every card\'s text', () => {
    const { container } = render(<PrintDeck deck={deck} cardTypes={cardTypes} />);
    const sheets = container.querySelectorAll('.print-deck__sheet');
    expect(sheets).toHaveLength(1);

    const cards = container.querySelectorAll('.print-card');
    expect(cards).toHaveLength(9);
    for (const c of deck.cards) {
      expect(container.textContent).toContain(c.text);
    }
  });

  it('renders every card as non-interactive (a div, not a button) — WO-23: PrintCard has no interactive path at all, not just a print-mode flag', () => {
    const { container } = render(<PrintDeck deck={deck} cardTypes={cardTypes} />);
    expect(container.querySelectorAll('.print-card button')).toHaveLength(0);
    expect(container.querySelectorAll('button.print-card')).toHaveLength(0);
  });

  it('renders from whatever deck + cardTypes it is given, not a fixed stage-2 import (Sprint 1-A §2.5)', () => {
    const fakeDeck = { stage: 3, cards: [{ id: 'x1', kind: 'check', text: 'テストカード' }] };
    const fakeCardTypes = { check: { label: 'みなおし' } };
    const { container } = render(<PrintDeck deck={fakeDeck} cardTypes={fakeCardTypes} />);
    expect(container.textContent).toContain('テストカード');
    expect(container.querySelectorAll('.print-deck__sheet')).toHaveLength(1);
  });

  it('WO-21 Phase 2 acceptance proof: the full 45-card deck, derived from the real 8 Story + 12 Bank topics, prints successfully as 5 sheets of 9 cards with every card\'s text visible', () => {
    const storyMissions = [
      chantoMissionJson, genkanMissionJson, roukaMissionJson, oyatsuMissionJson,
      minnaMissionJson, zuruiMissionJson, kashiteMissionJson, randoseruMissionJson,
    ] as unknown as Mission[];
    const bankTopics = [b01, b02, b03, b04, b05, b06, b07, b08, b09, b10, b11, b12] as unknown as Mission[];
    const fullDeck = { stage: 2, cards: deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations }) };
    expect(fullDeck.cards).toHaveLength(45);

    const { container } = render(<PrintDeck deck={fullDeck} cardTypes={cardTypes} />);
    const sheets = container.querySelectorAll('.print-deck__sheet');
    expect(sheets).toHaveLength(5); // ceil(45 / 9)
    expect(container.querySelectorAll('.print-card')).toHaveLength(45);
    for (const c of fullDeck.cards) expect(container.textContent).toContain(c.text);
  });
});
