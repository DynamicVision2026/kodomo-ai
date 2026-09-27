/**
 * WO-C5 §5 — the beginner course's own parent screen. Per lesson: percent (the WO's own "ring" —
 * no ring component exists yet, so shown as text, same as stage2's `ParentScreen`), ★ count, date
 * of the last step, and a short card (title/icon/`home.parentNote`) for the focus lesson. No
 * grades, same as stage2.
 */
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
          <Icon tool={focusLesson.tool} size={48} />
          <p className="ad12-ui-text course-parent__card-title">{focusLesson.title}</p>
          <p className="ad12-ui-text">{focusLesson.home.parentNote}</p>
        </Plane>
      )}
    </main>
  );
}
