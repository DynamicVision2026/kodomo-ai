/**
 * WO-C1 §3 screen 8 — Parent screen. Per-lesson percent + last-step date (WO-C1 §4's own "date of
 * the last step" per lesson), an early-unlock action on the one part that's otherwise locked
 * behind the previous part's 100% (WO-C1 §4: "A parent can open the next part early"), and the
 * current/most-relevant lesson's `parentCard` (method note + sources + dinner question).
 */
import { Plane } from '../../ad12/Plane';
import { courseUi } from '../content/courseManifest';
import type { CourseLesson, CourseManifest } from '../content/types';
import { computeLessonPercent, isPartUnlocked, type CourseProgressState } from '../progress';

export interface ParentScreenProps {
  manifest: CourseManifest;
  progress: CourseProgressState;
  getLesson: (partId: string) => CourseLesson | undefined;
  /** The lesson whose `parentCard` is shown below the progress list — the one currently open in
   *  the child's own lesson screen, when there is one. */
  focusLessonId: string | null;
  onEarlyUnlock: (partId: string) => void;
  onBack: () => void;
}

function formatLastStep(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.getMonth() + 1}${courseUi.parentMonthLabel}${d.getDate()}${courseUi.parentDayLabel}`;
}

export function ParentScreen({ manifest, progress, getLesson, focusLessonId, onEarlyUnlock, onBack }: ParentScreenProps) {
  const lessonParts = manifest.parts.filter((p) => p.kind === 'lesson');
  const percents = manifest.parts.map((part) => {
    const lesson = part.kind === 'lesson' ? getLesson(part.id) : undefined;
    return lesson ? computeLessonPercent(lesson, progress.lessons[part.id]) : 0;
  });
  const focusLesson = focusLessonId ? getLesson(focusLessonId) : undefined;

  return (
    <main className="ad12 course-screen course-parent">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{courseUi.parentHeading}</h1>

      <Plane className="course-parent__progress">
        <table className="course-parent__table">
          <tbody>
            {lessonParts.map((part) => {
              const index = manifest.parts.indexOf(part);
              const lesson = getLesson(part.id);
              const percent = percents[index]!;
              const unlocked = isPartUnlocked(index, manifest.parts, percents, progress.earlyUnlockedParts);
              const lastStepAt = progress.lessons[part.id]?.lastStepAt ?? '';
              return (
                <tr key={part.id}>
                  <td className="ad12-ui-text">{lesson?.title ?? part.id}</td>
                  <td className="ad12-ui-text">{percent}%</td>
                  <td className="ad12-ui-text">{formatLastStep(lastStepAt)}</td>
                  <td>
                    {!unlocked && lesson && (
                      <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => onEarlyUnlock(part.id)}>
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
          <p className="ad12-ui-text course-parent__card-title">{focusLesson.title}</p>
          <p className="ad12-ui-text">{focusLesson.parentCard.tool}</p>
          <p className="ad12-ui-text">{focusLesson.parentCard.method}</p>
          {focusLesson.parentCard.sources.length > 0 && (
            <ul className="course-parent__sources">
              {focusLesson.parentCard.sources.map((s, i) => (
                <li key={i} className="ad12-ui-text">
                  {s.label}{s.status !== 'approved' ? `（${s.status}）` : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="ad12-ui-text course-parent__dinner-question">{focusLesson.parentCard.dinnerQuestion}</p>
        </Plane>
      )}
    </main>
  );
}
