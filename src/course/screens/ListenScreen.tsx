/**
 * WO-C2 §3.1 (rewrites WO-C1 §3 screen 3) — Listen. One block (one tool) at a time: a real
 * `<audio>` element behind a big play/pause button and a scrubbable progress bar, the transcript
 * below with the current line highlighted and every line tap-to-jump, a 「まとめ」 divider before
 * the recap, and this block's tool card revealing itself once playback reaches the recap and
 * staying visible from then on. 「れんしゅうへ」 unlocks once the audio has reached its end at
 * least once (seeking is allowed — WO-C2 §2: "done when audio played to end once, seeking
 * allowed" — reaching the end by scrubbing counts the same as reaching it by playing through).
 *
 * DEVIATION / flagged assumption: `CourseTranscriptLine` carries no per-line timestamp (the real
 * audio scripts aren't recorded yet — WO-C2 instruction 5) so the recap marker's position, the
 * current-line highlight, and tap-to-jump all use an EVEN, proportional estimate
 * (`lineTimeSec` below) across the block's own duration, not real per-line timing. This is a
 * placeholder until real audio + per-line timestamps exist; flagged in the WO-C2 completion report
 * rather than resolved silently, per "if a field doesn't fit, tell me."
 */
import { useRef, useState } from 'react';
import { Plane } from '../../ad12/Plane';
import { Ruby } from '../../engine/ruby';
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

  const duration = metadataDuration ?? FALLBACK_DURATION_SEC[block.tool] ?? 300;
  const transcript = block.transcript;

  function lineTimeSec(index: number): number {
    return transcript.length > 0 ? (index / transcript.length) * duration : 0;
  }

  const recapIndex = transcript.findIndex((l) => l.section === 'teach');
  const recapTimeSec = recapIndex === -1 ? duration : lineTimeSec(recapIndex);

  let currentLineIndex = -1;
  for (let i = 0; i < transcript.length; i++) {
    if (lineTimeSec(i) <= currentSec) currentLineIndex = i;
  }

  function seekTo(sec: number) {
    const clamped = Math.max(0, Math.min(duration, sec));
    const audio = audioRef.current;
    if (audio) {
      try { audio.currentTime = clamped; } catch { /* file not present yet in preview — ignore */ }
    }
    setCurrentSec(clamped);
    if (clamped >= recapTimeSec) setReachedRecap(true);
    if (clamped >= duration - 0.25) setReachedEnd(true);
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
        onTimeUpdate={(e) => seekTo(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setMetadataDuration(e.currentTarget.duration)}
        onEnded={() => { setReachedEnd(true); setIsPlaying(false); }}
        onPause={() => setIsPlaying(false)}
      />

      <Plane className="course-listen__player">
        <button type="button" className="ad12-ink-button ad12-tappable course-listen__play" onClick={togglePlay}>
          {isPlaying ? courseUi.listenPauseLabel : courseUi.listenPlayLabel}
        </button>
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
              aria-hidden="true"
            />
          )}
        </div>
      </Plane>

      <section className="course-listen__transcript">
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
                <span className="ad12-ui-text course-dialogue__speaker">{line.speaker}</span>
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
