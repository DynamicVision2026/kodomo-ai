import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { pickNextMission } from '../src/shell/missionLibrary';
import { parseRootType } from '../scripts/lib/rootType';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanMissionJson from '../src/modules/m1/topics/genkan/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const genkanMission = genkanMissionJson as unknown as Mission;
const chantoMission = chantoMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const digPhase = genkanMission.phases[1] as DigPhase;
const APPROVED_STAGE2_MOVES = new Set(moduleJson.followMoves);

/**
 * WO-13: Mission 1-2「玄関で くつを ぬぐ」 — the second real release-content vertical slice from
 * the commissioned AD-04 v1 library, replacing ice (now archived, WO-11) as the mission that
 * occupies id "m1-s2-1-2". Extends the skill from Mission 1-1 (an answer can contain an unclear
 * word) into: an answer can sound reasonable and still be incomplete when a familiar example
 * (here: new/clean shoes still get removed) doesn't fit it. These tests prove it is reachable,
 * fully playable, that its chain genuinely exercises たとえば (primary) and つまり (secondary),
 * that the counterexample is structurally load-bearing (not decorative), that no universal
 * cultural claim is asserted, and that Mission 1-1 is completely unaffected.
 */
describe('genkan (1-2) — release classification and rootType contract', () => {
  it('is classified release, and carries no fabricated approval (Gate 1/Gate 2 both pending)', () => {
    expect(genkanMission.contentClass).toBe('release');
    expect(genkanMission.review).toBeUndefined();
  });

  it('declares a rootType from the closed WO-11C set (めあて), not an invented fourth value', () => {
    expect(parseRootType(genkanMission.rootType)).toBe('めあて');
  });
});

describe('genkan (1-2) — structure (AD-01 gap/distractor contract, accepted move vocabulary)', () => {
  it('has one slot-assembly phase (たのむ) and one dig phase (ほる) with exactly 2 layers', () => {
    expect(genkanMission.phases).toHaveLength(2);
    expect(genkanMission.phases[0]!.template).toBe('slot-assembly');
    expect(genkanMission.phases[1]!.template).toBe('dig');
    expect(digPhase.layers).toHaveLength(2);
  });

  it('every layer satisfies the AD-01 gap/distractor contract', () => {
    for (const layer of digPhase.layers) {
      expect(layer.gap).toBeTruthy();
      expect(layer.gapDistractors).toHaveLength(2);
      const kinds = layer.gapDistractors!.map((d) => d.kind).sort();
      expect(kinds).toEqual(['answered', 'other-layer']);
      const deepenCards = layer.hand.filter((c) => c.tag === 'deepen');
      expect(deepenCards).toHaveLength(1);
      const choices = [layer.gap, ...layer.gapDistractors!.map((d) => d.text)];
      expect(new Set(choices).size).toBe(3);
    }
  });

  it('distractors stay inside the same chain — every other-layer distractor matches another layer\'s own target gap verbatim', () => {
    const gaps = digPhase.layers.map((l) => l.gap);
    for (const layer of digPhase.layers) {
      const otherLayerText = layer.gapDistractors!.find((d) => d.kind === 'other-layer')!.text;
      expect(gaps).toContain(otherLayerText);
    }
  });

  it('たとえば is the primary move (layer 0) and つまり is the secondary move (layer 1), per AD-04 — no other/unsupported move', () => {
    const layer0Deepen = digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!;
    const layer1Deepen = digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!;
    expect(layer0Deepen.move).toBe('follow-tatoeba');
    expect(layer1Deepen.move).toBe('follow-tsumari');
    for (const layer of digPhase.layers) {
      const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
      expect(APPROVED_STAGE2_MOVES.has(deepen.move!)).toBe(true);
    }
  });
});

describe('genkan (1-2) — the counterexample is child-owned and structurally necessary, not decorative', () => {
  it('layer 0\'s shallow "dirty" answer opens the gap that new/clean shoes create ("え？"), and たとえば is literally what surfaces it', () => {
    expect(digPhase.layers[0]!.robotSays).toContain('よごれている');
    expect(digPhase.layers[0]!.gap).toContain('新しい'); // AD-05: あたらしい -> 新しい (kanji floor)
    const deepen = digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!;
    expect(deepen.text).toContain('新しい'); // たとえば？ asks specifically about the counterexample
  });

  it('layer 1 confirms the counterexample is real (new shoes ARE removed too), which is what makes "dirty alone" insufficient', () => {
    expect(digPhase.layers[1]!.robotSays).toContain('新しいくつも');
    expect(digPhase.layers[1]!.gap).toContain('よごれてない'); // the gap only exists because the counterexample was confirmed
  });

  it('the root deepens the そと／うち boundary — categorized by where a shoe is used, not by how clean it looks — and never lands on rule-obedience ("きまり"/"きめて") or moralizes into 「だから、くつをぬごう」', () => {
    // Gate 1 correction: the root must answer "why are even clean/new shoes removed?" with a
    // boundary insight (shoes used outside belong to a separate category from the inside),
    // explicitly ties back to the counterexample ("新しくても"), and must NOT terminate the
    // inquiry with rule-authority language ("it's the rule") — that was the exact defect flagged.
    // AD-05 (WO-14) migration: あたらしい/そと are now written with their kanji floor forms
    // (新しい/外) — the underlying claim is unchanged, only the register/orthography moved.
    expect(digPhase.root.robotSays).toContain('新しくても'); // ties back to the counterexample
    expect(digPhase.root.robotSays).toContain('外で'); // the categorization is about where it's used...
    expect(digPhase.root.robotSays).toContain('べつ'); // ...kept separate from the inside (a boundary, not a verdict)
    expect(digPhase.root.robotSays).not.toContain('きまり');
    expect(digPhase.root.robotSays).not.toContain('きめて');
    expect(digPhase.root.robotSays).not.toContain('だから');
    expect(digPhase.root.robotSays).not.toContain('ぬごう');
    // Not a bare repeat of the "dirty" reason as if it were now proven sufficient.
    expect(digPhase.root.robotSays).not.toBe(digPhase.layers[0]!.robotSays);
  });

  it('tip/teachBack/おうちトーク reinforce the transferable skill — たとえば？ as a test of whether an answer covers every known case — not "rules have many reasons" or "question household rules"', () => {
    expect(genkanMission.tip).toContain('たとえば');
    expect(genkanMission.teachBack).toContain('たとえば');
    expect(genkanMission.ouchiTalk).toContain('たとえば');
    for (const forbidden of ['きまり', 'ただしい', 'まちがって']) {
      expect(genkanMission.tip).not.toContain(forbidden);
      expect(genkanMission.teachBack).not.toContain(forbidden);
      expect(genkanMission.ouchiTalk).not.toContain(forbidden);
    }
  });

  it('never asserts a single universal cultural reason, and never frames the practice, adults, or schools as wrong', () => {
    const allText = [
      ...genkanMission.phases.flatMap((p) =>
        p.template === 'slot-assembly'
          ? [...p.cards.map((c) => c.text), ...Object.values(p.archetypes).map((a) => a.robotSays)]
          : [...p.layers.flatMap((l) => [l.robotSays, ...l.hand.map((c) => c.text)]), p.root.robotSays],
      ),
      genkanMission.tip, genkanMission.teachBack, genkanMission.ouchiTalk,
    ].join(' ');
    // No "the one true reason" / universal-cultural-claim phrasing, and no rule-challenging or
    // argument-winning vocabulary (same guard as chanto's own mission-level check).
    for (const forbidden of ['ほんとうのりゆう', 'にほんじんは', 'まちがって', 'だめ', 'へん', 'おかしい']) {
      expect(allText).not.toContain(forbidden);
    }
  });
});

describe('genkan (1-2) — reachable through the real m1 mission library, second after chanto', () => {
  it('is the mission a Stage-2 profile reaches once Mission 1-1 (chanto) is done, via the real missionOrder', () => {
    const missions: Record<string, Pick<Mission, 'id' | 'stage'>> = {
      [chantoMission.id]: { id: chantoMission.id, stage: chantoMission.stage },
      [genkanMission.id]: { id: genkanMission.id, stage: genkanMission.stage },
    };
    const profile = {
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 as const,
      progress: { [chantoMission.id]: { done: true, stamps: 0, coop: false } },
    };
    const next = pickNextMission(moduleJson.missionOrder, missions, profile);
    expect(next).toBe(genkanMission.id);
  });
});

describe('genkan (1-2) — playable end to end (たのむ -> ほる -> wrapper screens), honest milestone/growth evidence', () => {
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

  it('これでOK？ cannot be bypassed and Gap Naming is mandatory at both layers; the mission plays from the たのむ slot card through to ねっこ, teach-back, and おうちトーク', async () => {
    const user = userEvent.setup();
    render(
      // freeMissionIds scoped to genkan's own id for this isolated single-mission playthrough
      // (same approach as IceTopic.test.tsx) — moduleJson.freeMissionIds only lists chanto
      // (mission 1-1); in the real app, genkan is reached via progression/entitlement, not as
      // a free mission on its own, which is correct production behavior, not a test bug.
      <MissionShell
        moduleId="m1" freeMissionIds={[genkanMission.id]} mission={genkanMission}
        ui={ui} followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );

    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await user.click(screen.getByText(ui.coopSolo));

    const clearCard = (genkanMission.phases[0]! as Extract<typeof genkanMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));

    expect(screen.getByText(digPhase.layers[0]!.robotSays)).toBeInTheDocument();
    expect(screen.queryByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text)).not.toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text));

    expect(screen.getByText(digPhase.layers[1]!.robotSays)).toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!.text));

    expect(screen.getByText(digPhase.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());

    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    expect(screen.getByText(genkanMission.teachBack)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // teach-back -> おうちトーク
    expect(screen.getByText(genkanMission.ouchiTalk)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // -> handoff
    await user.click(screen.getByText(ui.handoffContinue)); // -> parent
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    const profile = saved.profiles[0];
    expect(profile.progress[genkanMission.id].done).toBe(true);
    expect(profile.milestones.M1).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    expect(profile.milestones.M3).toBeUndefined(); // genuine 2-layer chain, not overclaimed

    const tatoeba = screen.getByText(moduleJson.cardTypes['follow-tatoeba'].label).closest('.toolbox__tool')!;
    expect(tatoeba.className).toContain('toolbox__tool--obtained');
    const tsumari = screen.getByText(moduleJson.cardTypes['follow-tsumari'].label).closest('.toolbox__tool')!;
    expect(tsumari.className).toContain('toolbox__tool--obtained');

    expect(profile.m2Evidence.proxyMissionIds).toEqual([genkanMission.id]);
    expect(profile.milestones.M2).toBeUndefined();
  });
});
