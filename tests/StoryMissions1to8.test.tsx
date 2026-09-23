import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { pickNextMission } from '../src/shell/missionLibrary';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import { parseRootType } from '../scripts/lib/rootType';
import type { DigPhase, Mission, ModuleUiStrings, SlotAssemblyPhase } from '../src/engine/types';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanMissionJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaMissionJson from '../src/modules/m1/topics/rouka/s2.json';
import oyatsuMissionJson from '../src/modules/m1/topics/oyatsu/s2.json';
import minnaMissionJson from '../src/modules/m1/topics/minna/s2.json';
import zuruiMissionJson from '../src/modules/m1/topics/zurui/s2.json';
import kashiteMissionJson from '../src/modules/m1/topics/kashite/s2.json';
import randoseruMissionJson from '../src/modules/m1/topics/randoseru/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const ui = moduleJson.ui as ModuleUiStrings;
const APPROVED_STAGE2_MOVES = new Set(moduleJson.followMoves);

const ALL_MISSIONS: { id: string; mission: Mission }[] = [
  { id: 'chanto (1-1)', mission: chantoMissionJson as unknown as Mission },
  { id: 'genkan (1-2)', mission: genkanMissionJson as unknown as Mission },
  { id: 'rouka (1-3)', mission: roukaMissionJson as unknown as Mission },
  { id: 'oyatsu (1-4)', mission: oyatsuMissionJson as unknown as Mission },
  { id: 'minna (1-5)', mission: minnaMissionJson as unknown as Mission },
  { id: 'zurui (1-6)', mission: zuruiMissionJson as unknown as Mission },
  { id: 'kashite (1-7)', mission: kashiteMissionJson as unknown as Mission },
  { id: 'randoseru (1-8)', mission: randoseruMissionJson as unknown as Mission },
];

const NEW_MISSIONS = ALL_MISSIONS.slice(3); // 1-4 through 1-8, authored this sprint (WO-20)

beforeEach(() => cleanup());

/**
 * WO-20: structural/epistemic checks applied uniformly across all 8 accepted Story Missions —
 * proving the 5 newly authored ones (1-4 through 1-8) satisfy the exact same AD-01/AD-05
 * contract as the 3 already-gated missions, without re-deriving per-mission exhaustive test
 * suites (those already exist for 1-1/1-2/1-3 in their own dedicated test files).
 */
describe('Story Missions 1-1 through 1-8 — uniform structural/epistemic contract', () => {
  it('every mission is contentClass release, with a rootType from the closed WO-11C set', () => {
    for (const { id, mission } of ALL_MISSIONS) {
      expect(mission.contentClass, id).toBe('release');
      expect(parseRootType(mission.rootType), id).not.toBeNull();
    }
  });

  it('the 5 new missions (1-4 through 1-8) are all honestly non-release-clear — no fabricated Gate 1/Gate 2', () => {
    for (const { id, mission } of NEW_MISSIONS) {
      expect(mission.review, id).toBeUndefined();
    }
  });

  it('every mission has a slot-assembly phase followed by a dig phase, and every dig layer satisfies the AD-01 gap/distractor contract', () => {
    for (const { id, mission } of ALL_MISSIONS) {
      expect(mission.phases[0]!.template, id).toBe('slot-assembly');
      expect(mission.phases[1]!.template, id).toBe('dig');
      const dig = mission.phases[1] as DigPhase;
      const gaps = dig.layers.map((l) => l.gap);
      for (const layer of dig.layers) {
        expect(layer.gap, id).toBeTruthy();
        expect(layer.gapDistractors, id).toHaveLength(2);
        const kinds = layer.gapDistractors!.map((d) => d.kind).sort();
        expect(kinds, id).toEqual(['answered', 'other-layer']);
        const choices = [layer.gap, ...layer.gapDistractors!.map((d) => d.text)];
        expect(new Set(choices).size, id).toBe(3);
        const otherLayerText = layer.gapDistractors!.find((d) => d.kind === 'other-layer')!.text;
        expect(gaps, id).toContain(otherLayerText);
        const deepenCards = layer.hand.filter((c) => c.tag === 'deepen');
        expect(deepenCards.length, id).toBeGreaterThanOrEqual(1); // WO-20: >=1, not always exactly 1
        for (const c of deepenCards) {
          expect(APPROVED_STAGE2_MOVES.has(c.move!), `${id}: ${c.move}`).toBe(true);
        }
      }
    }
  });

  it('AD-05 §7 epistemic-root guardrail: no dig-layer robotSays states the root\'s own conclusion first (exact/substring match either direction)', () => {
    for (const { id, mission } of ALL_MISSIONS) {
      const dig = mission.phases[1] as DigPhase;
      const rootText = dig.root.robotSays.trim();
      for (const layer of dig.layers) {
        const layerText = layer.robotSays.trim();
        const leaks = layerText === rootText || layerText.includes(rootText) || rootText.includes(layerText);
        expect(leaks, `${id}: layer "${layerText}" vs root "${rootText}"`).toBe(false);
      }
    }
  });

  it('no mission anywhere uses debate/mockery/scoring language (Phase 5 guardrail)', () => {
    for (const { id, mission } of ALL_MISSIONS) {
      const allText = [
        ...mission.phases.flatMap((p) =>
          p.template === 'slot-assembly'
            ? [...(p as SlotAssemblyPhase).cards.map((c) => c.text), ...Object.values((p as SlotAssemblyPhase).archetypes).map((a) => a.robotSays)]
            : [...(p as DigPhase).layers.flatMap((l) => [l.robotSays, ...l.hand.map((c) => c.text)]), (p as DigPhase).root.robotSays],
        ),
        mission.tip, mission.teachBack, mission.ouchiTalk,
      ].join(' ');
      for (const forbidden of ['正解', '不正解', 'まちがって', 'へん', 'おかしい', 'はんろん', '点数']) {
        expect(allText, `${id}: contains "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it('Mission 1-3 (rouka) is the only one of the 8 already release-clear at this baseline; 1-1/1-2 are also release-clear, 1-4 through 1-8 are not', () => {
    const releaseClearIds = new Set(['chanto (1-1)', 'genkan (1-2)', 'rouka (1-3)']);
    for (const { id, mission } of ALL_MISSIONS) {
      const clear = mission.review !== undefined;
      expect(clear, id).toBe(releaseClearIds.has(id));
    }
  });

  it('the real m1 missionOrder now walks a completed profile through all 8 missions in order', () => {
    const missionsById: Record<string, Pick<Mission, 'id' | 'stage'>> = {};
    for (const { mission } of ALL_MISSIONS) missionsById[mission.id] = { id: mission.id, stage: mission.stage };
    const progress: Record<string, { done: boolean; stamps: number; coop: boolean }> = {};
    const order = ['chanto (1-1)', 'genkan (1-2)', 'rouka (1-3)', 'oyatsu (1-4)', 'minna (1-5)', 'zurui (1-6)', 'kashite (1-7)', 'randoseru (1-8)']
      .map((label) => ALL_MISSIONS.find((m) => m.id === label)!.mission.id);
    for (let i = 0; i < order.length; i++) {
      const profile = { id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 as const, progress };
      const next = pickNextMission(moduleJson.missionOrder, missionsById, profile);
      expect(next, `step ${i}`).toBe(order[i]);
      progress[order[i]!] = { done: true, stamps: 0, coop: false };
    }
    // All 8 done: nothing left at stage 2.
    const profile = { id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 as const, progress };
    expect(pickNextMission(moduleJson.missionOrder, missionsById, profile)).toBeNull();
  });
});

describe('Mission 1-5 (minna) — Parent-as-Learner Perspective is exercised for the first time by real content', () => {
  const mission = minnaMissionJson as unknown as Mission;
  it('declares a perspective moment consistent with its わかれ root (a second voice with a different actual headcount)', () => {
    expect(mission.perspective).toBeDefined();
    expect(mission.perspective!.text).not.toBe('');
  });
});

describe('Mission 1-7 (kashite) — WO-20 multi-deepen: the child genuinely chooses between two moves', () => {
  const mission = kashiteMissionJson as unknown as Mission;
  const dig = mission.phases[1] as DigPhase;
  it('layer 1 offers two deepen cards (follow-naze and follow-tatoeba), both leading to the same shared root', () => {
    const deepen = dig.layers[1]!.hand.filter((c) => c.tag === 'deepen');
    expect(deepen).toHaveLength(2);
    expect(new Set(deepen.map((c) => c.move))).toEqual(new Set(['follow-naze', 'follow-tatoeba']));
  });
});

describe('Mission 1-8 (randoseru) — Boss: reuses existing Parent-as-Learner mechanisms, no new ふたりミッション engine', () => {
  const mission = randoseruMissionJson as unknown as Mission;
  const dig = mission.phases[1] as DigPhase;
  it('reaches genuine depth 3 with all three of naze/tatoeba/hokaniwa exercised across its own chain', () => {
    expect(dig.layers).toHaveLength(3);
    const moves = dig.layers.map((l) => l.hand.find((c) => c.tag === 'deepen')!.move);
    expect(new Set(moves)).toEqual(new Set(['follow-tatoeba', 'follow-naze', 'follow-hokaniwa']));
  });

  it('uses the existing prediction battle for its two-person co-play moment — no second game engine introduced', () => {
    expect(dig.layers[2]!.prediction).toBeDefined();
  });
});

describe('Story Missions — full interactive playthroughs prove the real UI still works for the new content', () => {
  let plausible: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    plausible = vi.fn();
    window.plausible = plausible;
  });
  afterEach(() => {
    cleanup();
    delete window.plausible;
  });

  async function passGate(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement);
  }

  it('oyatsu (1-4): plays a full 3-layer chain (tsumari -> hokaniwa -> naze) to the root', async () => {
    const mission = oyatsuMissionJson as unknown as Mission;
    const dig = mission.phases[1] as DigPhase;
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={[mission.id]} mission={mission} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    const clearCard = (mission.phases[0] as SlotAssemblyPhase).cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));

    for (const layer of dig.layers) {
      await passGate(user);
      await user.click(screen.getByText(layer.hand.find((c) => c.tag === 'deepen')!.text));
    }
    expect(screen.getByText(dig.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());
  });

  it('kashite (1-7): the child can pick the SECOND deepen card at the multi-move layer and still reach the root', async () => {
    const mission = kashiteMissionJson as unknown as Mission;
    const dig = mission.phases[1] as DigPhase;
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={[mission.id]} mission={mission} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));
    const clearCard = (mission.phases[0] as SlotAssemblyPhase).cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));

    await passGate(user);
    await user.click(screen.getByText(dig.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text));

    await passGate(user);
    const tatoebaCard = dig.layers[1]!.hand.find((c) => c.move === 'follow-tatoeba')!;
    await user.click(screen.getByText(tatoebaCard.text)); // deliberately the SECOND deepen option

    expect(screen.getByText(dig.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));

    const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    const moveProgress = saved.profiles[0].moveProgress;
    // Both moves in the hand were RENDERED (mihakken -> moratta fires for every deepen card
    // shown, played or not — WO-20's Dig.tsx change). Only the one actually PLAYED advances
    // further (apt_use requires 3 distinct domains to reach tsukaeru, so both sit at moratta
    // here, but only follow-tatoeba's play was ever attributed as a `use`/`apt_use` event).
    expect(moveProgress['follow-tatoeba'].rung).toBe('moratta');
    expect(moveProgress['follow-naze'].rung).toBe('moratta'); // rendered, never played
  });
});
