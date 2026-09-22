import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import { pickNextMission } from '../src/shell/missionLibrary';
import { parseRootType } from '../scripts/lib/rootType';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const chantoMission = chantoMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const digPhase = chantoMission.phases[1] as DigPhase;
const APPROVED_STAGE2_MOVES = new Set(moduleJson.followMoves);

/** AD-05 final native correction: layer 1's and root's robotSays now carry ruby markup
 *  ({部屋|へや}, {場所|ばしょ}, {意味|いみ}) — getByText can't match the raw JSON string (with its
 *  literal `{}` syntax) against what actually renders (<ruby>base<rt>reading</rt></ruby>). A
 *  ruby element's own textContent is base+reading concatenated (e.g. "部屋へや"), not just the
 *  base, so even a ruby-stripped comparison string wouldn't appear contiguously. Match on the
 *  dig__answer paragraph's own rendered text instead, using the LONGEST plain (non-ruby) segment
 *  of the original string as the needle — every ruby-containing mission string here still has a
 *  substantial plain run either side of its ruby token(s). */
function byDigAnswerText(rawMissionText: string) {
  const plainSegments = rawMissionText.split(/\{[^{}|]+\|[^{}|]+\}/);
  const needle = plainSegments.reduce((a, b) => (b.length > a.length ? b : a), '');
  return (_content: string, element: Element | null) =>
    element?.className === 'dig__answer' && needle.length > 0 && (element.textContent ?? '').includes(needle);
}

/**
 * WO-12: Mission 1-1「ちゃんと しなさい」の「ちゃんと」 — the first real release-content vertical
 * slice from the commissioned AD-04 v1 library, replacing bread (now archived, WO-11) as the
 * mission that occupies id "m1-s2-1-1". structural lint (pipeline/04_lint.ts) already enforces
 * the schema/kanji/AD-01 mechanics for this file exactly as it does for every other mission;
 * these tests prove it is reachable, fully playable (both phases, all wrapper screens), that its
 * chain genuinely exercises つまり and たとえば, and that milestones/growth fire the same way any
 * other real content would — without overclaiming M3 (this is a genuine 2-layer chain, matching
 * the 2 primary moves AD-04 marks for this topic, not 3).
 */
describe('chanto (1-1) — release classification and rootType contract', () => {
  it('is classified release, and carries the register-only Gate 2 re-review stamp recorded after the AD-05 final native correction', () => {
    // WO-12 closure recorded a real 酒井先生 review stamp; AD-05 (WO-14)'s first pass then
    // rewrote the child-visible Japanese and removed it (that stamp reviewed the OLD wording).
    // This final native-review correction pass re-stamps it, with an explicit `note` marking the
    // review's own scope as register-only — the underlying claims/inquiry structure were not
    // re-reviewed as facts, only the Japanese wording.
    expect(chantoMission.contentClass).toBe('release');
    expect(chantoMission.review).toEqual({
      by: '酒井先生', date: '2026-09-20',
      note: 'register-only re-review (AD-05 migration + native corrections)',
    });
  });

  it('declares a rootType from the closed WO-11C set (めあて), not an invented fourth value', () => {
    expect(parseRootType(chantoMission.rootType)).toBe('めあて');
  });
});

describe('chanto (1-1) — structure (AD-01 gap/distractor contract, accepted move vocabulary)', () => {
  it('has one slot-assembly phase (たのむ) and one dig phase (ほる) with exactly 2 layers', () => {
    expect(chantoMission.phases).toHaveLength(2);
    expect(chantoMission.phases[0]!.template).toBe('slot-assembly');
    expect(chantoMission.phases[1]!.template).toBe('dig');
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

  it('the chain genuinely exercises つまり (layer 0) and たとえば (layer 1) — the two primary moves AD-04 marks for this topic — and no other/unsupported move', () => {
    const layer0Deepen = digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!;
    const layer1Deepen = digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!;
    expect(layer0Deepen.move).toBe('follow-tsumari');
    expect(layer1Deepen.move).toBe('follow-tatoeba');
    for (const layer of digPhase.layers) {
      const deepen = layer.hand.find((c) => c.tag === 'deepen')!;
      expect(APPROVED_STAGE2_MOVES.has(deepen.move!)).toBe(true);
    }
  });

  it('forms one continuous chain: layer 0\'s shallow "きちんと" answer is what layer 1 makes concrete (as a situational example, hedged, not a fixed rule), and the root lands on context-dependence, not on the eating example as final truth', () => {
    expect(digPhase.layers[0]!.robotSays).toContain('きちんと');
    expect(digPhase.layers[0]!.gap).toContain('きちんと');
    expect(digPhase.layers[1]!.robotSays).toContain('もどすこと'); // the tidying-room example
    expect(digPhase.layers[1]!.robotSays).toContain('かな'); // hedged as one example, not asserted as the definition
    expect(digPhase.layers[1]!.gap).toContain('食べるとき'); // AD-05: たべる -> 食べる (kanji floor); whether the same meaning holds elsewhere
    expect(digPhase.root.robotSays).toContain('食べるとき');
    expect(digPhase.root.robotSays).toContain('とか'); // the eating example is hedged too, not asserted as final truth
    // The root's own landing point — what the mission is FOR — is that the concrete meaning
    // changes with the situation, not "eating means not spilling." This is the Founder Gate 1
    // correction: the root must not end on a fixed second definition. (AD-05 final native
    // correction reworded the exact sentence but preserves this same landing point — 「意味が
    // かわるんだね」, the eating example still hedged with 「とかね」, not asserted as the final
    // meaning.)
    expect(digPhase.root.robotSays).toContain('かわる');
    expect(digPhase.root.robotSays).not.toBe(digPhase.layers[1]!.robotSays); // a genuinely different answer, not a repeat
  });

  it('never frames the parent as wrong, vague, foolish, or an opponent — no rule-challenging or argument-winning language anywhere in the chain', () => {
    const allText = [
      ...chantoMission.phases.flatMap((p) =>
        p.template === 'slot-assembly'
          ? [...p.cards.map((c) => c.text), ...Object.values(p.archetypes).map((a) => a.robotSays)]
          : [...p.layers.flatMap((l) => [l.robotSays, ...l.hand.map((c) => c.text)]), p.root.robotSays],
      ),
      chantoMission.tip, chantoMission.teachBack, chantoMission.ouchiTalk,
    ].join(' ');
    for (const forbidden of ['まちがって', 'だめ', 'へん', 'おかしい', 'まけ', 'かった']) {
      expect(allText).not.toContain(forbidden);
    }
  });
});

describe('chanto (1-1) — reachable through the real m1 mission library', () => {
  it('is the first mission a brand-new Stage-2 profile reaches, via the real missionOrder', () => {
    const missions: Record<string, Pick<Mission, 'id' | 'stage'>> = {
      [chantoMission.id]: { id: chantoMission.id, stage: chantoMission.stage },
    };
    const profile = {
      id: 'p1', avatarId: 'a1', nicknameId: 'n1', stage: 2 as const,
      progress: {},
    };
    const next = pickNextMission(moduleJson.missionOrder, missions, profile);
    expect(next).toBe(chantoMission.id);
  });

  it('is one of the module\'s free mission ids', () => {
    expect(moduleJson.freeMissionIds).toContain(chantoMission.id);
  });
});

describe('chanto (1-1) — playable end to end (たのむ -> ほる -> wrapper screens), with honest (not overclaimed) milestone/growth evidence', () => {
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

  it('これでOK？ cannot be bypassed and Gap Naming is mandatory at both layers; the mission plays from the たのむ slot card through to ねっこ and every wrapper screen', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission}
        ui={ui} followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );

    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));

    // たのむ: the clear card asks the mission's own opening question.
    const clearCard = (chantoMission.phases[0]! as Extract<typeof chantoMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));

    // ほる layer 0: これでOK？ is the only way forward, and it opens Gap Naming, not a bypass.
    expect(screen.getByText(digPhase.layers[0]!.robotSays)).toBeInTheDocument();
    expect(screen.queryByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text)).not.toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text));

    // ほる layer 1: same gate, same mandatory Gap Naming, on the deeper (concrete) answer.
    expect(screen.getByText(byDigAnswerText(digPhase.layers[1]!.robotSays))).toBeInTheDocument();
    await passGate(user);
    await user.click(screen.getByText(digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!.text));

    // ねっこ reached.
    expect(screen.getByText(byDigAnswerText(digPhase.root.robotSays))).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());

    // Wrapper screens, straight through to the parent screen.
    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    expect(screen.getByText(chantoMission.teachBack)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // teach-back -> おうちトーク
    expect(screen.getByText(chantoMission.ouchiTalk)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // -> handoff
    await user.click(screen.getByText(ui.handoffContinue)); // -> parent
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();

    // Honest milestone/growth evidence for a genuine 2-layer chain:
    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    const profile = saved.profiles[0];
    expect(profile.progress[chantoMission.id].done).toBe(true);

    // M1 (どうぐが 手に入った): at least one move reached moratta — genuinely true here.
    expect(profile.milestones.M1).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    // M3 (3れん ホリ) requires layerCount >= 3 — this chain has 2 layers by design (AD-04 marks
    // exactly 2 primary moves for this topic), so M3 must NOT be claimed.
    expect(profile.milestones.M3).toBeUndefined();

    // Both moves this chain actually exercises reach moratta (rendered + one apt_use each, one
    // domain each — not the 3 distinct domains tsukaeru requires from a single mission).
    const tsumari = within(document.querySelector('.toolbox')!).getByText(moduleJson.cardTypes['follow-tsumari'].label).closest('.toolbox__tool')!;
    expect(tsumari.className).toContain('toolbox__tool--obtained');
    const tatoeba = within(document.querySelector('.toolbox')!).getByText(moduleJson.cardTypes['follow-tatoeba'].label).closest('.toolbox__tool')!;
    expect(tatoeba.className).toContain('toolbox__tool--obtained');

    // M2a proxy evidence (system-observable only — never sets milestones.M2 itself) was recorded
    // from Gap Naming resolving at both layers, attributed to this one mission.
    expect(profile.m2Evidence.proxyMissionIds).toEqual([chantoMission.id]);
    expect(profile.milestones.M2).toBeUndefined(); // only an actual parent confirmation (WO-14) can set this
  });
});
