import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import { pickNextMission } from '../src/shell/missionLibrary';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import iceMissionJson from '../src/modules/m1/topics/ice/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const iceMission = iceMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const digPhase = iceMission.phases[0] as DigPhase;
const APPROVED_STAGE2_MOVES = new Set(moduleJson.followMoves); // なぜ？/たとえば？/つまり？/ほかには？

/**
 * WO-10: the second real Stage-2 depth-3 topic (こおりは なぜ みずに うくの？), added under the
 * existing m1 module to prove the accepted v0.6 architecture generalizes beyond bread and to
 * make the M3 three-chain milestone reachable through real release content. structural lint
 * (pipeline/04_lint.ts) already enforces the schema/kanji/AD-01 mechanics for this file exactly
 * as it does for bread; these tests prove it is actually reachable, playable, and that
 * completing it triggers milestones the same way any other real content would.
 */
describe('ice topic — structure (Three-Layer Contract, AD-01, accepted move vocabulary)', () => {
  it('has exactly one dig phase with exactly 3 layers — no slot-assembly, no extra layers', () => {
    expect(iceMission.phases).toHaveLength(1);
    expect(iceMission.phases[0]!.template).toBe('dig');
    expect(digPhase.layers).toHaveLength(3);
  });

  it('every layer satisfies the AD-01 gap/distractor contract', () => {
    for (const layer of digPhase.layers) {
      expect(layer.gap).toBeTruthy();
      expect(layer.gapDistractors).toHaveLength(2);
      const kinds = layer.gapDistractors!.map((d) => d.kind).sort();
      expect(kinds).toEqual(['answered', 'other-layer']);
      // Exactly one deepen card per hand (04_lint.ts's own rule, re-asserted here at the
      // content level rather than only trusting the lint run).
      const deepenCards = layer.hand.filter((c) => c.tag === 'deepen');
      expect(deepenCards).toHaveLength(1);
      // Three plausible but distinguishable choices within this layer.
      const choices = [layer.gap, ...layer.gapDistractors!.map((d) => d.text)];
      expect(new Set(choices).size).toBe(3);
    }
  });

  it('distractors stay inside the same chain — every other-layer distractor matches another layer\'s own target gap verbatim', () => {
    const gaps = digPhase.layers.map((l) => l.gap);
    for (const layer of digPhase.layers) {
      const otherLayerText = layer.gapDistractors!.find((d) => d.kind === 'other-layer')!.text;
      expect(gaps).toContain(otherLayerText); // a real gap elsewhere in this same chain, not invented
    }
  });

  it('uses only the accepted Stage-2 move vocabulary (なぜ？/たとえば？/つまり？/ほかには？) — no new moves', () => {
    for (const layer of digPhase.layers) {
      const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
      expect(deepen.move).toBeTruthy();
      expect(APPROVED_STAGE2_MOVES.has(deepen.move!)).toBe(true);
    }
  });

  it('forms one continuous chain toward the root, not three unrelated questions', () => {
    // Layer 0's answer asserts ice is lighter, without explaining why — that's exactly layer 0's
    // own gap, which layer 1's answer (the gap-forming mechanism) then addresses.
    expect(digPhase.layers[0]!.robotSays).toContain('かるい');
    expect(digPhase.layers[0]!.gap).toContain('かるい');
    // Layer 1's answer explains why ice expands, but not yet why expanding means floating —
    // that open question is layer 1's own gap, addressed one step further by layer 2's answer
    // (same-weight/same-size comparison), whose own gap ("why does being lighter mean it
    // floats") is finally what the root answers.
    expect(digPhase.layers[2]!.gap).toContain('うくのか');
    expect(digPhase.root.robotSays).toContain('うくから');
  });
});

describe('ice topic — reachable through the real m1 mission library', () => {
  it('is the next mission a Stage-2 profile reaches once bread is done, via the real missionOrder', () => {
    // Same construction as src/main.tsx: missionOrder + every mission this bundle ships, keyed
    // by id. Not a synthetic id list — moduleJson.missionOrder is the actual production data.
    const breadId = 'm1-s2-1-1';
    const missions: Record<string, Pick<Mission, 'id' | 'stage'>> = {
      [breadId]: { id: breadId, stage: 2 },
      [iceMission.id]: { id: iceMission.id, stage: iceMission.stage },
    };
    const profile = {
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 as const,
      progress: { [breadId]: { done: true, stamps: 0, coop: false } },
    };
    const next = pickNextMission(moduleJson.missionOrder, missions, profile);
    expect(next).toBe(iceMission.id);
  });
});

describe('ice topic — playable end to end, and completing it triggers the existing M3 mechanism', () => {
  beforeEach(() => cleanup());

  async function passGate(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement);
  }

  it('the これでOK？ -> Gap Naming -> follow-up -> deeper answer loop works unchanged across all 3 layers, and completing the mission achieves M3 (real 3-layer content, not the synthetic WO-08 fixture)', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={[iceMission.id]} mission={iceMission} ui={ui}
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

    // Layer 0: gate -> Gap Naming -> the layer's own deepen card.
    expect(screen.getByText(ui.judgeNotEnough)).toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text));

    // Layer 1: same loop again, on the deeper answer.
    expect(screen.getByText(digPhase.layers[1]!.robotSays)).toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!.text));

    // Layer 2 — the third layer, proving the chain actually has 3 real steps, not 2.
    expect(screen.getByText(digPhase.layers[2]!.robotSays)).toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[2]!.hand.find((c) => c.tag === 'deepen')!.text));

    // ねっこ reached — the mission's own root payoff.
    expect(screen.getByText(digPhase.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));

    const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved.profiles[0].milestones.M3).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    expect(saved.profiles[0].memories.first_three_chain).toEqual({
      kind: 'first_three_chain', recordedAt: expect.any(Number), missionId: iceMission.id,
    });
  });
});
