import { describe, it, expect } from 'vitest';
import { storyState, bankState } from '../src/shell/progression';
import type { Mission } from '../src/engine/types';
import type { Progress } from '../src/engine/storage';
import chanto from '../src/modules/m1/topics/chanto/s2.json';
import genkan from '../src/modules/m1/topics/genkan/s2.json';
import rouka from '../src/modules/m1/topics/rouka/s2.json';
import oyatsu from '../src/modules/m1/topics/oyatsu/s2.json';
import minna from '../src/modules/m1/topics/minna/s2.json';
import zurui from '../src/modules/m1/topics/zurui/s2.json';
import kashite from '../src/modules/m1/topics/kashite/s2.json';
import randoseru from '../src/modules/m1/topics/randoseru/s2.json';
import bankAtode from '../src/modules/m1/topics/bank-atode/s2.json'; // B01, root: わかれ
import bankEscalator from '../src/modules/m1/topics/bank-escalator/s2.json'; // B02, root: めあて
import bankJanken from '../src/modules/m1/topics/bank-janken/s2.json'; // B03, root: めあて
import bankTeam from '../src/modules/m1/topics/bank-team/s2.json'; // B04, root: わかれ
import bankGakunen from '../src/modules/m1/topics/bank-gakunen/s2.json'; // B05, root: めあて
import bankNedan from '../src/modules/m1/topics/bank-nedan/s2.json'; // B06, root: わかれ
import bankKirei from '../src/modules/m1/topics/bank-kirei/s2.json'; // B07, root: めあて
import bankHoshii from '../src/modules/m1/topics/bank-hoshii/s2.json'; // B08, root: わかれ
import bankKotoba from '../src/modules/m1/topics/bank-kotoba/s2.json'; // B09, root: わかれ
import bankItadakimasu from '../src/modules/m1/topics/bank-itadakimasu/s2.json'; // B10, root: めあて
import bankArigatou from '../src/modules/m1/topics/bank-arigatou/s2.json'; // B11, root: めあて
import bankYen from '../src/modules/m1/topics/bank-100yen/s2.json'; // B12, root: めあて

const storyMissionsInOrder = [chanto, genkan, rouka, oyatsu, minna, zurui, kashite, randoseru]
  .map((m) => m as unknown as Mission);

const BANKS = {
  B01: bankAtode, B02: bankEscalator, B03: bankJanken, B04: bankTeam, B05: bankGakunen,
  B06: bankNedan, B07: bankKirei, B08: bankHoshii, B09: bankKotoba, B10: bankItadakimasu,
  B11: bankArigatou, B12: bankYen,
};

function doneUpTo(count: number): Record<string, Progress> {
  const progress: Record<string, Progress> = {};
  for (let i = 0; i < count; i++) {
    progress[storyMissionsInOrder[i]!.id] = { done: true, stamps: 0, coop: false };
  }
  return progress;
}

describe('storyState — sequential CURRENT/COMPLETED/LOCKED (WO-26 §3.1/§7)', () => {
  it('the current mission is CURRENT, a completed one is COMPLETED, anything ahead is LOCKED', () => {
    const progress = doneUpTo(2); // chanto, genkan done; rouka is current
    expect(storyState(chanto.id, progress, rouka.id)).toBe('completed');
    expect(storyState(genkan.id, progress, rouka.id)).toBe('completed');
    expect(storyState(rouka.id, progress, rouka.id)).toBe('current');
    expect(storyState(oyatsu.id, progress, rouka.id)).toBe('locked'); // ahead — never freely enterable
    expect(storyState(randoseru.id, progress, rouka.id)).toBe('locked');
  });
});

describe('bankState — per-bank rootType/move prerequisite, floored at Story 1-4 (Architect\'s final correction on the Blueprint Alignment Cleanup)', () => {
  it('all 12 Bank Digs stay LOCKED through Story 1-3 — the Bank section itself is not yet visible', () => {
    const afterStory3 = doneUpTo(3); // chanto, genkan, rouka done; oyatsu (1-4) not yet
    for (const bank of Object.values(BANKS)) {
      expect(bankState(bank as unknown as Mission, storyMissionsInOrder, afterStory3), bank.id).toBe('locked');
    }
  });

  it('the 7 めあて Bank Digs (B02/B03/B05/B07/B10/B11/B12) become AVAILABLE the instant Story 1-4 (oyatsu) is done — their real prerequisite (Story 1-3) already resolved, so the section-visibility floor is what actually binds', () => {
    const meateGroup = ['B02', 'B03', 'B05', 'B07', 'B10', 'B11', 'B12'] as const;
    const afterStory4 = doneUpTo(4);
    for (const id of meateGroup) {
      expect(bankState(BANKS[id] as unknown as Mission, storyMissionsInOrder, afterStory4), id).toBe('available');
    }
  });

  it('the 5 わかれ Bank Digs (B01/B04/B06/B08/B09) stay LOCKED at Story 1-4 and only become AVAILABLE once Story 1-5 (minna) — the first Story with a わかれ root — is done', () => {
    const wakareGroup = ['B01', 'B04', 'B06', 'B08', 'B09'] as const;
    const afterStory4 = doneUpTo(4);
    const afterStory5 = doneUpTo(5);
    for (const id of wakareGroup) {
      expect(bankState(BANKS[id] as unknown as Mission, storyMissionsInOrder, afterStory4), id).toBe('locked');
      expect(bankState(BANKS[id] as unknown as Mission, storyMissionsInOrder, afterStory5), id).toBe('available');
    }
  });

  it('fails open (available) when no Story spine is supplied at all — nothing to gate against', () => {
    const bank = BANKS.B01 as unknown as Mission;
    expect(bankState(bank, [], {})).toBe('available');
  });

  it('no bank is available on a fresh profile (nothing completed yet)', () => {
    for (const bank of Object.values(BANKS)) {
      expect(bankState(bank as unknown as Mission, storyMissionsInOrder, {})).toBe('locked');
    }
  });

  it('a completed Bank Dig stays COMPLETED even if somehow replayed before Story 1-4 re-resolves', () => {
    const progress: Record<string, Progress> = { [bankAtode.id]: { done: true, stamps: 1, coop: false } };
    expect(bankState(bankAtode as unknown as Mission, storyMissionsInOrder, progress)).toBe('completed');
  });

  it('all 12 Bank Digs are AVAILABLE once every Story Mission is complete', () => {
    const progress = doneUpTo(8);
    for (const bank of Object.values(BANKS)) {
      const state = bankState(bank as unknown as Mission, storyMissionsInOrder, progress);
      expect(state === 'available' || state === 'completed').toBe(true);
    }
  });

  it('gates on the last Story when the supplied spine has fewer than 4 missions — never throws, never opens early', () => {
    const shortSpine = storyMissionsInOrder.slice(0, 2); // chanto, genkan only
    const bank = BANKS.B01 as unknown as Mission;
    expect(bankState(bank, shortSpine, {})).toBe('locked');
    const progress: Record<string, Progress> = { [shortSpine[1]!.id]: { done: true, stamps: 0, coop: false } };
    expect(bankState(bank, shortSpine, progress)).toBe('available');
  });
});
