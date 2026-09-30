/**
 * WO-C5 §4 — 入門コースの にわ: 7 flowers, one per lesson (b01-b07), grey until 100%, each showing
 * its own lesson's tool icon (WO-C5 §4's own "icon per lesson" — the one reason this doesn't just
 * reuse `HomePlane` verbatim like the stage2 `CourseHome` does: `HomePlane` has no icon slot).
 * Sequential unlock/early-unlock/replay-never-lowers-progress reuse the exact same
 * `isPartUnlocked`/`flowerStageForPercent` math as stage2's own garden. The final page (ending)
 * appears as an 8th plane once all 7 lessons are 100%.
 *
 * WO-C5 §6: when `licensed` is false, every lesson plane is forced locked regardless of progress,
 * and tapping one shows the purchase CTA instead of the ordinary "not yet unlocked" note — no free
 * preview of any lesson content.
 */
import { useState } from 'react';
import { Icon } from '../Icon';
import { Plane } from '../../ad12/Plane';
import { SiteHeader } from '../../ad12/SiteHeader';
import { courseUi } from '../content/courseManifest';
import type { CourseBeginnerLesson, CourseBeginnerManifest } from '../content/types';
import {
  computeBeginnerLessonPercent, flowerStageForPercent, isPartUnlocked, allBeginnerLessonsComplete,
  type CourseProgressState,
} from '../progress';

export interface BeginnerCourseHomeProps {
  manifest: CourseBeginnerManifest;
  progress: CourseProgressState;
  licensed: boolean;
  getLesson: (lessonId: string) => CourseBeginnerLesson | undefined;
  onOpenLesson: (lessonId: string) => void;
  onOpenEnding: () => void;
  onOpenParent: () => void;
}

export function BeginnerCourseHome({
  manifest, progress, licensed, getLesson, onOpenLesson, onOpenEnding, onOpenParent,
}: BeginnerCourseHomeProps) {
  const [note, setNote] = useState<string | null>(null);
  const lessonParts = manifest.parts.filter((part) => part.kind === 'lesson');
  const endingPart = manifest.parts.find((part) => part.kind === 'ending');

  const percents = lessonParts.map((part) => computeBeginnerLessonPercent(getLesson(part.id)!, progress.lessons[part.id]));
  const courseComplete = allBeginnerLessonsComplete(percents);
  const currentIndex = licensed
    ? percents.findIndex((p, i) => p < 100 && isPartUnlocked(i, lessonParts, percents, progress.earlyUnlockedParts))
    : -1;

  return (
    <main className="ad12 course-home">
      <SiteHeader
        ui={{
          brandLabel: courseUi.siteHeaderBrandLabel,
          playgroundLabel: courseUi.siteHeaderPlaygroundLabel,
          courseLabel: courseUi.siteHeaderCourseLabel,
          accountLabel: courseUi.siteHeaderAccountLabel,
          logoutLabel: courseUi.siteHeaderLogoutLabel,
        }}
        current="course"
        homeHref="/course/beginner/"
      />
      <h1 className="ad12-reading-text course-home__title">{courseUi.beginnerGardenTitle}</h1>
      {note && <Plane className="course-home__note"><p className="ad12-ui-text">{note}</p></Plane>}
      <div className="course-home__garden">
        {lessonParts.map((part, i) => {
          const lesson = getLesson(part.id);
          const percent = percents[i]!;
          const unlocked = licensed && isPartUnlocked(i, lessonParts, percents, progress.earlyUnlockedParts);
          const done = percent >= 100;
          const stageLabel = courseUi.flowerStageLabel[flowerStageForPercent(licensed ? percent : 0)];
          return (
            <Plane
              key={part.id}
              className={`course-beginner-flower ${done ? 'course-beginner-flower--done' : ''} ${!unlocked ? 'course-beginner-flower--locked' : ''} ${i === currentIndex ? 'ad12-accent-active' : ''}`}
            >
              <button
                type="button"
                className="ad12-tappable course-beginner-flower__button"
                onClick={unlocked ? () => onOpenLesson(part.id) : () => setNote(licensed ? courseUi.lessonLockedNote : courseUi.beginnerLockedCta)}
              >
                {lesson && <Icon tool={lesson.tool} size={48} className="course-beginner-flower__icon" />}
                <span className="ad12-reading-text course-beginner-flower__title">{lesson?.title ?? part.id}（{stageLabel}）</span>
              </button>
            </Plane>
          );
        })}
        {endingPart && courseComplete && (
          <Plane className="course-beginner-flower">
            <button type="button" className="ad12-tappable course-beginner-flower__button" onClick={onOpenEnding}>
              <span className="ad12-reading-text course-beginner-flower__title">{courseUi.endingPartTitle}</span>
            </button>
          </Plane>
        )}
      </div>

      {!licensed && (
        <a className="ad12-ink-button ad12-tappable course-screen__primary" href="/account/">
          {courseUi.beginnerLockedCta}
        </a>
      )}

      <div className="course-home__footer">
        <button type="button" className="ad12-ink-button ad12-tappable" onClick={onOpenParent}>
          {courseUi.parentLinkLabel}
        </button>
      </div>
    </main>
  );
}
