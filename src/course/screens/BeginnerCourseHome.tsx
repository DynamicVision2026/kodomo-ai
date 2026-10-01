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
import { Icon, plantSymbolIdForStage } from '../Icon';
import { Plane } from '../../ad12/Plane';
import { SiteHeader } from '../../ad12/SiteHeader';
import { pontaStandingUrl } from '../characterArt';
import { courseUi } from '../content/courseManifest';
import type { CourseBeginnerLesson, CourseBeginnerManifest } from '../content/types';
import {
  computeBeginnerLessonPercent, computeBeginnerStepUnlocks, flowerStageForPercent, isPartUnlocked,
  allBeginnerLessonsComplete, emptyLessonProgress, type CourseProgressState,
} from '../progress';

/** WO-C6 Push B §2: the single "next" button always names the exact next step — the current lesson's
 *  own next unopened step, never a second, separate progress model from what the lesson hub
 *  itself already unlocks step-by-step. */
function nextStepLabelFor(lesson: CourseBeginnerLesson, progress: CourseProgressState): string {
  const p = progress.lessons[lesson.id] ?? emptyLessonProgress();
  const unlocks = computeBeginnerStepUnlocks(lesson, p);
  const exerciseDone = lesson.exercises.every((e) => p.exercisesDone.includes(e.id));
  const auditDone = lesson.audit.every((a) => p.exercisesDone.includes(a.id));
  const step = !p.listenADone ? courseUi.lessonStepListenSingle
    : !exerciseDone && unlocks.exercise ? courseUi.lessonStepExerciseSingle
    : !auditDone && unlocks.audit ? courseUi.lessonStepAudit
    : courseUi.lessonStepHome;
  return `${courseUi.nextStepPrefix}${courseUi.toolLabels[lesson.tool].label}　${step}`;
}

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
  const coursePercent = percents.length > 0 ? Math.round(percents.reduce((sum, p) => sum + p, 0) / percents.length) : 0;
  const currentLesson = currentIndex !== -1 ? getLesson(lessonParts[currentIndex]!.id) : undefined;

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
      <div className="course-home__heading-row">
        <img src={pontaStandingUrl} alt="" className="course-home__character" aria-hidden="true" />
        <div>
          <h1 className="ad12-reading-text course-home__title">{courseUi.beginnerGardenTitle}</h1>
          <p className="ad12-ui-text course-home__subtitle">{courseUi.gardenSubtitle}</p>
        </div>
        {licensed && (
          <div className="course-home__percent" role="img" aria-label={`${coursePercent}%`}>
            <span className="course-home__percent-track"><span className="course-home__percent-fill" style={{ width: `${coursePercent}%` }} /></span>
            <span className="ad12-ui-text course-home__percent-label">{coursePercent}%</span>
          </div>
        )}
      </div>
      {note && <Plane className="course-home__note"><p className="ad12-ui-text">{note}</p></Plane>}
      <div className="course-home__garden course-home__garden--beginner">
        {lessonParts.map((part, i) => {
          const lesson = getLesson(part.id);
          const percent = percents[i]!;
          const unlocked = licensed && isPartUnlocked(i, lessonParts, percents, progress.earlyUnlockedParts);
          const done = percent >= 100;
          const stage = flowerStageForPercent(licensed ? percent : 0);
          const stageLabel = courseUi.flowerStageLabel[stage];
          return (
            <Plane
              key={part.id}
              className={`course-beginner-flower ${done ? 'course-beginner-flower--done' : ''} ${!unlocked ? 'course-beginner-flower--locked' : ''} ${i === currentIndex ? 'course-beginner-flower--current' : ''}`}
            >
              <button
                type="button"
                className="ad12-tappable course-beginner-flower__button"
                onClick={unlocked ? () => onOpenLesson(part.id) : () => setNote(licensed ? courseUi.lessonLockedNote : courseUi.beginnerLockedCta)}
              >
                <svg width="60" height="66" viewBox="0 0 60 60" className="course-beginner-flower__plant" role="img" aria-label={stageLabel}>
                  <use href={`#${plantSymbolIdForStage(stage)}`} />
                </svg>
                <span className="course-beginner-flower__sign">
                  {lesson && <Icon tool={lesson.tool} size={40} className="course-beginner-flower__icon" />}
                  {done && (
                    <span className="course-beginner-flower__check" aria-hidden="true">
                      <svg width="14" height="14"><use href="#i-check" /></svg>
                    </span>
                  )}
                  {!licensed && (
                    <span className="course-beginner-flower__lock" aria-hidden="true">
                      <svg width="14" height="14"><use href="#i-lock" /></svg>
                    </span>
                  )}
                </span>
                <span className="ad12-ui-text course-beginner-flower__title">{lesson?.title ?? part.id}</span>
              </button>
            </Plane>
          );
        })}
        {endingPart && courseComplete && (
          <Plane className="course-beginner-flower ad12-accent-active">
            <button type="button" className="ad12-tappable course-beginner-flower__button" onClick={onOpenEnding}>
              <span className="ad12-reading-text course-beginner-flower__title">{courseUi.endingPartTitle}</span>
            </button>
          </Plane>
        )}
      </div>

      {licensed && currentLesson && (
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary course-home__next" onClick={() => onOpenLesson(currentLesson.id)}>
          {nextStepLabelFor(currentLesson, progress)}
        </button>
      )}
      {licensed && !courseComplete && <p className="ad12-ui-text course-home__complete-note">{courseUi.gardenCompleteNote}</p>}

      {!licensed && (
        <a className="ad12-ink-button ad12-tappable course-screen__primary" href="/account/?buy=1">
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
