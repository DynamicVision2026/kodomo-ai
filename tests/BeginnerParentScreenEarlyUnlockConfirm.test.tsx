/**
 * WO-C9 (Founder, 4 Oct 2026): 「はやく ひらく」 used to write straight to `earlyUnlockedParts` on a
 * single tap — no warning that doing so, then opening the lesson (two ordinary taps), permanently
 * ends the 72-hour refund right. This now requires a confirmation dialog in between; only its own
 * 「ひらく」 calls `onEarlyUnlock` — 「やめる」, Escape, or a scrim click must all leave progress
 * untouched.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BeginnerParentScreen } from '../src/course/screens/BeginnerParentScreen';
import { beginnerManifest, getBeginnerLesson } from '../src/course/content/beginnerManifest';
import { emptyCourseProgress } from '../src/course/progress';
import { courseUi } from '../src/course/content/courseManifest';

afterEach(() => cleanup());

function renderScreen(onEarlyUnlock = vi.fn()) {
  render(
    <BeginnerParentScreen
      manifest={beginnerManifest}
      progress={emptyCourseProgress()}
      getLesson={getBeginnerLesson}
      focusLessonId={null}
      onEarlyUnlock={onEarlyUnlock}
      onBack={() => {}}
    />,
  );
  return onEarlyUnlock;
}

describe('BeginnerParentScreen — 「はやく ひらく」 confirmation (WO-C9)', () => {
  it('tapping 「はやく ひらく」 opens a dialog instead of unlocking immediately', async () => {
    const user = userEvent.setup();
    const onEarlyUnlock = renderScreen();

    const [firstEarlyUnlock] = screen.getAllByText(courseUi.parentEarlyUnlockLabel);
    await user.click(firstEarlyUnlock!);

    expect(screen.getByText(courseUi.earlyUnlockConfirmTitle)).toBeInTheDocument();
    expect(screen.getByText(courseUi.earlyUnlockConfirmBody)).toBeInTheDocument();
    expect(onEarlyUnlock).not.toHaveBeenCalled();
  });

  it('「やめる」 closes the dialog without calling onEarlyUnlock', async () => {
    const user = userEvent.setup();
    const onEarlyUnlock = renderScreen();

    const [firstEarlyUnlock] = screen.getAllByText(courseUi.parentEarlyUnlockLabel);
    await user.click(firstEarlyUnlock!);
    await user.click(screen.getByText(courseUi.earlyUnlockConfirmCancelLabel));

    expect(onEarlyUnlock).not.toHaveBeenCalled();
    expect(screen.queryByText(courseUi.earlyUnlockConfirmTitle)).not.toBeInTheDocument();
  });

  it('Escape closes the dialog without calling onEarlyUnlock', async () => {
    const user = userEvent.setup();
    const onEarlyUnlock = renderScreen();

    const [firstEarlyUnlock] = screen.getAllByText(courseUi.parentEarlyUnlockLabel);
    await user.click(firstEarlyUnlock!);
    await user.keyboard('{Escape}');

    expect(onEarlyUnlock).not.toHaveBeenCalled();
    expect(screen.queryByText(courseUi.earlyUnlockConfirmTitle)).not.toBeInTheDocument();
  });

  it('「ひらく」 calls onEarlyUnlock with the lesson id and closes the dialog', async () => {
    const user = userEvent.setup();
    const onEarlyUnlock = renderScreen();

    const [firstEarlyUnlock] = screen.getAllByText(courseUi.parentEarlyUnlockLabel);
    await user.click(firstEarlyUnlock!);
    await user.click(screen.getByText(courseUi.earlyUnlockConfirmOpenLabel));

    expect(onEarlyUnlock).toHaveBeenCalledTimes(1);
    expect(onEarlyUnlock).toHaveBeenCalledWith('b02');
    expect(screen.queryByText(courseUi.earlyUnlockConfirmTitle)).not.toBeInTheDocument();
  });
});
