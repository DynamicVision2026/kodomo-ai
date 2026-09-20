import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { Mission, ModuleUiStrings } from '../src/engine/types';
import dummyMissionJson from '../src/modules/m2-test/topics/dummy/s3.json';
import m2ModuleJson from '../src/modules/m2-test/module.json';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const dummyMission = dummyMissionJson as unknown as Mission;
const m2Ui = m2ModuleJson.ui as ModuleUiStrings;
const chantoMission = chantoMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

/**
 * WO-19 Phase 3C: the perspective-shift prototype mechanism. Purpose: help the child notice that
 * another person may see the same situation differently — never a debate, never scored, never
 * "who is right". Implemented as one new optional `Mission.perspective` field and one new
 * MissionShell screen, reusing the exact tip/teachBack/おうちトーク wrapper-screen idiom (no new
 * architecture, no second parent system). Proven here against the m2-test synthetic fixture
 * (contentClass: "synthetic" — never real release content, so no Gate 1/Gate 2 requirement);
 * real Japanese for an actual Story Mission is a content-authoring task for a later WO, not this
 * mechanism ticket.
 */
describe('Perspective (WO-19 Phase 3C) — the mechanism, proven against a synthetic fixture', () => {
  async function playDummyToOuchi(user: ReturnType<typeof userEvent.setup>) {
    render(<MissionShell moduleId="m2-test" freeMissionIds={m2ModuleJson.freeMissionIds} mission={dummyMission} ui={m2Ui} />);
    await user.click(screen.getByText(m2Ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(m2Ui.profileConfirm));
    await user.click(screen.getByText(m2Ui.coopSolo));
    await user.click(screen.getByText('これで ただしいか みなおしてみよう'));
    await user.click(screen.getByText(m2Ui.handoffContinue)); // tip -> teach-back
    await user.click(screen.getByText(m2Ui.teachbackSkip)); // -> おうちトーク
  }

  it('a mission that declares `perspective` shows it after おうちトーク and before handoff, with the other voice\'s text, then continues to handoff on tap', async () => {
    const user = userEvent.setup();
    await playDummyToOuchi(user);

    expect(screen.getByText(dummyMission.ouchiTalk)).toBeInTheDocument();
    await user.click(screen.getByText(m2Ui.handoffContinue)); // おうちトーク -> perspective

    expect(screen.getByText(dummyMission.perspective!.voice)).toBeInTheDocument();
    expect(screen.getByText(dummyMission.perspective!.text)).toBeInTheDocument();

    await user.click(screen.getByText(m2Ui.handoffContinue)); // perspective -> handoff
    expect(screen.getByText(m2Ui.handoffPrompt)).toBeInTheDocument();
  });

  it('introduces no debate/scoring/challenge language — the other voice states a view, it is never framed as right or wrong', () => {
    const text = [dummyMission.perspective!.voice, dummyMission.perspective!.text].join(' ');
    for (const forbidden of ['正解', '不正解', 'まちがって', 'かった', 'まけ', 'はんろん']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('a mission with no `perspective` field (every current release mission) skips straight from おうちトーク to handoff — purely additive, no existing flow changes', async () => {
    expect(chantoMission.perspective).toBeUndefined();
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await user.click(screen.getByText(ui.coopSolo));
    const clearCard = (chantoMission.phases[0]! as Extract<typeof chantoMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [firstChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(firstChoice as HTMLElement);
    const digPhase = chantoMission.phases[1] as import('../src/engine/types').DigPhase;
    await user.click(screen.getByText(digPhase.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text));
    await user.click(screen.getByText(ui.judgeNotEnough));
    const [secondChoice] = document.querySelectorAll('.dig__gap-naming-option');
    await user.click(secondChoice as HTMLElement);
    await user.click(screen.getByText(digPhase.layers[1]!.hand.find((c) => c.tag === 'deepen')!.text));
    await user.click(screen.getByText(ui.earlyOk));
    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    await user.click(screen.getByText(ui.teachbackSkip)); // -> おうちトーク
    expect(screen.getByText(chantoMission.ouchiTalk)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // straight to handoff, not perspective
    expect(screen.getByText(ui.handoffPrompt)).toBeInTheDocument();
  });
});
