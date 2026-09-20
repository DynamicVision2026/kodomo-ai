import { describe, it, expect } from 'vitest';
import { deriveFullDeck } from '../src/print/kit/deriveFullDeck';
import { checkDeckComposition, FULL_DECK_COMPOSITION, type DeckFile as CompositionDeckFile } from '../pipeline/lib/kitDeckComposition';
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
import moduleJson from '../src/modules/m1/module.json';

const storyMissions = [
  chantoMissionJson, genkanMissionJson, roukaMissionJson, oyatsuMissionJson,
  minnaMissionJson, zuruiMissionJson, kashiteMissionJson, randoseruMissionJson,
] as unknown as Mission[];
const bankTopics = [b01, b02] as unknown as Mission[];

describe('deriveFullDeck (WO-20 Phase 7)', () => {
  it('derives exactly 10 odai cards, one per topic (Story Missions first), each traceable to a real source', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations });
    const odai = deck.filter((c) => c.kind === 'odai');
    expect(odai).toHaveLength(8 + 2); // capped at min(sources, 10) — here only 2 bank topics supplied
    // Every odai card's text is a real slot-assembly "clear" card or a real Bank topic title —
    // never fabricated.
    expect(odai.map((c) => c.text)).toContain('『ちゃんと』って、どういういみ？'); // chanto's own clear card
    expect(odai.map((c) => c.text)).toContain(b01.title);
  });

  it('caps odai at 10 even when more than 10 real topics are supplied', () => {
    const manyBank = Array.from({ length: 12 }, (_, i) => ({ ...b01, id: `bank-fake-${i}`, title: `お題${i}` }));
    const deck = deriveFullDeck({ storyMissions, bankTopics: manyBank as unknown as Mission[], moveRealizations: moduleJson.moveRealizations });
    expect(deck.filter((c) => c.kind === 'odai')).toHaveLength(10);
  });

  it('derives exactly one card per move, using module.json\'s own accepted moveRealizations verbatim', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations });
    for (const [move, text] of Object.entries(moduleJson.moveRealizations)) {
      const found = deck.find((c) => c.kind === move);
      expect(found?.text, move).toBe(text);
    }
  });

  it('derives exactly 2 blank cards, needing no source content', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations });
    expect(deck.filter((c) => c.kind === 'blank')).toHaveLength(2);
  });

  it('does NOT invent content for slots with no real source (why/who/format, himitsu, reaction, rules)', () => {
    const deck = deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations });
    for (const kind of ['why', 'who', 'format', 'himitsu', 'reaction', 'rules']) {
      expect(deck.filter((c) => c.kind === kind), kind).toHaveLength(0);
    }
  });

  it('feeding the full derived deck (all 8 missions + all 12 bank topics) through checkDeckComposition shows exactly which of the 45 slots remain missing — never silently claims completeness', () => {
    // 20 real topics exist; odai caps at 10 regardless, so composition is necessarily short on
    // several kinds — this is the honest, expected state, not a bug.
    const deck: CompositionDeckFile = {
      stage: 2,
      cards: deriveFullDeck({ storyMissions, bankTopics, moveRealizations: moduleJson.moveRealizations }),
    };
    const issues = checkDeckComposition(deck, FULL_DECK_COMPOSITION);
    // odai is fully satisfied (10/10); every follow-move kind is short (1 of 3); every kind with
    // no real source is short by its full expected count.
    expect(issues.find((i) => i.kind === 'odai')).toBeUndefined();
    expect(issues).toContainEqual({ kind: 'follow-naze', expected: 3, actual: 1 });
    expect(issues).toContainEqual({ kind: 'himitsu', expected: 4, actual: 0 });
    expect(issues.find((i) => i.kind === 'blank')).toBeUndefined(); // 2/2 satisfied
  });
});
