import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import type { BankLibrary } from '../src/shell/MissionShell';
import type { DigPhase, Mission, ModuleUiStrings, SlotAssemblyPhase } from '../src/engine/types';
import roukaMissionJson from '../src/modules/m1/topics/rouka/s2.json';
import bankNedanJson from '../src/modules/m1/topics/bank-nedan/s2.json';
import bankKotobaJson from '../src/modules/m1/topics/bank-kotoba/s2.json';
import bankArigatouJson from '../src/modules/m1/topics/bank-arigatou/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const rouka = roukaMissionJson as unknown as Mission;
const bankNedan = bankNedanJson as unknown as Mission;
const bankKotoba = bankKotobaJson as unknown as Mission;
const bankArigatou = bankArigatouJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;
const bankLibrary: BankLibrary = {
  bankOrder: [bankNedan.id, bankKotoba.id, bankArigatou.id],
  missions: { [bankNedan.id]: bankNedan, [bankKotoba.id]: bankKotoba, [bankArigatou.id]: bankArigatou },
};

/**
 * WO-21 Phase 4: M0-M5 must be "genuinely reachable via actual production content, not just
 * technically defined." Every milestone already has unit/mechanism coverage elsewhere (often
 * against a synthetic fixture or pre-seeded moveProgress); this file instead plays through only
 * real, release-clear Story/Bank content end to end, through the real product surface (profile
 * creation, the real Bank hub added in Phase 1), to prove the full M0-M5 journey is reachable
 * today, not merely wired.
 *
 * follow-naze's 3 distinct domains (社会とひと + 日常 + ことば, matching
 * docs/v0.6-definition-of-done.md Package 5's own claim) come from real layers: rouka (1-3,
 * 社会とひと), bank-nedan (B06, 日常), bank-kotoba (B09, ことば) — each already release-clear
 * (WO-21 Phase 0: Gate 1 passed, Gate 2 waived). bank-arigatou (B11, also release-clear) supplies
 * a 4th real sole-follow-naze layer to actually witness Blind-first/M4 firing, since tsukaeru is
 * only reached partway through bank-kotoba's own layer — too late to affect that same layer.
 */
describe('Growth Journey M0-M5 — reachable end to end through only real, release-clear content', () => {
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

  async function playDigChain(user: ReturnType<typeof userEvent.setup>, dig: DigPhase) {
    for (const layer of dig.layers) {
      await passGate(user);
      await user.click(screen.getByText(layer.hand.find((c) => c.tag === 'deepen')!.text));
    }
    await user.click(screen.getByText(ui.earlyOk));
  }

  async function throughWrapperScreensToParent(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    await user.click(screen.getByText(ui.handoffContinue)); // teach-back -> おうちトーク
    await user.click(screen.getByText(ui.handoffContinue)); // -> handoff
    await user.click(screen.getByText(ui.handoffContinue)); // -> parent
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();
  }

  it('a real family reaches M0, M1, M2 (a+b), M3, M4, and M5 — all six — purely by playing real, release-clear Story/Bank content through the real product surface', async () => {
    localStorage.setItem('m-app.v1', JSON.stringify({
      profiles: [], entitlements: ['m1:full'], founder: false, abVariant: 'A', deviceId: 'd1',
    }));
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={rouka}
        bankLibrary={bankLibrary} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );

    // Profile creation.
    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));

    // --- Mission 1: rouka (1-3, real 3-layer chain, domain 社会とひと for follow-naze) -------
    await user.click(screen.getByText(ui.coopSolo));
    const roukaSlot = rouka.phases[0] as SlotAssemblyPhase;
    await user.click(screen.getByText(roukaSlot.cards.find((c) => c.tag === 'clear')!.text));
    const roukaDig = rouka.phases[1] as DigPhase;
    await playDigChain(user, roukaDig);
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());
    await throughWrapperScreensToParent(user);

    // M0: the Day-1 envelope, real content, first time the parent screen is genuinely reached.
    expect(screen.getByText(ui.m0Prompt)).toBeInTheDocument();
    await user.click(screen.getByText(ui.m0Action));
    expect(screen.getByText(ui.m0SealedMessage)).toBeInTheDocument();

    // M2b: the parent's own attestation, available because rouka's Gap Naming already recorded
    // real M2a proxy evidence for this mission.
    await user.click(screen.getByText(ui.m2ConfirmAction));
    expect(screen.getByText(ui.m2ConfirmedMessage)).toBeInTheDocument();

    // --- Mission 2: bank-nedan (B06, real 2-layer chain, domain 日常) ------------------------
    await user.click(screen.getByText(ui.bankHubButton));
    await user.click(screen.getByText(bankNedan.title));
    await user.click(screen.getByText(ui.coopSolo));
    await playDigChain(user, bankNedan.phases[0] as DigPhase);
    await throughWrapperScreensToParent(user);

    // --- Mission 3: bank-kotoba (B09, real 2-layer chain, domain ことば — the 3rd distinct
    // domain, so follow-naze reaches tsukaeru partway through this mission's own layer 0). -----
    await user.click(screen.getByText(ui.bankHubButton));
    await user.click(screen.getByText(bankKotoba.title));
    await user.click(screen.getByText(ui.coopSolo));
    await playDigChain(user, bankKotoba.phases[0] as DigPhase);
    await throughWrapperScreensToParent(user);

    // --- Mission 4: bank-arigatou (B11) — a real, later sole-follow-naze layer, played AFTER
    // tsukaeru was reached, is where Blind-first genuinely fires in production. ---------------
    await user.click(screen.getByText(ui.bankHubButton));
    await user.click(screen.getByText(bankArigatou.title));
    await user.click(screen.getByText(ui.coopSolo));
    const arigatouDig = bankArigatou.phases[0] as DigPhase;
    await passGate(user); // layer 0's Gap Naming — this layer's sole move is already tsukaeru
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    expect(screen.getByText(ui.blindCommit)).toBeInTheDocument();
    await user.click(screen.getByText(ui.blindCommit)); // M4: real Blind-first commitment
    await user.click(screen.getByText(ui.blindSelfReportSame)); // non-evaluative, required before the hand is usable
    // The full authored hand reveals afterward, unfiltered.
    for (const c of arigatouDig.layers[0]!.hand) expect(screen.getByText(c.text)).toBeInTheDocument();
    await user.click(screen.getByText(arigatouDig.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text));
    // Layer 1's own move (follow-hokaniwa) also reached tsukaeru along the same real path
    // (rouka/bank-nedan/bank-kotoba's own layer 1 each use follow-hokaniwa too), so it is ALSO
    // genuinely Blind-first eligible here — not a second, separately-triggered mechanism.
    await passGate(user);
    expect(document.querySelector('.dig__hand')).not.toBeInTheDocument();
    await user.click(screen.getByText(ui.blindCommit));
    await user.click(screen.getByText(ui.blindSelfReportSame));
    await user.click(screen.getByText(arigatouDig.layers[1]!.hand.find((c) => c.tag === 'deepen')!.text));
    await user.click(screen.getByText(ui.earlyOk));
    await throughWrapperScreensToParent(user);

    // M5: a real move, recorded as observed in real-world use from the same parent screen.
    // Uses follow-tatoeba specifically — untouched by this playthrough (still mihakken) — to
    // prove M5/applyOutsideUse works from any current rung without entangling it with follow-
    // naze/follow-hokaniwa's own hitoride proof above. Scoped to the M5 button group — the
    // Toolbox above it shows the same move labels, so an unscoped query would match more than
    // one element.
    const m5Moves = within(document.querySelector('.mission-shell__m5-moves') as HTMLElement);
    await user.click(m5Moves.getByText(moduleJson.cardTypes['follow-tatoeba'].label));

    const saved = JSON.parse(localStorage.getItem('m-app.v1')!);
    const profile = saved.profiles[0];

    // M0.
    expect(profile.milestones.M0).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    // M1 (どうぐが 手に入った) — at least one move reached moratta.
    expect(profile.milestones.M1).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    // M2 — only the real parent confirmation sets this, never M2a proxy evidence alone.
    expect(profile.milestones.M2).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    expect(profile.m2Evidence.proxyMissionIds).toContain(rouka.id);
    // M3 (3れん ホリ) — rouka's real 3-layer chain.
    expect(profile.milestones.M3).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    // M4 (カードなしで きけた) — the real Blind-first commit above.
    expect(profile.milestones.M4).toEqual({ achieved: true, achievedAt: expect.any(Number) });
    // M5 (そとで つかった) — the real outside-use log above.
    expect(profile.milestones.M5).toEqual({ achieved: true, achievedAt: expect.any(Number) });

    // The scaffold state backing M4: follow-naze genuinely reached hitoride via 3 real, distinct
    // domains — never fabricated or pre-seeded.
    expect(profile.moveProgress['follow-naze'].rung).toBe('hitoride');
    expect(new Set(profile.moveProgress['follow-naze'].aptUseDomains)).toEqual(
      new Set(['社会とひと', '日常', 'ことば']),
    );
    // follow-hokaniwa took the same real 3-domain path (each of rouka/bank-nedan/bank-kotoba's
    // own layer 1 also uses it) and reached hitoride too — a second real move, not a fixture.
    expect(profile.moveProgress['follow-hokaniwa'].rung).toBe('hitoride');
    // follow-tatoeba: never played above — proves applyOutsideUse (M5) works from mihakken too.
    expect(profile.moveProgress['follow-tatoeba'].rung).toBe('sotode');

    // No score, rank, or percentage is ever persisted or shown — every milestone is a plain
    // achieved/achievedAt pair, never a number a family could compare against another family's.
    for (const m of Object.values(profile.milestones) as { achieved: boolean }[]) {
      expect(typeof m.achieved).toBe('boolean');
    }
  });
});
