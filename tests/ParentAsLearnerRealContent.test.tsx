import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionShell } from '../src/shell/MissionShell';
import { skipM0RitualIfPresent } from './helpers/stageConformance';
import type { DigPhase, Mission, ModuleUiStrings, SlotAssemblyPhase } from '../src/engine/types';
import minnaMissionJson from '../src/modules/m1/topics/minna/s2.json';
import moduleJson from '../src/modules/m1/module.json';

const minna = minnaMissionJson as unknown as Mission;
const ui = moduleJson.ui as ModuleUiStrings;

/**
 * WO-21 Phase 5: verify the PRODUCTION course (not a synthetic fixture) actually carries real
 * experiences for every accepted Parent-as-Learner requirement — parent prediction, parent-may-
 * be-wrong, child teach-back, the "Parent Unknown" reassurance, same-answer co-play, and one
 * Perspective prototype. Mission 1-5 (minna) is the one real, release-clear mission that carries
 * both a real `prediction` layer and a real `perspective` field (WO-19 Phase 3B/3C content,
 * WO-21 Phase 0 gate work), but until now nothing actually PLAYED it end to end through
 * MissionShell in coop mode — tests/StoryMissions1to8.test.tsx only asserts the data exists.
 */
describe('Parent-as-Learner — every accepted requirement, exercised through real, release-clear production content', () => {
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

  /** Clicks a hand card by its raw authored text, tolerating {漢字|かんじ} ruby markup — a ruby
   *  token renders as a separate <ruby> element, so getByText can't match the raw JSON string
   *  containing literal `{}` (same issue ChantoTopic.test.tsx works around). Matches on the
   *  longest plain (non-ruby) run of the original string instead. */
  async function clickCard(user: ReturnType<typeof userEvent.setup>, rawText: string) {
    const plainSegments = rawText.split(/\{[^{}|]+\|[^{}|]+\}/);
    const needle = plainSegments.reduce((a, b) => (b.length > a.length ? b : a), '');
    const el = screen.getByText((_content, element) =>
      element?.className === 'question-chip__text' && needle.length > 0 && (element.textContent ?? '').includes(needle));
    await user.click(el.closest('button')!);
  }

  it('minna (1-5), played in real coop mode: child predicts, hands off, the parent sees the real Parent-Unknown reassurance and may pick a different (wrong) option with no judgment shown, then real teach-back and a real Perspective moment follow', async () => {
    localStorage.setItem('m-app.v2', JSON.stringify({
      // AD-13: entitlement is server-authoritative — cachedEntitlements is the one field
      // hasAccess() ever reads (src/engine/entitlements.ts).
      profiles: [], familyId: 'f1', cachedEntitlements: ['m1'], pendingSyncKeys: [], abVariant: 'A', deviceId: 'd1',
    }));
    const user = userEvent.setup();
    render(
      <MissionShell
        moduleId="m1" freeMissionIds={moduleJson.freeMissionIds} mission={minna} ui={ui}
        followMoves={moduleJson.followMoves} cardTypes={moduleJson.cardTypes}
      />,
    );

    await user.click(screen.getByText(ui.profileCreateLabel));
    await user.click(screen.getByText('🦊'));
    await user.click(screen.getByText('たぬき'));
    await user.click(screen.getByText(ui.profileConfirm));
    await skipM0RitualIfPresent(user, ui);
    await user.click(screen.getByText(ui.courseHomeContinueLabel));

    // Same-answer co-play starts here: choosing はい (co-op), not solo, is what makes the
    // prediction battle run at all — solo mode auto-skips it entirely (spec v0.5 pillar 5).
    await user.click(screen.getByText(ui.coopYes));

    // The slot-assembly phase itself opens with a REAL prediction battle too (beforeRound: 1,
    // spec v0.5 §7's よそうバトル 1) — child predicts which card leads to a real answer, hands
    // off, and the parent (seeing the same real "Parent Unknown" reassurance) predicts again
    // over the exact same 3 real card texts, before any card is actually picked.
    const slot = minna.phases[0] as SlotAssemblyPhase;
    const clearCard = slot.cards.find((c) => c.tag === 'clear')!;
    const vagueCard = slot.cards.find((c) => c.tag === 'vague')!;
    await user.click(screen.getByText(clearCard.text)); // child's own prediction
    await user.click(screen.getByText(ui.handoffContinue));
    expect(screen.getByText(ui.predictionParentPrompt)).toBeInTheDocument();
    await user.click(screen.getByText(vagueCard.text)); // parent predicts differently — may be wrong

    // Battle resolved; now the real cards render for the child to actually choose.
    await user.click(screen.getByText(clearCard.text));

    const dig = minna.phases[1] as DigPhase;
    // Layers 0 and 1 play normally, reaching layer 2 — the real prediction layer.
    await passGate(user);
    await clickCard(user, dig.layers[0]!.hand.find((c) => c.tag === 'deepen')!.text);
    await passGate(user);
    await clickCard(user, dig.layers[1]!.hand.find((c) => c.tag === 'deepen')!.text);

    // Layer 2's own real prediction battle (よそうバトル), real options resolved from this
    // layer's own hand (m7card/m8card/m9card), not fabricated text.
    const layer2 = dig.layers[2]!;
    const deepenCard = layer2.hand.find((c) => c.tag === 'deepen')!;
    const sidewaysCard = layer2.hand.find((c) => c.tag === 'sideways')!;
    expect(screen.getByText(deepenCard.text)).toBeInTheDocument();
    expect(screen.getByText(sidewaysCard.text)).toBeInTheDocument();

    // Child predicts first — the correct (deepen) option.
    await user.click(screen.getByText(deepenCard.text));
    // Handoff between child and parent turns.
    await user.click(screen.getByText(ui.handoffContinue));

    // Parent's turn: the real "Parent Unknown" reassurance (module.json's own
    // ui.predictionParentPrompt — fixed UI chrome, not mission content) is shown, and the exact
    // same real options are offered again (same-answer co-play: both predict over one shared
    // question, not two different ones).
    expect(screen.getByText(ui.predictionParentPrompt)).toBeInTheDocument();
    expect(screen.getByText(deepenCard.text)).toBeInTheDocument();
    expect(screen.getByText(sidewaysCard.text)).toBeInTheDocument();

    // Parent-may-be-wrong: the parent picks the OTHER (wrong) option. Nothing marks this as
    // incorrect anywhere in the DOM — no 正解/不正解/まちがって text exists in this product at
    // all (see the forbidden-word checks throughout tests/BankDigs.test.tsx and the mission
    // topic tests), and the game simply continues to the layer's normal gate next.
    await user.click(screen.getByText(sidewaysCard.text));
    expect(screen.queryByText(/正解|不正解|まちがって/)).not.toBeInTheDocument();

    // The battle resolved; the same layer's normal これでOK？ gate now appears (the reveal — who
    // was right — happens implicitly by playing on, never as an explicit scored verdict).
    await passGate(user);
    await user.click(screen.getByText(deepenCard.text));

    // ねっこ reached; real content, not fabricated.
    expect(screen.getByText(dig.root.robotSays)).toBeInTheDocument();
    await user.click(screen.getByText(ui.earlyOk));
    expect(plausible).toHaveBeenCalledWith('m1_complete', expect.anything());

    // Real child teach-back moment — mission.teachBack, not a placeholder.
    await user.click(screen.getByText(ui.handoffContinue)); // tip -> teach-back
    expect(screen.getByText(minna.teachBack)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // teach-back -> おうちトーク
    expect(screen.getByText(minna.ouchiTalk)).toBeInTheDocument();

    // Real Perspective moment — a second voice's own differing real content, not synthetic.
    await user.click(screen.getByText(ui.handoffContinue)); // おうちトーク -> perspective
    expect(screen.getByText(minna.perspective!.voice)).toBeInTheDocument();
    expect(screen.getByText(minna.perspective!.text)).toBeInTheDocument();
    await user.click(screen.getByText(ui.handoffContinue)); // perspective -> handoff
    await user.click(screen.getByText(ui.handoffContinue)); // -> parent
    expect(screen.getByText(ui.parentScreenHeading)).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem('m-app.v2')!);
    expect(saved.profiles[0].progress[minna.id].done).toBe(true);
    expect(saved.profiles[0].progress[minna.id].coop).toBe(true);
  });
});
