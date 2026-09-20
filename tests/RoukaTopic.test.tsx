import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { pickNextMission } from '../src/shell/missionLibrary';
import { parseRootType } from '../scripts/lib/rootType';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import genkanMissionJson from '../src/modules/m1/topics/genkan/s2.json';
import roukaMissionJson from '../src/modules/m1/topics/rouka/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const chantoMission = chantoMissionJson as unknown as Mission;
const genkanMission = genkanMissionJson as unknown as Mission;
const roukaMission = roukaMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const digPhase = roukaMission.phases[1] as DigPhase;
const APPROVED_STAGE2_MOVES = new Set(moduleJson.followMoves);

/** WO-16 correction: layer 2's and the root's robotSays now carry ruby markup ({曲|ま}がり角,
 *  {向|む}こう) — getByText can't match the raw JSON string (with its literal `{}` syntax)
 *  against what actually renders. See ChantoTopic.test.tsx's own byDigAnswerText for the full
 *  rationale (a ruby element's textContent is base+reading concatenated, not just the base).
 *  Matches on the .dig__answer paragraph's own rendered text using the longest plain (non-ruby)
 *  segment of the original string as the needle. */
function byDigAnswerText(rawMissionText: string) {
  const plainSegments = rawMissionText.split(/\{[^{}|]+\|[^{}|]+\}/);
  const needle = plainSegments.reduce((a, b) => (b.length > a.length ? b : a), '');
  return (_content: string, element: Element | null) =>
    element?.className === 'dig__answer' && needle.length > 0 && (element.textContent ?? '').includes(needle);
}

/**
 * WO-16: Mission 1-3「ろうかは 走らない」 — the first genuine 3-layer Stage-2 mission (occupying
 * "m1-s2-1-3"). Mission 1-1 (chanto) exercises つまり/たとえば and Mission 1-2 (genkan) exercises
 * たとえば/つまり; this mission introduces the two previously unexercised launch moves, なぜ
 * (layer 0) and ほかには (layer 1), and reuses つまり (layer 2) to reach the root. These tests
 * prove it is reachable third in the real missionOrder, that its 3-layer chain satisfies the
 * AD-01 gap/distractor contract at every layer, that it genuinely reaches depth 3 (and honestly
 * sets milestones.M3, unlike the 2-layer chanto/genkan chains), that the epistemic target (the
 * hallway's shared-space purpose) is earned through the chain rather than stated early by any
 * dig-layer robotSays, and that Gate 1 (Founder claim approval) and Gate 2 (native-speaker
 * review) are both genuinely absent, not fabricated.
 */
describe('rouka (1-3) — release classification and rootType contract', () => {
  it('is classified release, but carries neither a Gate 1 claim approval nor a Gate 2 review stamp — both human gates remain genuinely pending, not fabricated', () => {
    expect(roukaMission.contentClass).toBe('release');
    expect(roukaMission.review).toBeUndefined();
  });

  it('declares a rootType from the closed WO-11C set (めあて), not an invented fourth value', () => {
    expect(parseRootType(roukaMission.rootType)).toBe('めあて');
  });
});

describe('rouka (1-3) — structure (AD-01 gap/distractor contract, accepted move vocabulary, genuine depth 3)', () => {
  it('has one slot-assembly phase (たのむ) and one dig phase (ほる) with exactly 3 layers', () => {
    expect(roukaMission.phases).toHaveLength(2);
    expect(roukaMission.phases[0]!.template).toBe('slot-assembly');
    expect(roukaMission.phases[1]!.template).toBe('dig');
    expect(digPhase.layers).toHaveLength(3);
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

  it('distractors stay inside the same 3-layer chain — every other-layer distractor matches another layer\'s own target gap verbatim', () => {
    const gaps = digPhase.layers.map((l) => l.gap);
    for (const layer of digPhase.layers) {
      const otherLayerText = layer.gapDistractors!.find((d) => d.kind === 'other-layer')!.text;
      expect(gaps).toContain(otherLayerText);
    }
  });

  it('introduces なぜ (layer 0) and ほかには (layer 1), the two moves chanto/genkan never exercised, and reuses つまり (layer 2) to reach the root — all from the approved Stage-2 vocabulary', () => {
    const layer0Deepen = digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!;
    const layer1Deepen = digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!;
    const layer2Deepen = digPhase.layers[2]!.hand.find((c) => c.tag === 'deepen')!;
    expect(layer0Deepen.move).toBe('follow-naze');
    expect(layer1Deepen.move).toBe('follow-hokaniwa');
    expect(layer2Deepen.move).toBe('follow-tsumari');
    for (const layer of digPhase.layers) {
      const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
      expect(APPROVED_STAGE2_MOVES.has(deepen.move!)).toBe(true);
    }
  });

  it('previously, only たとえば and つまり had ever been exercised by release content — this mission is the first to exercise follow-naze and follow-hokaniwa', () => {
    const movesUsedBefore = new Set<string>();
    for (const m of [chantoMission, genkanMission]) {
      const dig = m.phases[1] as DigPhase;
      for (const layer of dig.layers) {
        const deepen = layer.hand.find((c) => c.tag === 'deepen');
        if (deepen?.move) movesUsedBefore.add(deepen.move);
      }
    }
    expect(movesUsedBefore).toEqual(new Set(['follow-tsumari', 'follow-tatoeba']));
    expect(movesUsedBefore.has('follow-naze')).toBe(false);
    expect(movesUsedBefore.has('follow-hokaniwa')).toBe(false);
  });
});

describe('rouka (1-3) — each intermediate answer stops short of the root; the purpose is earned, not told', () => {
  it('layer 0\'s shallow "danger" answer only names danger in the abstract — the gap is precisely that the reason itself is unstated', () => {
    expect(digPhase.layers[0]!.robotSays).toContain('あぶない');
    expect(digPhase.layers[0]!.gap).toContain('わけ');
    const deepen = digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!;
    expect(deepen.text).toContain('なんで');
  });

  it('layer 1 makes the danger concrete (bumping into another person) but only from the runner\'s own point of view — the gap is whether there is more to it', () => {
    expect(digPhase.layers[1]!.robotSays).toContain('ぶつかる');
    expect(digPhase.layers[1]!.gap).toContain('ほかにも');
    const deepen = digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!;
    expect(deepen.text).toBe('ほかにもある？');
  });

  it('layer 2 introduces blind corners — other people you cannot see coming — but still stops at a situational detail, not the hallway\'s general purpose', () => {
    expect(digPhase.layers[2]!.robotSays).toContain('見えない');
    expect(digPhase.layers[2]!.robotSays).toContain('来る人');
    expect(digPhase.layers[2]!.gap).toContain('なんのために');
  });

  it('the root alone lands the purpose — considering a person in a place you cannot see — without invoking an unearned "shared space" premise, and no dig-layer robotSays states it first (AD-05 §7 epistemic-root guardrail)', () => {
    // WO-16 correction: 酒井先生 found the original root's jump to 「ろうかはみんなのところ」
    // unearned by the prior chain. The repaired root drops the shared-space premise entirely and
    // synthesizes directly from what layer 2 already established (someone in a place you can't
    // see might be coming) — no "みんなの場所"/"みんながつかう場所" language anywhere.
    expect(digPhase.root.robotSays).toContain('見えないところにいる人');
    expect(digPhase.root.robotSays).toContain('考えて');
    for (const forbidden of ['みんなの場所', 'みんながつかう場所', 'みんなのところ']) {
      expect(digPhase.root.robotSays).not.toContain(forbidden);
    }
    for (const layer of digPhase.layers) {
      const layerText = layer.robotSays.trim();
      const rootText = digPhase.root.robotSays.trim();
      expect(layerText === rootText || layerText.includes(rootText) || rootText.includes(layerText)).toBe(false);
    }
  });

  it('WO-16 correction 1: never uses the ambiguous 「見えない人」 compound anywhere (酒井先生: readable as "visually impaired person" or "invisible person") — uses 「見えないところにいる人」instead', () => {
    const allRobotSays = [
      ...digPhase.layers.map((l) => l.robotSays),
      digPhase.root.robotSays,
      ...digPhase.layers.flatMap((l) => l.gapDistractors!.map((d) => d.text)),
    ];
    for (const text of allRobotSays) expect(text).not.toContain('見えない人');
  });

  it('WO-16 correction 2: R1 tsumari never surfaces as 「つまり」 in Mission 1-3\'s child-visible text (AD-05) — layer 2\'s deepen card asks 「それって、どういうこと？」, and the internal move id is unchanged', () => {
    const layer2Deepen = digPhase.layers[2]!.hand.find((c) => c.tag === 'deepen')!;
    expect(layer2Deepen.text).toBe('それって、どういうこと？');
    expect(layer2Deepen.text).not.toContain('つまり');
    expect(layer2Deepen.move).toBe('follow-tsumari'); // internal R1 id, unchanged
  });

  it('WO-16 correction 4: applies 酒井先生\'s native wording — 「曲がり角」and「向こう」(ruby per Stage-2 rules), 「あぶない」stays in kana', () => {
    expect(digPhase.layers[2]!.robotSays).toContain('{曲|ま}がり角');
    expect(digPhase.layers[2]!.robotSays).toContain('{向|む}こう');
    expect(digPhase.layers[0]!.robotSays).toContain('あぶない');
    expect(digPhase.layers[0]!.robotSays).not.toContain('危');
  });

  it('never frames the rule as mere obedience ("きまり"/"きめて"), never says adults/teachers are right or wrong, and never turns into traffic-safety statistics or legal/moral instruction', () => {
    const allText = [
      ...roukaMission.phases.flatMap((p) =>
        p.template === 'slot-assembly'
          ? [...p.cards.map((c) => c.text), ...Object.values(p.archetypes).map((a) => a.robotSays)]
          : [...p.layers.flatMap((l) => [l.robotSays, ...l.hand.map((c) => c.text)]), p.root.robotSays],
      ),
      roukaMission.tip, roukaMission.teachBack, roukaMission.ouchiTalk,
    ].join(' ');
    for (const forbidden of [
      'きまり', 'きめて', 'せんせいが', 'まちがって', 'だめ', 'へん', 'おかしい',
      '%', 'けが人', 'じこりつ', '法律', 'ばっそく',
    ]) {
      expect(allText).not.toContain(forbidden);
    }
  });

  it('tip/teachBack/おうちトーク reinforce ほかにもある？ as the transferable skill that surfaced the real purpose', () => {
    expect(roukaMission.tip).toContain('ほかにもある');
    expect(roukaMission.teachBack).toContain('ほかにもある');
    expect(roukaMission.ouchiTalk).toContain('ほかにもある');
  });
});

describe('rouka (1-3) — reachable through the real m1 mission library, third after chanto and genkan', () => {
  it('is the mission a Stage-2 profile reaches once Mission 1-1 (chanto) and Mission 1-2 (genkan) are both done, via the real missionOrder', () => {
    const missions: Record<string, Pick<Mission, 'id' | 'stage'>> = {
      [chantoMission.id]: { id: chantoMission.id, stage: chantoMission.stage },
      [genkanMission.id]: { id: genkanMission.id, stage: genkanMission.stage },
      [roukaMission.id]: { id: roukaMission.id, stage: roukaMission.stage },
    };
    const profile = {
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 as const,
      progress: {
        [chantoMission.id]: { done: true, stamps: 0, coop: false },
        [genkanMission.id]: { done: true, stamps: 0, coop: false },
      },
    };
    const next = pickNextMission(moduleJson.missionOrder, missions, profile);
    expect(next).toBe(roukaMission.id);
  });
});

describe('rouka (1-3) — playable end to end (たのむ -> ほる x3 -> wrapper screens), honest depth-3 milestone/growth evidence', () => {
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

  it('これでOK？ cannot be bypassed and Gap Naming is mandatory at all 3 layers; the mission plays from the たのむ slot card through to ねっこ, teach-back, and おうちトーク', async () => {
    const user = userEvent.setup();
    render(
      // freeMissionIds scoped to rouka's own id for this isolated single-mission playthrough
      // (same approach as genkan/ice's own tests) — in the real app, rouka is reached via
      // progression, not as a free mission on its own.
      <MissionShell
        moduleId="m1" freeMissionIds={[roukaMission.id]} mission={roukaMission}
        ui={ui} followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );

    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await user.click(screen.getByText(ui.coopSolo));

    const clearCard = (roukaMission.phases[0]! as Extract<typeof roukaMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));

    // Layer 0 (なぜ)
    expect(screen.getByText(digPhase.layers[0]!.robotSays)).toBeInTheDocument();
    expect(screen.queryByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text)).not.toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text));

    // Layer 1 (ほかには)
    expect(screen.getByText(digPhase.layers[1]!.robotSays)).toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!.text));

    // Layer 2 (つまり)
    expect(screen.getByText(byDigAnswerText(digPhase.layers[2]!.robotSays))).toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[2]!.hand.find((c) => c.tag === 'deepen')!.text));

    // ねっこ reached — genuine depth 3.
    expect(screen.getByText(byDigAnswerText(digPhase.root.robotSays))).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());

    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    expect(screen.getByText(roukaMission.teachBack)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // teach-back -> おうちトーク
    expect(screen.getByText(roukaMission.ouchiTalk)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // -> handoff
    await user.click(screen.getByText(ui.handoffContinue)); // -> parent
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    const profile = saved.profiles[0];
    expect(profile.progress[roukaMission.id].done).toBe(true);

    // M1 (どうぐが 手に入った): at least one move reached moratta.
    expect(profile.milestones.M1).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    // M3 (3れん ホリ): this chain has 3 genuine authored layers — unlike chanto/genkan, M3 must
    // be honestly claimed here, not withheld.
    expect(profile.milestones.M3).toEqual({ achieved: true, achievedAt: expect.any(Number) });

    // All three moves this chain exercises reach moratta.
    const naze = within(document.querySelector('.toolbox')!).getByText(moduleJson.cardTypes['follow-naze'].label).closest('.toolbox__tool')!;
    expect(naze.className).toContain('toolbox__tool--obtained');
    const hokaniwa = within(document.querySelector('.toolbox')!).getByText(moduleJson.cardTypes['follow-hokaniwa'].label).closest('.toolbox__tool')!;
    expect(hokaniwa.className).toContain('toolbox__tool--obtained');
    const tsumari = within(document.querySelector('.toolbox')!).getByText(moduleJson.cardTypes['follow-tsumari'].label).closest('.toolbox__tool')!;
    expect(tsumari.className).toContain('toolbox__tool--obtained');

    // M2a proxy evidence (system-observable only — never sets milestones.M2 itself) recorded from
    // Gap Naming resolving at all 3 layers, attributed once to this one mission.
    expect(profile.m2Evidence.proxyMissionIds).toEqual([roukaMission.id]);
    expect(profile.milestones.M2).toBeUndefined(); // only an actual parent confirmation (WO-14) can set this
  });
});
