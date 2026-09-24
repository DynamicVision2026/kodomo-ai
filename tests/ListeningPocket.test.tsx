import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioScene } from '../src/stage/AudioScene';
import type { AudioLine } from '../src/audio/types';
import type { ModuleUiStrings } from '../src/engine/types';
import moduleJson from '../src/modules/m1/module.json';

/**
 * Builder work order §6 — the Listening Pocket rebuild. jsdom's `Audio`/`HTMLMediaElement` has no
 * real media pipeline (`play()` resolves to nothing meaningful, `ended` never fires on its own),
 * so this fake stands in for the real element: `play()` resolves, and `fireEnded()` lets a test
 * drive the sequence forward deterministically, the same technique tests/Audio.test.tsx's own
 * helpers already rely on implicitly (a real `ended` listener, just triggered by hand here).
 */
class FakeAudio {
  src: string;
  private listeners: Record<string, Array<() => void>> = {};
  static instances: FakeAudio[] = [];
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  addEventListener(event: string, cb: () => void) {
    (this.listeners[event] ??= []).push(cb);
  }
  removeEventListener() {}
  play() {
    return Promise.resolve();
  }
  pause() {}
  fireEnded() {
    for (const cb of this.listeners.ended ?? []) cb();
  }
}

const ui = moduleJson.ui as ModuleUiStrings;

const LINES: AudioLine[] = [
  { speaker: 'GUIDE', text: 'いっぽんめの せりふだよ。', audioUrl: '/a0.mp3', pauseAfterMs: 5 },
  { speaker: 'PONTA', text: 'にほんめの せりふだよ。', audioUrl: '/a1.mp3', pauseAfterMs: 5 },
  { speaker: 'ROBOT', text: 'さんぼんめの せりふだよ。', audioUrl: '/a2.mp3', pauseAfterMs: 5 },
];

const REFRAIN_LINES: AudioLine[] = [
  {
    speaker: 'GUIDE',
    text: 'これで、ほんとうに……',
    audioUrl: '/r0.mp3',
    pauseAfterMs: 5,
    refrainSplit: { refrain: 1, completion: 'わかった？' },
  },
  { speaker: 'PONTA', text: '「……わかった？」って。うん、そうだよ。', audioUrl: '/r1.mp3', pauseAfterMs: 5 },
];

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPocket(lines: AudioLine[], guidanceUses: Record<string, number> = {}) {
  const onDone = vi.fn();
  const onGuidanceUse = vi.fn();
  render(
    <AudioScene
      role="MODEL"
      robotLine="fallback"
      lines={lines}
      ui={ui}
      guidanceUses={guidanceUses}
      onGuidanceUse={onGuidanceUse}
      onDone={onDone}
    />,
  );
  return { onDone, onGuidanceUse };
}

describe('ListeningPocket — start screen', () => {
  it('opens with the first line\'s own voice plane carrying a play glyph, and a quiet skip action', () => {
    renderPocket(LINES);
    const plane = screen.getByRole('button', { name: ui.audioPlayLabel! });
    // Post-launch-check work order §B5: GUIDE shows the round "？" mascot glyph, never the old
    // English "GUIDE" text placeholder.
    expect(within(plane).getByText('？')).toBeInTheDocument();
    expect(within(plane).queryByText('GUIDE')).not.toBeInTheDocument();
    expect(within(plane).getByText('いっぽんめの せりふだよ。')).toBeInTheDocument();
    // §B2: an inline-SVG play icon, never the bare Unicode ▶ character (emoji-eligible, renders
    // in colour emoji presentation on iOS Safari).
    expect(plane.querySelector('svg')).toBeInTheDocument();
    expect(within(plane).queryByText('▶')).not.toBeInTheDocument();
    expect(screen.getByText(ui.audioSkipLabel!)).toBeInTheDocument();
  });

  it('the play glyph carries SHOW the first time, NUDGE the second, nothing after that', () => {
    const { container: c0 } = render(
      <AudioScene role="MODEL" robotLine="" lines={LINES} ui={ui} guidanceUses={{}} onGuidanceUse={() => {}} onDone={() => {}} />,
    );
    expect(c0.querySelector('.ad12-guidance--show')).toBeInTheDocument();
    cleanup();

    const { container: c1 } = render(
      <AudioScene role="MODEL" robotLine="" lines={LINES} ui={ui} guidanceUses={{ pocketPlay: 1 }} onGuidanceUse={() => {}} onDone={() => {}} />,
    );
    expect(c1.querySelector('.ad12-guidance--nudge')).toBeInTheDocument();
    cleanup();

    const { container: c2 } = render(
      <AudioScene role="MODEL" robotLine="" lines={LINES} ui={ui} guidanceUses={{ pocketPlay: 2 }} onGuidanceUse={() => {}} onDone={() => {}} />,
    );
    expect(c2.querySelector('.ad12-guidance--show')).not.toBeInTheDocument();
    expect(c2.querySelector('.ad12-guidance--nudge')).not.toBeInTheDocument();
  });

  it('skipping before ever pressing play calls onDone(false)', async () => {
    const user = userEvent.setup();
    const { onDone } = renderPocket(LINES);
    await user.click(screen.getByText(ui.audioSkipLabel!));
    expect(onDone).toHaveBeenCalledWith(false);
  });
});

describe('ListeningPocket — playback', () => {
  it('tapping the first plane starts playback (played=true, guidance use recorded) and shows the current-line progress mark', async () => {
    const user = userEvent.setup();
    const { onGuidanceUse } = renderPocket(LINES);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));

    expect(onGuidanceUse).toHaveBeenCalledWith('pocketPlay');
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]!.src).toBe('/a0.mp3');

    const marks = document.querySelectorAll('.ad12-listening-pocket__mark');
    expect(marks).toHaveLength(3);
    expect(marks[0]!.className).toContain('is-current');
    expect(marks[1]!.className).not.toContain('is-current');
    expect(marks[1]!.className).not.toContain('is-past');
  });

  it('advances through every line in order as each one ends, past marks turning white and the current one yellow', async () => {
    const user = userEvent.setup();
    renderPocket(LINES);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));

    await act(async () => FakeAudio.instances[0]!.fireEnded());
    await waitFor(() => expect(screen.getByText('にほんめの せりふだよ。')).toBeInTheDocument());
    let marks = document.querySelectorAll('.ad12-listening-pocket__mark');
    expect(marks[0]!.className).toContain('is-past');
    expect(marks[1]!.className).toContain('is-current');

    await act(async () => FakeAudio.instances[1]!.fireEnded());
    await waitFor(() => expect(screen.getByText('さんぼんめの せりふだよ。')).toBeInTheDocument());
    marks = document.querySelectorAll('.ad12-listening-pocket__mark');
    expect(marks[1]!.className).toContain('is-past');
    expect(marks[2]!.className).toContain('is-current');
  });

  it('each line renders its own speaker (GUIDE/PONTA/ROBOT), never a fixed single voice', async () => {
    const user = userEvent.setup();
    renderPocket(LINES);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));
    expect(document.querySelector('.ad12-voice-plane--guide')).toBeInTheDocument();

    await act(async () => FakeAudio.instances[0]!.fireEnded());
    await waitFor(() => expect(document.querySelector('.ad12-voice-plane--ponta')).toBeInTheDocument());

    await act(async () => FakeAudio.instances[1]!.fireEnded());
    await waitFor(() => expect(document.querySelector('.ad12-voice-plane--robot')).toBeInTheDocument());
    expect(within(document.querySelector('.ad12-voice-plane--robot') as HTMLElement).getByText(ui.stageRobotName)).toBeInTheDocument();
  });

  it('pause stops the current audio element and shows a resume affordance; resume continues it', async () => {
    const user = userEvent.setup();
    renderPocket(LINES);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));

    const pauseSpy = vi.spyOn(FakeAudio.instances[0]!, 'pause');
    await user.click(screen.getByRole('button', { name: ui.audioPauseLabel! }));
    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: ui.audioResumeLabel! })).toBeInTheDocument();

    const playSpy = vi.spyOn(FakeAudio.instances[0]!, 'play');
    await user.click(screen.getByRole('button', { name: ui.audioResumeLabel! }));
    expect(playSpy).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: ui.audioPauseLabel! })).toBeInTheDocument();
  });

  it('pausing during the brief inter-line gap, then resuming, still reaches the next line (never stuck)', async () => {
    // A comfortably long gap (unlike LINES' own 5ms) so the pause click below reliably lands
    // before the real setTimeout it targets fires — this is a test-timing margin, not a change
    // in the pocket's own behavior at any real gap length.
    const longGapLines: AudioLine[] = [
      { ...LINES[0]!, pauseAfterMs: 300 },
      LINES[1]!,
      LINES[2]!,
    ];
    const user = userEvent.setup();
    renderPocket(longGapLines);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));
    await act(async () => FakeAudio.instances[0]!.fireEnded()); // now in the gap before line 2

    await user.click(screen.getByRole('button', { name: ui.audioPauseLabel! }));
    // Give the (paused, so never-scheduled) gap timer a moment — nothing should advance.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('にほんめの せりふだよ。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: ui.audioResumeLabel! }));
    await waitFor(() => expect(screen.getByText('にほんめの せりふだよ。')).toBeInTheDocument());
  });

  it('replay restarts the whole sequence from line 1, even after reaching the end', async () => {
    const user = userEvent.setup();
    renderPocket(LINES);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));
    await act(async () => FakeAudio.instances[0]!.fireEnded());
    await waitFor(() => expect(screen.getByText('にほんめの せりふだよ。')).toBeInTheDocument());
    await act(async () => FakeAudio.instances[1]!.fireEnded());
    await waitFor(() => expect(screen.getByText('さんぼんめの せりふだよ。')).toBeInTheDocument());
    await act(async () => FakeAudio.instances[2]!.fireEnded());
    await waitFor(() => expect(document.querySelectorAll('.ad12-listening-pocket__mark.is-past')).toHaveLength(3));

    await user.click(screen.getByRole('button', { name: ui.audioReplayLabel! }));
    await waitFor(() => expect(screen.getByText('いっぽんめの せりふだよ。')).toBeInTheDocument());
    const marks = document.querySelectorAll('.ad12-listening-pocket__mark');
    expect(marks[0]!.className).toContain('is-current');
    expect(FakeAudio.instances).toHaveLength(4); // a genuinely new line-1 <audio>, not a reused one
  });

  it('skipping mid-playback calls onDone(true) — heard means playback started, not finished', async () => {
    const user = userEvent.setup();
    const { onDone } = renderPocket(LINES);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));
    await user.click(screen.getByText(ui.audioSkipLabel!));
    expect(onDone).toHaveBeenCalledWith(true);
  });
});

describe('ListeningPocket — R2 refrain (RefrainSlot)', () => {
  it('the PONTA line completing a refrainSplit renders slots (one per non-space character), empty first then filled, plus the remainder text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    renderPocket(REFRAIN_LINES);
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));
    await act(async () => FakeAudio.instances[0]!.fireEnded());
    await vi.waitFor(() => expect(document.querySelector('.ad12-refrain-slot-row')).toBeInTheDocument());

    const row = document.querySelector('.ad12-refrain-slot-row')!;
    const slots = row.querySelectorAll('.ad12-refrain-slot');
    expect(slots).toHaveLength(5); // わ・か・っ・た・？
    expect(row.querySelectorAll('.is-empty')).toHaveLength(5); // yellow, waiting — not filled yet
    // The remainder after the completion is still shown, ruby-safe reading text.
    expect(screen.getByText('って。うん、そうだよ。')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await vi.waitFor(() => expect(row.querySelectorAll('.is-filled')).toHaveLength(5));
    expect(within(row as HTMLElement).getByText('わ')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('？')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('a line NOT completing a refrain renders as an ordinary voice plane, never a slot row', async () => {
    const user = userEvent.setup();
    renderPocket(LINES); // none of these carry refrainSplit
    await user.click(screen.getByRole('button', { name: ui.audioPlayLabel! }));
    await act(async () => FakeAudio.instances[0]!.fireEnded());
    await waitFor(() => expect(screen.getByText('にほんめの せりふだよ。')).toBeInTheDocument());
    expect(document.querySelector('.ad12-refrain-slot-row')).not.toBeInTheDocument();
  });
});
