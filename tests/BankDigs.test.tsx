import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import { parseRootType } from '../scripts/lib/rootType';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
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

const ui = moduleJson.ui as ModuleUiStrings;
const APPROVED_STAGE2_MOVES = new Set(moduleJson.followMoves);
const APPROVED_ROOT_TYPES = new Set(['めあて', 'わかれ']); // AD-04: 0 しくみ across the Bank library

const BANK: { id: string; mission: Mission }[] = [
  { id: 'B01', mission: b01 as unknown as Mission },
  { id: 'B02', mission: b02 as unknown as Mission },
  { id: 'B03', mission: b03 as unknown as Mission },
  { id: 'B04', mission: b04 as unknown as Mission },
  { id: 'B05', mission: b05 as unknown as Mission },
  { id: 'B06', mission: b06 as unknown as Mission },
  { id: 'B07', mission: b07 as unknown as Mission },
  { id: 'B08', mission: b08 as unknown as Mission },
  { id: 'B09', mission: b09 as unknown as Mission },
  { id: 'B10', mission: b10 as unknown as Mission },
  { id: 'B11', mission: b11 as unknown as Mission },
  { id: 'B12', mission: b12 as unknown as Mission },
];

beforeEach(() => cleanup());

/**
 * WO-20 Phase 3: the 12 accepted AD-04 Bank-12 topics (docs/AD-04-bank-topics.md). Each is a
 * single dig-phase mission (no slot-assembly opening — spec v0.5 §4.3: "dig phase only"),
 * structurally proven playable directly through the existing MissionShell/Dig components with
 * zero engine changes.
 */
describe('Bank Digs B01-B12 — uniform structural/epistemic contract (AD-04)', () => {
  it('every topic is contentClass release, dig-phase only (no slot-assembly), stage 2', () => {
    for (const { id, mission } of BANK) {
      expect(mission.contentClass, id).toBe('release');
      expect(mission.stage, id).toBe(2);
      expect(mission.phases, id).toHaveLength(1);
      expect(mission.phases[0]!.template, id).toBe('dig');
    }
  });

  it('every topic\'s rootType is めあて or わかれ, never しくみ — the accepted AD-04 Bank-library distribution (7 めあて, 5 わかれ here)', () => {
    const counts: Record<string, number> = {};
    for (const { id, mission } of BANK) {
      expect(parseRootType(mission.rootType), id).not.toBeNull();
      expect(APPROVED_ROOT_TYPES.has(mission.rootType!), id).toBe(true);
      counts[mission.rootType!] = (counts[mission.rootType!] ?? 0) + 1;
    }
    expect(counts['めあて']).toBe(7);
    expect(counts['わかれ']).toBe(5);
  });

  it('none is release-clear yet — every topic honestly has no `review` stamp (Gate 2 pending)', () => {
    for (const { id, mission } of BANK) {
      expect(mission.review, id).toBeUndefined();
    }
  });

  it('every dig layer satisfies the AD-01 gap/distractor contract and uses only approved moves', () => {
    for (const { id, mission } of BANK) {
      const dig = mission.phases[0] as DigPhase;
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
        expect(deepenCards.length, id).toBeGreaterThanOrEqual(1);
        for (const c of deepenCards) expect(APPROVED_STAGE2_MOVES.has(c.move!), `${id}: ${c.move}`).toBe(true);
      }
    }
  });

  it('AD-05 §7 epistemic-root guardrail holds for every topic', () => {
    for (const { id, mission } of BANK) {
      const dig = mission.phases[0] as DigPhase;
      const rootText = dig.root.robotSays.trim();
      for (const layer of dig.layers) {
        const layerText = layer.robotSays.trim();
        const leaks = layerText === rootText || layerText.includes(rootText) || rootText.includes(layerText);
        expect(leaks, `${id}: layer vs root`).toBe(false);
      }
    }
  });

  it('no topic uses debate/mockery/scoring language', () => {
    for (const { id, mission } of BANK) {
      const dig = mission.phases[0] as DigPhase;
      const allText = [
        ...dig.layers.flatMap((l) => [l.robotSays, ...l.hand.map((c) => c.text)]),
        dig.root.robotSays, mission.tip, mission.teachBack, mission.ouchiTalk,
      ].join(' ');
      for (const forbidden of ['正解', '不正解', 'まちがって', 'へん', 'おかしい', 'はんろん', '点数']) {
        expect(allText, `${id}: contains "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it('B02/B05/B10/B12 carry the special-caution ids their facts.yaml documents (sanity check on which topics are which)', () => {
    expect(b02.title).toContain('エスカレーター');
    expect(b05.title).toContain('4月1日');
    expect(b10.title).toContain('いただきます');
    expect(b12.title).toContain('100円');
  });
});

describe('Bank Digs — full interactive playthroughs prove the real UI plays a slot-assembly-free mission correctly', () => {
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

  it('B01 「あとで」って、いつ？: starts straight at the dig layer (no たのむ slot-assembly screen) and reaches the root', async () => {
    const mission = b01 as unknown as Mission;
    const dig = mission.phases[0] as DigPhase;
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

    // Straight to the dig layer's own opening robotSays — no slot cards to pick.
    expect(screen.getByText(dig.layers[0]!.robotSays)).toBeInTheDocument();
    for (const layer of dig.layers) {
      await passGate(user);
      await user.click(screen.getByText(layer.hand.find((c) => c.tag === 'deepen')!.text));
    }
    expect(screen.getByText(dig.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());

    const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved.profiles[0].progress[mission.id].done).toBe(true);
    expect(saved.profiles[0].milestones.M1.achieved).toBe(true);
  });

  it('B12 ひろった100円は、だれのもの？: plays the moral-instruction-risk topic without any input/scoring surface', async () => {
    const mission = b12 as unknown as Mission;
    const dig = mission.phases[0] as DigPhase;
    const user = userEvent.setup();
    const { container } = render(
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

    for (const layer of dig.layers) {
      await passGate(user);
      await user.click(screen.getByText(layer.hand.find((c) => c.tag === 'deepen')!.text));
    }
    expect(screen.getByText(dig.root.robotSays)).toBeInTheDocument();
    expect(container.querySelectorAll('input, textarea, [contenteditable="true"]')).toHaveLength(0);
  });
});
