/**
 * WO-C5 §3 screen 4 — おうちで. Voiced `title`+`steps`, `wordHints` as small reference cards, then
 * a parent-only area (「おうちの方へ」 + `parentNote` + the big `button`) — pressing it stores a ★
 * (same `stars` counter/semantics as c01-c06's family star, never required for 100%).
 */
import { Plane } from '../../ad12/Plane';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';
import { useVoiceQueue } from '../useVoiceQueue';
import { useAudioError } from '../useAudioError';
import { homeTitleAudioPath, homeStepAudioPath } from '../audioPaths';
import type { CourseHomeTask } from '../content/types';

export interface HomeTaskScreenProps {
  lessonId: string;
  home: CourseHomeTask;
  stars: number;
  onStar: () => void;
  onBack: () => void;
}

export function HomeTaskScreen({ lessonId, home, stars, onStar, onBack }: HomeTaskScreenProps) {
  // WO-C6 A1: おうちで has real recorded audio (title + one clip per step) that was never wired
  // up — queues through the same shared, already-unlocked element every other screen uses.
  useVoiceQueue(
    [homeTitleAudioPath(lessonId), ...home.steps.map((_, i) => homeStepAudioPath(lessonId, i))],
    `home-${lessonId}`,
  );
  const { failedSrc, retry } = useAudioError();

  return (
    <main className="ad12 course-screen course-hometask">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">
        <Ruby text={home.title} />
        {failedSrc === homeTitleAudioPath(lessonId) && (
          <button type="button" className="ad12-ink-button ad12-tappable course-screen__audio-retry" onClick={retry}>{courseUi.audioRetryLabel}</button>
        )}
      </h1>

      <Plane className="course-hometask__steps">
        {home.steps.map((step, i) => (
          <p key={i} className="ad12-ui-text course-hometask__step">
            <Ruby text={step} />
            {failedSrc === homeStepAudioPath(lessonId, i) && (
              <button type="button" className="ad12-ink-button ad12-tappable course-screen__audio-retry" onClick={retry}>{courseUi.audioRetryLabel}</button>
            )}
          </p>
        ))}
      </Plane>

      {home.wordHints.length > 0 && (
        <div className="course-hometask__hints">
          {home.wordHints.map((word, i) => (
            <span key={i} className="course-hometask__hint-card ad12-ui-text">{word}</span>
          ))}
        </div>
      )}

      <Plane className="course-hometask__parent">
        <p className="ad12-ui-text course-hometask__parent-heading">{courseUi.parentHeading}</p>
        <p className="ad12-ui-text">{home.parentNote}</p>
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onStar}>
          {home.button || courseUi.homeButtonFallback}
        </button>
        {stars > 0 && <p className="ad12-ui-text course-hometask__stars">★（{stars}）</p>}
      </Plane>
    </main>
  );
}
