/** WO-C1 §3 screen 2 — Lesson. The hub for one lesson: its four steps (listen/exercise/make/
 *  teach-back) plus the family-inquiry link, each showing whether it's already done. Exercises
 *  and make blocks resume where the child left off (via `progress`), never restart from zero. */
import { Icon } from '../Icon';
import { Plane } from '../../ad12/Plane';
import { courseUi } from '../content/courseManifest';
import type { CourseLesson } from '../content/types';
import { computeLessonPercent, emptyLessonProgress, type CourseLessonProgress } from '../progress';

export interface LessonScreenProps {
  lesson: CourseLesson;
  progress: CourseLessonProgress | undefined;
  onOpenListen: () => void;
  onOpenExercise: () => void;
  onOpenMake: () => void;
  onOpenTeachBack: () => void;
  onOpenFamily: () => void;
  onBack: () => void;
}

export function LessonScreen({
  lesson, progress, onOpenListen, onOpenExercise, onOpenMake, onOpenTeachBack, onOpenFamily, onBack,
}: LessonScreenProps) {
  const p = progress ?? emptyLessonProgress();
  const percent = computeLessonPercent(lesson, p);
  const exercisesDoneCount = p.exercisesDone.filter((id) => lesson.exercises.some((e) => e.id === id)).length;

  return (
    <main className="ad12 course-screen course-lesson">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{lesson.title}</h1>
      <div className="course-lesson__tools">
        {lesson.tools.map((tool) => <Icon key={tool} tool={tool} size={48} />)}
      </div>
      <p className="ad12-ui-text">{percent}%</p>

      <div className="course-lesson__steps">
        <LessonStep label={courseUi.lessonStepListen} done={p.listenDone} onSelect={onOpenListen} />
        <LessonStep
          label={`${courseUi.lessonStepExercise}（${exercisesDoneCount}/${lesson.exercises.length}）`}
          done={exercisesDoneCount >= lesson.exercises.length}
          onSelect={onOpenExercise}
        />
        <LessonStep label={courseUi.lessonStepMake} done={p.makeDone} onSelect={onOpenMake} />
        <LessonStep label={courseUi.lessonStepTeachBack} done={p.teachBackDone} onSelect={onOpenTeachBack} />
      </div>

      <button type="button" className="ad12-ink-button ad12-tappable" onClick={onOpenFamily}>
        {courseUi.familyLinkLabel}
      </button>
    </main>
  );
}

function LessonStep({ label, done, onSelect }: { label: string; done: boolean; onSelect: () => void }) {
  return (
    <Plane className={`course-lesson__step ${done ? 'course-lesson__step--done' : ''}`}>
      <button type="button" className="ad12-ink-button ad12-tappable course-lesson__step-button" onClick={onSelect}>
        <span className="ad12-reading-text">{label}</span>
        {done && <span className="ad12-ui-text course-lesson__step-check">✓</span>}
      </button>
    </Plane>
  );
}
