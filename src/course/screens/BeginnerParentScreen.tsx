/**
 * WO-C5 §5 — the beginner course's own parent screen. Per lesson: percent (the WO's own "ring" —
 * no ring component exists yet, so shown as text, same as stage2's `ParentScreen`), ★ count, date
 * of the last step, and a short card (title/icon/`home.parentNote`) for the focus lesson. No
 * grades, same as stage2.
 *
 * WO-C9 (Founder, 4 Oct 2026): 「はやく ひらく」 used to write straight to `earlyUnlockedParts` on
 * tap — no warning that doing so, then opening the lesson (two ordinary taps, nothing else in the
 * way of either), permanently ends the 72-hour refund right (`firstPaidUseAt`, set the moment the
 * lesson is actually opened — see `backend/src/handlers/courseLessonOpen.ts`'s own doc comment).
 * This button now opens a confirmation dialog first; only its own 「ひらく」 calls `onEarlyUnlock`.
 * Every lesson this button can ever appear on is already a paid one (b02-b07) that hasn't been
 * reached yet — Lesson 1 (the free sample) is always unlocked from the start (`isPartUnlocked`'s
 * own `index <= 0` rule), so its row never renders this button at all — so no extra "is this a
 * paid, not-yet-opened lesson" check is needed here; the button's own existing `!unlocked`
 * condition already guarantees it. Normal sequential progression (finishing the previous lesson)
 * never goes through this button or this dialog at all.
 */
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Plane } from '../../ad12/Plane';
import { courseUi } from '../content/courseManifest';
import type { CourseBeginnerLesson, CourseBeginnerManifest } from '../content/types';
import { computeBeginnerLessonPercent, isPartUnlocked, type CourseProgressState } from '../progress';

export interface BeginnerParentScreenProps {
  manifest: CourseBeginnerManifest;
  progress: CourseProgressState;
  getLesson: (lessonId: string) => CourseBeginnerLesson | undefined;
  focusLessonId: string | null;
  onEarlyUnlock: (lessonId: string) => void;
  onBack: () => void;
}

function formatLastStep(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.getMonth() + 1}${courseUi.parentMonthLabel}${d.getDate()}${courseUi.parentDayLabel}`;
}

export function BeginnerParentScreen({
  manifest, progress, getLesson, focusLessonId, onEarlyUnlock, onBack,
}: BeginnerParentScreenProps) {
  const lessonParts = manifest.parts.filter((part) => part.kind === 'lesson');
  const percents = lessonParts.map((part) => computeBeginnerLessonPercent(getLesson(part.id)!, progress.lessons[part.id]));
  const focusLesson = focusLessonId ? getLesson(focusLessonId) : undefined;
  const [confirmingLessonId, setConfirmingLessonId] = useState<string | null>(null);

  function cancelEarlyUnlock() {
    setConfirmingLessonId(null);
  }

  function confirmEarlyUnlock() {
    if (confirmingLessonId) onEarlyUnlock(confirmingLessonId);
    setConfirmingLessonId(null);
  }

  // "やめる or closing the dialog changes nothing" — Escape is one more way to close it, same
  // no-op as the scrim click and 「やめる」 itself.
  useEffect(() => {
    if (!confirmingLessonId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirmingLessonId(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmingLessonId]);

  return (
    <main className="ad12 course-screen course-parent">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{courseUi.parentHeading}</h1>

      <Plane className="course-parent__progress">
        <table className="course-parent__table">
          <tbody>
            {lessonParts.map((part, index) => {
              const lesson = getLesson(part.id);
              const percent = percents[index]!;
              const unlocked = isPartUnlocked(index, lessonParts, percents, progress.earlyUnlockedParts);
              const lessonProgress = progress.lessons[part.id];
              return (
                <tr key={part.id}>
                  <td className="ad12-ui-text">{lesson?.title ?? part.id}</td>
                  <td className="ad12-ui-text">{percent}%</td>
                  <td className="ad12-ui-text">{lessonProgress?.stars ? `★（${lessonProgress.stars}）` : ''}</td>
                  <td className="ad12-ui-text">{formatLastStep(lessonProgress?.lastStepAt ?? '')}</td>
                  <td>
                    {!unlocked && lesson && (
                      <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setConfirmingLessonId(part.id)}>
                        {courseUi.parentEarlyUnlockLabel}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Plane>

      {focusLesson && (
        <Plane className="course-parent__card">
          <Icon tool={focusLesson.tool} size={48} />
          <p className="ad12-ui-text course-parent__card-title">{focusLesson.title}</p>
          <p className="ad12-ui-text">{focusLesson.home.parentNote}</p>
        </Plane>
      )}

      {confirmingLessonId && (
        <div className="course-parent__confirm-scrim" onClick={cancelEarlyUnlock}>
          <div
            className="ad12-plane course-parent__confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="early-unlock-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="early-unlock-confirm-title" className="ad12-reading-text">{courseUi.earlyUnlockConfirmTitle}</h2>
            <p className="ad12-ui-text">{courseUi.earlyUnlockConfirmBody}</p>
            <div className="course-parent__confirm-actions">
              <button type="button" className="ad12-ink-button ad12-tappable" onClick={cancelEarlyUnlock}>
                {courseUi.earlyUnlockConfirmCancelLabel}
              </button>
              <button type="button" className="course-parent__confirm-open ad12-tappable" onClick={confirmEarlyUnlock}>
                {courseUi.earlyUnlockConfirmOpenLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
