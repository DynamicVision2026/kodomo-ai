/**
 * WO-C1 §3 screen 1 — Course Home, the 13-flower garden: flower 1 is the Playground (m1),
 * flowers 2-13 are the course's own 12 lessons, in manifest order. Reuses `HomePlane` (AD-12)
 * unchanged — each flower is one HomePlane row, `current`/`locked` computed from the same
 * `isPartUnlocked`/`flowerStageForPercent` math `tests/courseProgress.test.ts` already covers.
 *
 * A locked or not-yet-authored flower stays tappable (same "still tappable, shows a diegetic
 * explanation instead of entering" idea `BankPlane` already established for a locked Bank Dig —
 * not the same component, since HomePlane has no such prop, but the same UX language) rather than
 * disabled, so a curious tap is never a dead end.
 */
import { useState } from 'react';
import { HomePlane } from '../../ad12/HomePlane';
import { Plane } from '../../ad12/Plane';
import { courseUi } from '../content/courseManifest';
import type { CourseLesson, CourseManifest } from '../content/types';
import {
  computeLessonPercent, playgroundFlowerPercent, flowerStageForPercent, isPartUnlocked,
  type CourseProgressState,
} from '../progress';

export interface CourseHomeProps {
  manifest: CourseManifest;
  progress: CourseProgressState;
  /** `getLesson(part.id)` for every `kind: 'lesson'` part — `undefined` for a part not yet
   *  authored (WO-C1's own "real content arrives later, one lesson at a time"). */
  getLesson: (partId: string) => CourseLesson | undefined;
  /** WO-C1 §4/Coordinator: "The Playground (m1) counts as flower 1... 12.5% per completed story
   *  mission." `storyIds` is `module.json`'s own `missionOrder`; `missionDone` is read from the
   *  Playground's existing progress doc — see CourseApp.tsx's own fetch. */
  playgroundStoryIds: string[];
  playgroundMissionDone: Record<string, boolean>;
  onOpenPlayground: () => void;
  onOpenLesson: (lessonId: string) => void;
  onOpenParent: () => void;
  onOpenDemo: () => void;
}

export function CourseHome({
  manifest, progress, getLesson, playgroundStoryIds, playgroundMissionDone,
  onOpenPlayground, onOpenLesson, onOpenParent, onOpenDemo,
}: CourseHomeProps) {
  const [note, setNote] = useState<string | null>(null);

  const percents = manifest.parts.map((part) =>
    part.kind === 'playground'
      ? playgroundFlowerPercent(playgroundStoryIds, playgroundMissionDone)
      : computeLessonPercent(getLesson(part.id) ?? emptyLessonForUnauthored, progress.lessons[part.id]),
  );

  const currentIndex = percents.findIndex((p, i) => p < 100 && isPartUnlocked(i, manifest.parts, percents, progress.earlyUnlockedParts));

  return (
    <main className="ad12 course-home">
      <h1 className="ad12-reading-text course-home__title">{courseUi.gardenTitle}</h1>
      {note && <Plane className="course-home__note"><p className="ad12-ui-text">{note}</p></Plane>}
      <div className="course-home__garden">
        {manifest.parts.map((part, i) => {
          const unlocked = isPartUnlocked(i, manifest.parts, percents, progress.earlyUnlockedParts);
          const percent = percents[i]!;
          const done = percent >= 100;
          const stageLabel = courseUi.flowerStageLabel[flowerStageForPercent(percent)];
          if (part.kind === 'playground') {
            return (
              <HomePlane
                key={part.id}
                title={`${courseUi.playgroundFlowerTitle}（${stageLabel}）`}
                done={done}
                current={i === currentIndex}
                locked={!unlocked}
                onSelect={onOpenPlayground}
              />
            );
          }
          const lesson = getLesson(part.id);
          if (!lesson) {
            return (
              <HomePlane
                key={part.id}
                title={`${courseUi.nextStoryFlowerTitle}（${stageLabel}）`}
                done={false}
                current={false}
                locked={true}
                onSelect={() => setNote(courseUi.lessonNotYetNote)}
              />
            );
          }
          return (
            <HomePlane
              key={part.id}
              title={`${lesson.title}（${stageLabel}）`}
              done={done}
              current={i === currentIndex}
              locked={!unlocked}
              onSelect={unlocked ? () => onOpenLesson(part.id) : () => setNote(courseUi.lessonLockedNote)}
            />
          );
        })}
      </div>
      <div className="course-home__footer">
        <button type="button" className="ad12-ink-button ad12-tappable" onClick={onOpenParent}>
          {courseUi.parentLinkLabel}
        </button>
        <button type="button" className="ad12-ink-button ad12-tappable" onClick={onOpenDemo}>
          {courseUi.demoLinkLabel}
        </button>
      </div>
    </main>
  );
}

/** A lesson-shaped zero-exercise placeholder so `computeLessonPercent` (which divides by
 *  `lesson.exercises.length`) never runs against `undefined` for a not-yet-authored part — always
 *  yields 0%, which is what an unauthored flower's stage should show regardless. */
const emptyLessonForUnauthored: CourseLesson = {
  id: '', title: '', tools: [], practice: 'single',
  review: { model: '', philosophy: null, japanese: null },
  listen: { audio: '', transcript: [], methodCards: [] },
  exercises: [], make: [], teachBack: { prompt: '' },
  family: { whoKnows: '', aiExample: '', applyTool: '', notes: [] },
  parentCard: { tool: '', method: '', sources: [], dinnerQuestion: '' },
};
