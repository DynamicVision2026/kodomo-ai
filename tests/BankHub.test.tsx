import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import type { BankLibrary } from '../src/shell/MissionShell';
import type { DigPhase, Mission, ModuleUiStrings } from '../src/engine/types';
import chantoMissionJson from '../src/modules/m1/topics/chanto/s2.json';
import b01 from '../src/modules/m1/topics/bank-atode/s2.json';
import b02 from '../src/modules/m1/topics/bank-escalator/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const chantoMission = chantoMissionJson as unknown as Mission;
const bankAtode = b01 as unknown as Mission;
const bankEscalator = b02 as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const bankLibrary: BankLibrary = {
  bankOrder: [bankAtode.id, bankEscalator.id],
  missions: { [bankAtode.id]: bankAtode, [bankEscalator.id]: bankEscalator },
};

/**
 * WO-21 Phase 1: the Bank (AD-04) is now reachable from the real product, not just directly
 * testable in isolation (tests/BankDigs.test.tsx). These tests prove the actual wiring added to
 * MissionShell/BankSelect (src/shell/BankSelect.tsx, src/main.tsx): a family can see the Bank
 * list from the parent screen, select a topic, play it through the exact same Dig machinery
 * every Story mission uses (no second engine), and return to the Bank list afterward with the
 * topic's own completion evidence retained on the profile — never a score.
 */
describe('Bank hub — reachable and playable from the real product surface', () => {
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

  async function playChantoToParent(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));
    await user.click(screen.getByText(ui.coopSolo));

    const digPhase = chantoMission.phases[1] as DigPhase;
    const clearCard = (chantoMission.phases[0] as Extract<typeof chantoMission.phases[0], { template: 'slot-assembly' }>)
      .cards.find((c) => c.tag === 'clear')!;
    await user.click(screen.getByText(clearCard.text));
    for (const layer of digPhase.layers) {
      await passGate(user);
      await user.click(screen.getByText(layer.hand.find((c) => c.tag === 'deepen')!.text));
    }
    await user.click(screen.getByText(ui.earlyOk));
    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    await user.click(screen.getByText(ui.handoffContinue)); // teach-back -> おうちトーク
    await user.click(screen.getByText(ui.handoffContinue)); // -> handoff
    await user.click(screen.getByText(ui.handoffContinue)); // -> parent
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();
  }

  it('selecting a Bank topic without a purchase routes to the same locked screen as any other paid mission (the Bank is not a second, ungated content surface)', async () => {
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission}
        bankLibrary={bankLibrary} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await playChantoToParent(user);

    await user.click(screen.getByText(ui.bankHubButton));
    expect(screen.getByText(ui.bankHeading)).toBeInTheDocument();
    expect(screen.getByText(bankAtode.title)).toBeInTheDocument();
    expect(screen.getByText(bankEscalator.title)).toBeInTheDocument();

    await user.click(screen.getByText(bankAtode.title));
    expect(screen.getByText(ui.lockedMessage)).toBeInTheDocument();
  });

  it('with a real household purchase, a family can see, select, and fully play a Bank Dig through the existing Dig loop, then return to the Bank list with its own progress retained', async () => {
    localStorage.setItem('m-app.v2', JSON.stringify({
      // AD-13: entitlement is server-authoritative now — `cachedEntitlements` is the one field
      // hasAccess() ever reads (src/engine/entitlements.ts).
      profiles: [], familyId: 'f1', cachedEntitlements: ['m1'], pendingSyncKeys: [], abVariant: 'A', deviceId: 'd1',
    }));
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={chantoMission}
        bankLibrary={bankLibrary} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );
    await playChantoToParent(user);

    // See + select: the Bank list shows both topics, neither marked done yet.
    await user.click(screen.getByText(ui.bankHubButton));
    expect(screen.queryByText(ui.bankDoneLabel)).not.toBeInTheDocument();
    await user.click(screen.getByText(bankAtode.title));

    // Same coop question every mission (Story or Bank) asks, then the same Dig loop.
    await user.click(screen.getByText(ui.coopSolo));
    const dig = bankAtode.phases[0] as DigPhase;
    expect(screen.getByText(dig.layers[0]!.robotSays)).toBeInTheDocument();
    for (const layer of dig.layers) {
      await passGate(user);
      await user.click(screen.getByText(layer.hand.find((c) => c.tag === 'deepen')!.text));
    }
    expect(screen.getByText(dig.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());

    // Straight back through the same wrapper-screen chain to the parent screen.
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText(ui.handoffContinue));
    await user.click(screen.getByText(ui.handoffContinue));
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();

    // Return to Bank: the just-played topic now shows its own retained completion evidence.
    await user.click(screen.getByText(ui.bankHubButton));
    const atodeButton = screen.getByText(bankAtode.title).closest('button')!;
    expect(atodeButton.textContent).toContain(ui.bankDoneLabel);
    const escalatorButton = screen.getByText(bankEscalator.title).closest('button')!;
    expect(escalatorButton.textContent).not.toContain(ui.bankDoneLabel);

    const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved.profiles[0].progress[bankAtode.id].done).toBe(true);
    expect(saved.profiles[0].progress[chantoMission.id].done).toBe(true);
  });
});
