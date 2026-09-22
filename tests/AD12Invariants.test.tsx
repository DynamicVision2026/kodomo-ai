import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GuidanceAffordance } from '../src/ad12/GuidanceAffordance';
import { VoicePlane } from '../src/ad12/VoicePlane';
import { MoveCard } from '../src/ad12/MoveCard';
import { MoveTray } from '../src/ad12/MoveTray';
import { SlipCascade } from '../src/ad12/SlipCascade';
import { DepthRow } from '../src/ad12/DepthRow';
import { RefrainSlot } from '../src/ad12/RefrainSlot';
import { TeachBackPanel } from '../src/ad12/TeachBackPanel';
import { Plane } from '../src/ad12/Plane';

afterEach(() => cleanup());

describe('AD-12 F1 — guidance never points at a content choice', () => {
  it('GuidanceAffordance wraps its children as ONE group — there is no prop to target a single child', () => {
    // Structural proof, not a convention: the component's own props type has no id/index/
    // childId field at all (see GuidanceAffordance.tsx) — this test documents that by using it
    // exactly the way every real caller must (MoveTray/AnswerPlane), never per-item.
    render(
      <GuidanceAffordance level="show">
        <button>a</button>
        <button>b</button>
        <button>c</button>
      </GuidanceAffordance>
    );
    const wrapper = screen.getByText('a').closest('.ad12-guidance');
    expect(wrapper).not.toBeNull();
    // All three buttons share the exact same ancestor wrapper — one cue, one group.
    expect(screen.getByText('b').closest('.ad12-guidance')).toBe(wrapper);
    expect(screen.getByText('c').closest('.ad12-guidance')).toBe(wrapper);
  });

  it('level "independent" renders no affordance wrapper at all (guidance is genuinely gone, not just faded)', () => {
    render(<GuidanceAffordance level="independent"><button>only</button></GuidanceAffordance>);
    expect(screen.getByText('only').closest('.ad12-guidance')).toBeNull();
  });
});

describe('AD-12 F3 — equal choices remain visually equal at rest', () => {
  it('SlipCascade never receives which slip is the target — its own prop type has no `kind` field', () => {
    // Type-level proof: Slip = { id, text } only (SlipCascade.tsx). Runtime proof: three slips
    // with different text render with the IDENTICAL class list — no per-slip distinguishing class.
    render(
      <SlipCascade
        slips={[
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ]}
      />
    );
    const buttons = ['A', 'B', 'C'].map((t) => screen.getByText(t).closest('button')!);
    expect(buttons[0]!.className).toBe(buttons[1]!.className);
    expect(buttons[1]!.className).toBe(buttons[2]!.className);
  });

  it('MoveCard/MoveTray never receive move/domain/tag — every card at "rest" shares one class, regardless of content', () => {
    render(
      <MoveTray
        guidanceLevel="independent"
        cards={[
          { id: '1', text: '深める' },
          { id: '2', text: '横道' },
          { id: '3', text: 'くりかえす' },
        ]}
      />
    );
    const cards = ['深める', '横道', 'くりかえす'].map((t) => screen.getByText(t).closest('button')!);
    const classes = cards.map((c) => c.className);
    expect(new Set(classes).size).toBe(1); // every card, same class, no per-content styling
  });

  it('a bare MoveCard defaults to the "rest" variant — the only resting shape (magnify is never at rest, F3)', () => {
    render(<MoveCard text="x" />);
    expect(screen.getByText('x').closest('button')!.className).toContain('ad12-move-card--rest');
  });
});

describe('AD-12 F6 — refrain slots are non-interactive by construction', () => {
  it('RefrainSlot exposes no click/navigation prop at all', () => {
    render(<RefrainSlot text="something" />);
    const slot = screen.getByText('something').closest('.ad12-refrain-slot')!;
    // Not a <button>, not an <a> — nothing here can navigate. Its own props type
    // (RefrainSlotProps) has only `text?`, so there is no onClick to even wire up by mistake.
    expect(slot.tagName).toBe('DIV');
    expect(slot.getAttribute('aria-hidden')).toBe('true');
  });

  it('an empty slot (not yet spoken) renders with no text, still visible', () => {
    const { container } = render(<RefrainSlot />);
    const slot = container.querySelector('.ad12-refrain-slot')!;
    expect(slot.className).toContain('is-empty');
    expect(slot.textContent).toBe('');
  });
});

describe('AD-12 F7 — yellow discipline', () => {
  it('ポン太 (VoicePlane speaker="PONTA") never carries the accent-active class — its identity colour is warm tan, not yellow', () => {
    render(<VoicePlane speaker="PONTA" speakerLabel="P" text="t" />);
    const plane = screen.getByText('t').closest('.ad12-voice-plane')!;
    expect(plane.className).toContain('ad12-voice-plane--ponta');
    expect(plane.className).not.toContain('accent');
  });

  it('Plane only ever applies the accent-active class when the caller explicitly opts in — never by default', () => {
    render(<Plane>content</Plane>);
    expect(screen.getByText('content').className).not.toContain('ad12-accent-active');
  });

  it('DepthRow mutes its own root tab whenever another yellow is active on screen — never two active yellows from one row', () => {
    const { container: withOther } = render(<DepthRow total={3} current={3} rootReached otherYellowActive />);
    expect(withOther.querySelector('.is-root-active')).toBeNull();
    expect(withOther.querySelector('.is-root-muted')).not.toBeNull();
    cleanup();
    const { container: alone } = render(<DepthRow total={3} current={3} rootReached />);
    expect(alone.querySelector('.is-root-active')).not.toBeNull();
  });

  it('TeachBackPanel (a parent surface) never references the accent colour — F7: parent actions use ink, never yellow', () => {
    render(
      <TeachBackPanel
        teachBack="t" ouchiTalk="o" m2ConfirmPrompt="p" m2ConfirmAction="a"
        m2Confirmed={false} m2ConfirmedMessage="m"
      />
    );
    const button = screen.getByText('a');
    expect(button.className).toContain('ad12-ink-button');
    expect(button.className).not.toContain('accent');
  });
});

describe('AD-12 F8 — tap targets', () => {
  it('every interactive AD-12 primitive carries the shared 48px tap-target class', () => {
    render(
      <>
        <MoveCard text="card" />
        <RefrainSlot text="slot" />
      </>
    );
    expect(screen.getByText('card').closest('button')!.className).toContain('ad12-tappable');
    expect(screen.getByText('slot').closest('.ad12-refrain-slot')!.className).toContain('ad12-tappable');
  });
});
