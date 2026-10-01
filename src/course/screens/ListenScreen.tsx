/**
 * WO-C2 §3.1 (rewrites WO-C1 §3 screen 3) — Listen. One block (one tool) at a time: a real
 * `<audio>` element behind a big play/pause button and a scrubbable progress bar, the transcript
 * below with the current line highlighted and every line tap-to-jump, a 「まとめ」 divider before
 * the recap, and this block's tool card revealing itself once playback reaches the recap and
 * staying visible from then on. 「れんしゅうへ」 unlocks once the audio has reached its end at
 * least once (seeking is allowed — WO-C2 §2: "done when audio played to end once, seeking
 * allowed" — reaching the end by scrubbing counts the same as reaching it by playing through).
 *
 * Coordinator correction (post-WO-C2-report): `CourseTranscriptLine.start` (seconds) is filled in
 * once the audio is recorded — `lineTimeSec` below uses it when present. Until then (every lesson
 * today), it falls back to an EVEN, proportional estimate across the block's own duration, so the
 * recap marker/current-line highlight/tap-to-jump all still work in preview against placeholder
 * audio.
 */
import { useRef, useState } from 'react';
import { Plane } from '../../ad12/Plane';
import { Ruby } from '../../engine/ruby';
import { pontaStandingUrl } from '../characterArt';
import { courseUi } from '../content/courseManifest';
import type { CourseListenBlock } from '../content/types';

export interface ListenScreenProps {
  lessonTitle: string;
  block: CourseListenBlock;
  onDone: () => void;
  onBack: () => void;
}

/** Placeholder-audio fallback duration (seconds), used only while the real file at `block.audio`
 *  hasn't been recorded yet and the `<audio>` element never fires `loadedmetadata` — WO-C2 §7's
 *  own estimated lengths ("Audio A ~5.2min, audio B ~5.6min"), a generic 300s for any other tool. */
const FALLBACK_DURATION_SEC: Partial<Record<string, number>> = { A: 312, B: 336 };

export function ListenScreen({ lessonTitle, block, onDone, onBack }: ListenScreenProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [metadataDuration, setMetadataDuration] = useState<number | null>(null);
  const [currentSec, setCurrentSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [reachedRecap, setReachedRecap] = useState(false);
  // WO-C6 A2: きく has a single continuous track rather than a queue of short clips, so "the line
  // that failed" is this whole track — a quiet もういちど sits by the play control instead of on
  // any one transcript line.
  const [loadFailed, setLoadFailed] = useState(false);
  // Phone only (CSS hides the tab and always shows the transcript at >=700px): the transcript
  // folds behind a ことば tab so the player stays the whole first screen.
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const duration = metadataDuration ?? FALLBACK_DURATION_SEC[block.tool] ?? 300;
  const transcript = block.transcript;

  function lineTimeSec(index: number): number {
    const real = transcript[index]?.start;
    if (real !== undefined) return real;
    return transcript.length > 0 ? (index / transcript.length) * duration : 0;
  }

  const recapIndex = transcript.findIndex((l) => l.section === 'teach');
  const recapTimeSec = recapIndex === -1 ? duration : lineTimeSec(recapIndex);

  let currentLineIndex = -1;
  for (let i = 0; i < transcript.length; i++) {
    if (lineTimeSec(i) <= currentSec) currentLineIndex = i;
  }

  /** Post-launch-check fix (Founder report, domo-ai.com, 30 Sep): the real cause of "plays the
   *  first line, then stops" (reproduced on Mac Chrome too, not just iOS Safari — never an
   *  autoplay/gesture issue). `onTimeUpdate` used to call `seekTo()` below with the position that
   *  SAME event had just reported — re-assigning `audio.currentTime` to (approximately) its own
   *  current value on every single timeupdate tick, several times a second. That is not a no-op:
   *  each write forces the browser to re-seek the real, network-streamed MP3 to the nearest frame
   *  near that byte offset, and against a real file (never an instantly-available local blob) this
   *  compounds until the media pipeline stalls outright — which reads to a family as "the audio
   *  stopped." This handler only ever READS the reported position to update UI state; it must
   *  never write back to `audio.currentTime` — only a genuine seek (scrub drag, transcript tap,
   *  both via `seekTo` below) may do that. */
  function updateFromPlayback(sec: number) {
    const clamped = Math.max(0, Math.min(duration, sec));
    setCurrentSec(clamped);
    if (clamped >= recapTimeSec) setReachedRecap(true);
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

  return (
    <main className="ad12 course-screen course-listen">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{lessonTitle}</h1>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript below is this
          audio's own on-screen caption track (WO-C1's own F8 principle: every audio line is also
          shown as text), just not wired as a native <track>. */}
      <audio
        ref={audioRef}
        src={`/${block.audio}`}
        onTimeUpdate={(e) => updateFromPlayback(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setMetadataDuration(e.currentTarget.duration)}
        onEnded={() => { setReachedEnd(true); setIsPlaying(false); }}
        onPause={() => setIsPlaying(false)}
        onError={() => { setIsPlaying(false); setLoadFailed(true); }}
        onPlaying={() => setLoadFailed(false)}
      />

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
          {recapIndex !== -1 && (
            <span
              className="course-listen__scrub-marker"
              style={{ left: `${(recapTimeSec / duration) * 100}%` }}
            >
              <span className="ad12-ui-text course-listen__scrub-marker-label">{courseUi.listenRecapMarkerLabel}</span>
              <span className="course-listen__scrub-marker-dot" aria-hidden="true" />
            </span>
          )}
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
        {transcript.map((line, i) => {
          const isFirstTeach = line.section === 'teach' && transcript[i - 1]?.section !== 'teach';
          return (
            <div key={i}>
              {isFirstTeach && <p className="ad12-ui-text course-listen__divider">{courseUi.listenSummaryDivider}</p>}
              <button
                type="button"
                className={`course-listen__line ${i === currentLineIndex ? 'course-listen__line--current' : ''}`}
                onClick={() => seekTo(lineTimeSec(i))}
              >
                <span className="ad12-ui-text course-dialogue__speaker">
                  {line.speaker === courseUi.pontaSpeakerName && (
                    <img src={pontaStandingUrl} alt="" className="course-dialogue__speaker-icon" aria-hidden="true" />
                  )}
                  {line.speaker}
                </span>
                <span className="ad12-reading-text"><Ruby text={line.text} /></span>
              </button>
            </div>
          );
        })}
      </section>

      {reachedRecap && (
        <Plane className="course-listen__tool-card">
          <p className="ad12-ui-text"><Ruby text={block.toolCard.when} /></p>
          <p className="ad12-ui-text"><Ruby text={block.toolCard.how} /></p>
        </Plane>
      )}

      <button
        type="button"
        className="ad12-ink-button ad12-tappable course-screen__primary"
        disabled={!reachedEnd}
        onClick={onDone}
      >
        {courseUi.listenToExerciseLabel}
      </button>
    </main>
  );
}
