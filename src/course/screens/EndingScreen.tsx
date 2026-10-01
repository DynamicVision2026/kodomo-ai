/**
 * WO-C5 §3 screen 5 — さいごのページ. Opens once all 7 lessons are 100%: plays `b-ending.json`'s
 * own audio+transcript (the same audio-scrub/tap-to-jump idiom `ListenScreen` uses, written fresh
 * here rather than reusing that component directly — `CourseEndingLesson` genuinely doesn't carry
 * `tool`/`methodCards`/`thenExercises`/`toolCard`, so it isn't a `CourseListenBlock`), then the
 * full-screen `screenLine`/`screenSub` message, then はなまる + the printable 親子認定証
 * (`CompletionRitual.tsx`'s own certificate step, reused verbatim: `certificateHeading`/
 * `certificateBlankLabel`/Print Centre link, never rendering the certificate's real content here).
 */
import { useRef, useState } from 'react';
import { Plane } from '../../ad12/Plane';
import { Ruby } from '../../engine/ruby';
import { plantSymbolIdForStage } from '../Icon';
import { hatenaDiscoveryUrl, pontaStandingUrl } from '../characterArt';
import { courseUi } from '../content/courseManifest';
import type { CourseEndingLesson } from '../content/types';

export interface EndingScreenProps {
  lesson: CourseEndingLesson;
  onDone: () => void;
  onBack: () => void;
}

type Step = 'listen' | 'message' | 'certificate';

export function EndingScreen({ lesson, onDone, onBack }: EndingScreenProps) {
  const [step, setStep] = useState<Step>('listen');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentSec, setCurrentSec] = useState(0);
  const [duration, setDuration] = useState(160);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  // WO-C6 A2: same single-track reasoning as ListenScreen.tsx's own `loadFailed`.
  const [loadFailed, setLoadFailed] = useState(false);
  // Phone only (CSS hides the tab and always shows the transcript at >=700px): the transcript
  // folds behind a ことば tab so the player stays the whole first screen.
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  function lineTimeSec(index: number): number {
    const real = lesson.transcript[index]?.start;
    if (real !== undefined) return real;
    return lesson.transcript.length > 0 ? (index / lesson.transcript.length) * duration : 0;
  }

  let currentLineIndex = -1;
  for (let i = 0; i < lesson.transcript.length; i++) {
    if (lineTimeSec(i) <= currentSec) currentLineIndex = i;
  }

  /** Post-launch-check fix (Founder report, domo-ai.com, 30 Sep) — same bug and same fix as
   *  ListenScreen.tsx's own identical `updateFromPlayback`/`seekTo` split: `onTimeUpdate` must
   *  only ever READ the reported position, never write it back to `audio.currentTime` (that
   *  re-seeks a real, network-streamed file to ~its own position several times a second, which
   *  stalls real playback outright — see that file's own doc comment for the full mechanism). */
  function updateFromPlayback(sec: number) {
    const clamped = Math.max(0, Math.min(duration, sec));
    setCurrentSec(clamped);
    if (clamped >= duration - 0.25) setReachedEnd(true);
  }

  function seekTo(sec: number) {
    const clamped = Math.max(0, Math.min(duration, sec));
    const audio = audioRef.current;
    if (audio) {
      try { audio.currentTime = clamped; } catch { /* file not present yet in preview — ignore */ }
    }
    updateFromPlayback(sec);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => { /* placeholder audio may not exist yet in preview */ });
      setIsPlaying(true);
    }
  }

  function retryLoad() {
    const audio = audioRef.current;
    if (!audio) return;
    setLoadFailed(false);
    audio.load();
    audio.play().catch(() => setLoadFailed(true));
    setIsPlaying(true);
  }

  if (step === 'message') {
    return (
      <main className="ad12 course-screen course-ending course-ending--message">
        <div className="course-ending__cast" aria-hidden="true">
          <img src={hatenaDiscoveryUrl} alt="" className="course-ending__character" />
          <img src={pontaStandingUrl} alt="" className="course-ending__character" />
        </div>
        <div className="course-ending__bloom" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <svg key={i} width="48" height="53" viewBox="0 0 60 60"><use href={`#${plantSymbolIdForStage('flower')}`} /></svg>
          ))}
        </div>
        <p className="ad12-reading-text"><Ruby text={lesson.screenLine} /></p>
        <p className="ad12-ui-text">{lesson.screenSub}</p>
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={() => setStep('certificate')}>
          {courseUi.practice.nextLabel}
        </button>
      </main>
    );
  }

  if (step === 'certificate') {
    return (
      <main className="ad12 course-screen course-ending course-ending--certificate">
        <span className="course-ending__seal" aria-hidden="true">◎</span>
        <p className="ad12-reading-text">{courseUi.beginnerHanamaruLabel}</p>
        <p className="ad12-reading-text course-ending__certificate-heading">{courseUi.certificateHeading}</p>
        <p className="ad12-ui-text">{courseUi.certificateBlankLabel}</p>
        <button
          type="button"
          className="ad12-ink-button ad12-tappable"
          onClick={() => window.open('/print/centre/', '_blank', 'noopener')}
        >
          {courseUi.printCentreLabel}
        </button>
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onDone}>
          {courseUi.certificateContinueLabel}
        </button>
      </main>
    );
  }

  return (
    <main className="ad12 course-screen course-ending course-ending--listen">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{lesson.title}</h1>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- same on-screen-caption reasoning
          as ListenScreen.tsx's own identical audio element. */}
      <audio
        ref={audioRef}
        src={`/${lesson.audio}`}
        onTimeUpdate={(e) => updateFromPlayback(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { setReachedEnd(true); setIsPlaying(false); }}
        onPause={() => setIsPlaying(false)}
        onError={() => { setIsPlaying(false); setLoadFailed(true); }}
        onPlaying={() => setLoadFailed(false)}
      />

      <Plane className="course-exercise__scene">
        <p className="ad12-ui-text"><Ruby text={lesson.scene} /></p>
      </Plane>

      <Plane className="course-listen__player">
        <button type="button" className="ad12-ink-button ad12-tappable course-listen__play" onClick={togglePlay}>
          {isPlaying ? courseUi.listenPauseLabel : courseUi.listenPlayLabel}
        </button>
        {loadFailed && (
          <button type="button" className="ad12-ink-button ad12-tappable course-screen__audio-retry" onClick={retryLoad}>{courseUi.audioRetryLabel}</button>
        )}
        <div className="course-listen__scrub">
          <input
            type="range"
            className="course-listen__scrub-input"
            aria-label={courseUi.listenPlayLabel}
            min={0}
            max={duration}
            step={0.1}
            value={currentSec}
            onChange={(e) => seekTo(Number(e.target.value))}
          />
        </div>
      </Plane>

      <button
        type="button"
        className="ad12-tappable course-listen__tab"
        aria-expanded={transcriptOpen}
        onClick={() => setTranscriptOpen((o) => !o)}
      >
        {courseUi.listenTranscriptTabLabel}
      </button>
      <h2 className={`ad12-ui-text course-listen__transcript-heading ${transcriptOpen ? 'is-open' : ''}`}>{courseUi.listenTranscriptHeading}</h2>
      <section className={`course-listen__transcript ${transcriptOpen ? 'is-open' : ''}`}>
        {lesson.transcript.map((line, i) => (
          <button
            key={i}
            type="button"
            className={`course-listen__line ${i === currentLineIndex ? 'course-listen__line--current' : ''}`}
            onClick={() => seekTo(lineTimeSec(i))}
          >
            <span className="ad12-ui-text course-dialogue__speaker">{line.speaker}</span>
            <span className="ad12-reading-text"><Ruby text={line.text} /></span>
          </button>
        ))}
      </section>

      <button
        type="button"
        className="ad12-ink-button ad12-tappable course-screen__primary"
        disabled={!reachedEnd}
        onClick={() => setStep('message')}
      >
        {courseUi.practice.nextLabel}
      </button>
    </main>
  );
}
