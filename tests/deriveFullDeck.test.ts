import { describe, it, expect } from 'vitest';
import { deriveFullDeck } from '../src/print/kit/deriveFullDeck';
import { checkDeckComposition, FULL_DECK_COMPOSITION, FULL_DECK_TOTAL, type DeckFile as CompositionDeckFile } from '../pipeline/lib/kitDeckComposition';
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
import moduleJson from '../src/modules/m1/module.json';

const storyMissions = [
  chantoMissionJson, genkanMissionJson, roukaMissionJson, oyatsuMissionJson,
  minnaMissionJson, zuruiMissionJson, kashiteMissionJson, randoseruMissionJson,
] as unknown as Mission[];
const allBankTopics = [b01, b02, b03, b04, b05, b06, b07, b08, b09, b10, b11, b12] as unknown as Mission[];
const twoBankTopics = [b01, b02] as unknown as Mission[];

describe('deriveFullDeck (WO-20 Phase 7, completed WO-21 Phase 2)', () => {
  it('derives exactly 10 odai cards, one per topic (Story Missions first), each traceable to a real source', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: twoBankTopics, moveRealizations: moduleJson.moveRealizations });
    const odai = deck.filter((c) => c.kind === 'odai');
    expect(odai).toHaveLength(8 + 2); // capped at min(sources, 10) — here only 2 bank topics supplied
    expect(odai.map((c) => c.text)).toContain('『ちゃんと』って、どういういみ？'); // chanto's own clear card
    expect(odai.map((c) => c.text)).toContain(b01.title);
  });

  it('caps odai at 10 even when more than 10 real topics are supplied', () => {
    const manyBank = Array.from({ length: 12 }, (_, i) => ({ ...b01, id: `bank-fake-${i}`, title: `お題${i}` }));
    const deck = deriveFullDeck({ storyMissions, bankTopics: manyBank as unknown as Mission[], moveRealizations: moduleJson.moveRealizations });
    expect(deck.filter((c) => c.kind === 'odai')).toHaveLength(10);
  });

  it('derives exactly 3 cards per follow-move: the canonical accepted phrasing plus 2 distinct accepted-vocabulary variants', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: twoBankTopics, moveRealizations: moduleJson.moveRealizations });
    for (const [move, canonical] of Object.entries(moduleJson.moveRealizations)) {
      const texts = deck.filter((c) => c.kind === move).map((c) => c.text);
      expect(texts, move).toHaveLength(3);
      expect(texts, move).toContain(canonical);
      expect(new Set(texts).size, `${move}: no duplicate phrasing`).toBe(3);
    }
  });

  it('derives exactly 3 core-slot cards each (なにを/なぜ/だれに/どんな形で) — 2 real prompts + 1 genuine "write your own" invitation, never empty text', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: twoBankTopics, moveRealizations: moduleJson.moveRealizations });
    for (const slot of ['what', 'why', 'who', 'format']) {
      const cards = deck.filter((c) => c.kind === slot);
      expect(cards, slot).toHaveLength(3);
      for (const c of cards) expect(c.text.trim().length, `${slot}/${c.id}`).toBeGreaterThan(0);
      expect(new Set(cards.map((c) => c.text)).size, `${slot}: no duplicate phrasing`).toBe(3);
    }
  });

  it('derives exactly 4 himitsu cards, each real non-empty text, none a scare tactic (no forbidden alarm words)', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: twoBankTopics, moveRealizations: moduleJson.moveRealizations });
    const himitsu = deck.filter((c) => c.kind === 'himitsu');
    expect(himitsu).toHaveLength(4);
    for (const c of himitsu) {
      expect(c.text.trim().length).toBeGreaterThan(0);
      for (const forbidden of ['きけん', 'こわい', 'あぶない', '犯罪']) expect(c.text).not.toContain(forbidden);
    }
    expect(new Set(himitsu.map((c) => c.text)).size).toBe(4);
  });

  it('derives exactly 2 rules cards, adapted from spec v0.5 §8\'s own accepted ほりさげゲーム description (drawing おだい, building the first question, ついもんカード, ねっこ, swapping roles)', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: twoBankTopics, moveRealizations: moduleJson.moveRealizations });
    const rules = deck.filter((c) => c.kind === 'rules');
    expect(rules).toHaveLength(2);
    const joined = rules.map((c) => c.text).join(' ');
    expect(joined).toContain('おだい');
    expect(joined).toContain('ねっこ');
    expect(joined).toContain('こうたい');
  });

  it('derives exactly 3 reaction cards, one per dig tag (repeat/offtopic/sideways), each the real, most-common already-accepted reply text for that tag — never invented', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: twoBankTopics, moveRealizations: moduleJson.moveRealizations });
    const reaction = deck.filter((c) => c.kind === 'reaction');
    expect(reaction).toHaveLength(3);
    const texts = reaction.map((c) => c.text);
    // These are the real de facto standard reply strings — verifiable by grepping every
    // mission's own facts.yaml-adjacent s2.json replies (already lint-passed mission content).
    expect(texts).toContain('いっても、同じだよ。');
    expect(texts).toContain('うーん、それはべつの話だよ。');
    expect(texts).toContain('さあ、それはわからないな。でも、今の話とはべつだよ。');
  });

  it('derives exactly 2 blank cards, each a genuine "write your own" invitation, never an empty string standing in for missing content', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: twoBankTopics, moveRealizations: moduleJson.moveRealizations });
    const blanks = deck.filter((c) => c.kind === 'blank');
    expect(blanks).toHaveLength(2);
    for (const c of blanks) expect(c.text.trim().length).toBeGreaterThan(0);
  });

  it('WO-21 Phase 2 acceptance proof: feeding the full 20-topic library (8 Story + 12 Bank) through deriveFullDeck produces exactly the accepted 45-card composition, with zero missing/extra slots', () => {
    const deck: CompositionDeckFile = {
      stage: 2,
      cards: deriveFullDeck({ storyMissions, bankTopics: allBankTopics, moveRealizations: moduleJson.moveRealizations }),
    };
    expect(deck.cards).toHaveLength(FULL_DECK_TOTAL);
    expect(deck.cards).toHaveLength(45);
    const issues = checkDeckComposition(deck, FULL_DECK_COMPOSITION);
    expect(issues).toEqual([]);
  });

  it('WO-21 Phase 2 acceptance proof: every card has a unique id', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: allBankTopics, moveRealizations: moduleJson.moveRealizations });
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });

  it('WO-21 Phase 2 acceptance proof: no card carries an unresolved placeholder — every card has real, non-empty text (blank-by-design cards carry a genuine "write your own" invitation instead)', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: allBankTopics, moveRealizations: moduleJson.moveRealizations });
    for (const c of deck) {
      expect(c.text.trim().length, `${c.kind}/${c.id}`).toBeGreaterThan(0);
      expect(c.text, `${c.kind}/${c.id}`).not.toMatch(/TODO|TBD|placeholder|xxx/i);
    }
  });

  it('every dig-phase move-family card and core-slot card stays within the approved Stage-2 follow-move vocabulary and card kinds — no invented fifth move or slot', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics: allBankTopics, moveRealizations: moduleJson.moveRealizations });
    const approvedFollow = new Set(moduleJson.followMoves);
    const approvedSlots = new Set(moduleJson.slotTypes);
    for (const c of deck) {
      if (c.kind.startsWith('follow-')) expect(approvedFollow.has(c.kind), c.kind).toBe(true);
      if (['what', 'why', 'who', 'format'].includes(c.kind)) expect(approvedSlots.has(c.kind), c.kind).toBe(true);
    }
  });
});
