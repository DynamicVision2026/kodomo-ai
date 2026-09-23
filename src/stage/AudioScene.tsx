import { useEffect, useRef, useState } from 'react';
import type { ModuleUiStrings } from '../engine/types';
import type { AudioLine, AudioRole } from '../audio/types';
import { Mascot } from '../shell/Mascot';
import { SpeechBubble } from './SpeechBubble';
import { VoicePlane } from '../ad12/VoicePlane';
import { RefrainSlot } from '../ad12/RefrainSlot';
import { GuidanceAffordance } from '../ad12/GuidanceAffordance';
import { Ruby } from '../engine/ruby';
import '../ad12/tokens.css';
import '../ad12/primitives.css';
import './listening-pocket.css';
import '../shell/mission-shell.css';

export interface AudioSceneProps {
  role: AudioRole;
  /** The mission's own authored layer-0 robotSays, verbatim — see src/audio/types.ts's own doc
   *  comment on `AudioScript.robotLine` for why this is never new copy authored here. Used by
   *  the text-anchor fallback (`lines` absent); ignored once real audio exists. */
  robotLine: string;
  /** The real, per-line playback manifest — present only once real MP3s are committed
   *  (AudioScript.audioStatus 'ready'). Its presence alone decides which of the two screens
   *  below renders; nothing else does. */
  lines?: AudioLine[];
  ui: ModuleUiStrings;
  /** Builder work order §6: the play glyph's own per-profile SHOW -> NUDGE -> (nothing) cue
   *  reuses the SAME guidance infrastructure src/stage/Guidance.tsx already gives yomu/erabu/
   *  mikiwameru — `Profile.guidance` is deliberately untyped beyond those three verbs (see its
   *  own doc comment in src/engine/storage.ts) specifically so a new key like this one's
   *  `'pocketPlay'` can be added without touching that shared type. Optional so the text-anchor
   *  fallback screen (which never shows a play glyph at all) doesn't need to thread it. Typed as
   *  the same loosely-typed shape `Profile.guidance` itself is (src/engine/storage.ts) — never
   *  src/stage/Guidance.tsx's own `GuidanceUses`, which is deliberately narrowed to its three
   *  verbs; this key is neither of those. */
  guidanceUses?: Partial<Record<string, number>>;
  onGuidanceUse?: (key: string) => void;
  /** Builder work order §5 ("1-1 audio priming — verify before modifying"): `played` is true only
   *  when real playback actually started (the child tapped さいせいする at least once), never
   *  merely because this screen was visited/skipped. src/shell/MissionShell.tsx uses this to
   *  decide whether a MODEL script's own `demonstratedLayers` actually apply — before this field
   *  existed, `onDone` carried no such signal and demonstratedLayers was applied unconditionally
   *  whenever a mission HAD a registered MODEL script, regardless of whether the child ever
   *  pressed play. */
  onDone: (played: boolean) => void;
}

/**
 * AD-10 / Audio Reference Scripts rev.3: the child-facing screen for a mission's own MODEL/
 * GUIDED/CHECKPOINT reference audio. Pure dispatcher (no hooks of its own — React's rules of
 * hooks forbid an early-return before a hook call, so each real screen below owns its own state)
 * between the two states a mission's audio can be in: real committed MP3s (`lines` present) or
 * still pending production (`lines` absent) — see AudioScript.audioStatus's own doc comment.
 */
export function AudioScene({ role, robotLine, lines, ui, guidanceUses, onGuidanceUse, onDone }: AudioSceneProps) {
  if (lines && lines.length > 0) {
    return (
      <ListeningPocket
        role={role} lines={lines} ui={ui}
        guidanceUses={guidanceUses ?? {}} onGuidanceUse={onGuidanceUse ?? (() => {})}
        onDone={onDone}
      />
    );
  }
  return <TextAnchorAudioScene role={role} robotLine={robotLine} ui={ui} onDone={onDone} />;
}

/**
 * WO-33 fallback, unchanged: real recorded audio doesn't exist yet for this mission, so this is
 * the PRODUCT PATH the audio will play through once it does — correct placement (decided entirely
 * by src/shell/MissionShell.tsx, never this component) and one explicit continue action, tap-to-
 * advance exactly like every other dialogue beat in the app (WO-24 §4A).
 *
 * Deliberately does not render rev.3's own multi-turn GUIDE/PONTA dialogue as an on-screen
 * transcript: rev.3 itself flags that "any transcript shown on screen needs a Stage 2 ruby pass
 * per AD-05 §3" — not yet done, and doing it here would be real content authoring, not
 * engineering. The one line this screen DOES show — the mission's own layer-0 `robotSays` — is
 * exempt: it is already-reviewed, already-ruby-safe Stage 2 content, copied verbatim (never
 * paraphrased) from the mission's own s2.json, so showing it introduces no new unreviewed text.
 */
function TextAnchorAudioScene({ role, robotLine, ui, onDone }: Omit<AudioSceneProps, 'lines'>) {
  const [revealed, setRevealed] = useState(false);
  // No real audio exists on this fallback path at all — nothing was ever "played", so priming
  // (src/shell/MissionShell.tsx's own demonstratedLayers gate) must never apply here.
  return (
    <div className="mission-shell__wrapper" data-audio-role={role}>
      <Mascot state="curious" />
      {!revealed ? (
        <SpeechBubble
          text={ui.audioListenPrompt ?? ''}
          onAdvance={() => setRevealed(true)}
          advanceLabel={ui.handoffContinue}
        />
      ) : (
        <SpeechBubble
          speaker={ui.stageRobotName}
          text={robotLine}
          onAdvance={() => onDone(false)}
          advanceLabel={ui.handoffContinue}
        />
      )}
    </div>
  );
}

/** GUIDE has no authored, reviewed Japanese display name yet — the design gallery's own Section
 *  9 demo (src/ad12/gallery/main.tsx) already flags this exact gap and uses this same literal
 *  placeholder, with its own comment explaining why: VoicePlane's speakerLabel is caller-supplied
 *  and content-agnostic, and no one has authored/reviewed a real name for this speaker yet. Not
 *  new content — the gallery's own pre-existing stand-in, reused here for consistency. */
const GUIDE_LABEL_PLACEHOLDER = 'GUIDE';

function speakerLabelFor(speaker: AudioLine['speaker'], ui: ModuleUiStrings): string {
  if (speaker === 'ROBOT') return ui.stageRobotName;
  if (speaker === 'PONTA') return ui.stagePontaName ?? '';
  return GUIDE_LABEL_PLACEHOLDER;
}

/** Strips a GUIDE-completing PONTA line's own leading `「……<completion>」` fragment off, leaving
 *  whatever the line says AFTER completing the refrain (often nothing) — the refrain slots
 *  themselves already show the completion text; this is only the remainder. */
function remainderAfterCompletion(text: string, completion: string): string {
  const bracketed = `「……${completion}」`;
  return text.startsWith(bracketed) ? text.slice(bracketed.length) : text;
}

/** Builder work order §6: `completion` split into the individual RefrainSlot characters —
 *  spaces (half- and full-width, the manifests' own natural in-sentence pause convention) never
 *  get their own slot, matching the explicit "excluding spaces" instruction. */
function refrainSlotChars(completion: string): string[] {
  return completion.split('').filter((c) => c !== ' ' && c !== '　');
}

/**
 * Builder work order §6, R2: "the guide speaks the first half -> a pause -> the plane morphs
 * into a RefrainSlot card with yellow slots for the missing words -> ポン太 completes the line
 * and the slots fill." The exact per-character audio timing this describes doesn't exist in the
 * manifest (TTS timing metadata was never authored), so the slots start empty on this beat's own
 * first render and fill together a short beat later — a faithful, not literal-per-character,
 * rendition of that same "completes the line and the slots fill" idea. Whatever the line says
 * after the completion (often nothing) still renders as ordinary reading text below the slots, so nothing
 * of the line is ever lost — F8's "every audio line is shown as text" holds here too.
 */
function RefrainCompletionPlane({
  speakerLabel, refrain, remainder,
}: {
  speakerLabel: string;
  refrain: { refrain: 1 | 2 | 3; completion: string };
  remainder: string;
}) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    setFilled(false);
    const t = window.setTimeout(() => setFilled(true), 300);
    return () => window.clearTimeout(t);
    // Replays only when this is genuinely a different refrain beat, not on every re-render.
  }, [refrain.refrain, refrain.completion]);

  const chars = refrainSlotChars(refrain.completion);

  return (
    <div className="ad12-voice-plane ad12-voice-plane--ponta ad12-voice-plane--refrain">
      <p className="ad12-ui-text ad12-voice-plane__speaker">{speakerLabel}</p>
      <div className="ad12-refrain-slot-row" role="group" aria-label={refrain.completion}>
        {chars.map((c, i) => (
          <RefrainSlot key={i} text={filled ? c : undefined} />
        ))}
      </div>
      {remainder && <p className="ad12-reading-text"><Ruby text={remainder} /></p>}
    </div>
  );
}

/** AD-07 §9's own 2-step schedule, per the Listening Pocket's play glyph specifically (Builder
 *  work order §6: "a yellow breath the first time, spring only the second time, nothing after
 *  that") — deliberately not src/stage/Guidance.tsx's shared 3-tier SHOW/NUDGE/FADE curve (that
 *  one's thresholds are per-verb and tuned for the repeated in-dig decisions; this is a single
 *  one-time affordance a profile only ever needs to see twice). */
function playGlyphLevel(uses: number): 'show' | 'nudge' | 'independent' {
  if (uses === 0) return 'show';
  if (uses === 1) return 'nudge';
  return 'independent';
}

/**
 * Builder work order §6: the Listening Pocket — real sequential playback of a mission's own
 * committed MP3s (Story 1-1/chanto is the first), rebuilt onto VoicePlane/RefrainSlot in place
 * of the original plain さいせいする/つづける buttons. Plays each line's own `<audio>` in order,
 * holding its own `pauseAfterMs` gap between them, restarting from the first line whenever
 * replayed. `onDone` (via 「とばす」, always available) can fire at ANY point — mid-playback or
 * before ever pressing play — and stops whatever is playing first: this screen can never block
 * course progress on the child having actually listened (WO-33's own "optional, never blocks"
 * invariant, unchanged).
 */
function ListeningPocket({
  role, lines, ui, guidanceUses, onGuidanceUse, onDone,
}: Required<Pick<AudioSceneProps, 'role' | 'lines' | 'ui' | 'guidanceUses' | 'onGuidanceUse' | 'onDone'>>) {
  const [index, setIndex] = useState(-1); // -1 = not yet started
  const [played, setPlayed] = useState(false);
  const [paused, setPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  /** The line to resume into once the child un-pauses, whenever pausing happens during the brief
   *  inter-line gap — set the instant a gap's own setTimeout is scheduled (not only when pause
   *  happens to land exactly as that timer starts), so a pause landing at ANY point during the
   *  gap still knows where to resume. Pausing mid-gap simply restarts that gap's own countdown on
   *  resume rather than tracking the exact ms remaining — the gaps are short (350ms-3s) and this
   *  stays correct in the one dimension that matters: nothing is ever skipped or double-played. */
  const pendingLineRef = useRef<number | null>(null);

  function stopPlayback() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingLineRef.current = null;
  }

  useEffect(() => stopPlayback, []);

  function playFrom(i: number) {
    if (i >= lines.length) {
      audioRef.current = null;
      setIndex(lines.length);
      return;
    }
    setIndex(i);
    const audio = new Audio(lines[i]!.audioUrl);
    audioRef.current = audio;
    const advance = () => {
      audioRef.current = null;
      if (pausedRef.current) {
        pendingLineRef.current = i + 1;
        return;
      }
      pendingLineRef.current = i + 1;
      timeoutRef.current = window.setTimeout(() => {
        pendingLineRef.current = null;
        playFrom(i + 1);
      }, lines[i]!.pauseAfterMs);
    };
    audio.addEventListener('ended', advance);
    // A rejected/no-op play() (autoplay policy, or a test environment with no real media
    // pipeline) still has to progress the sequence rather than stall on it forever. jsdom's own
    // HTMLMediaElement.play() returns undefined (not a Promise at all, unlike real browsers) —
    // exposed once a test actually presses play rather than skipping past this screen — so this
    // can't assume a Promise back either.
    const result = audio.play();
    if (result && typeof result.catch === 'function') result.catch(advance);
  }

  function start() {
    setPlayed(true);
    onGuidanceUse('pocketPlay');
    playFrom(0);
  }

  function togglePause() {
    if (paused) {
      setPaused(false);
      pausedRef.current = false;
      const pending = pendingLineRef.current;
      if (pending !== null) {
        pendingLineRef.current = null;
        playFrom(pending);
      } else if (audioRef.current) {
        const result = audioRef.current.play();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
    } else {
      setPaused(true);
      pausedRef.current = true;
      audioRef.current?.pause();
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }

  function replay() {
    stopPlayback();
    setPaused(false);
    pausedRef.current = false;
    setPlayed(true);
    playFrom(0);
  }

  function skip() {
    stopPlayback();
    onDone(played);
  }

  // ---- Start screen: the pocket opens with the first voice plane carrying a large play glyph.
  if (index === -1) {
    const first = lines[0]!;
    return (
      <div className="mission-shell__wrapper ad12-listening-pocket" data-audio-role={role}>
        <VoicePlane
          speaker={first.speaker}
          speakerLabel={speakerLabelFor(first.speaker, ui)}
          text={first.text}
          onAdvance={start}
          advanceLabel={ui.audioPlayLabel ?? ''}
          overlay={
            <GuidanceAffordance level={playGlyphLevel(guidanceUses.pocketPlay ?? 0)}>
              <span className="ad12-listening-pocket__play-glyph ad12-tappable" aria-hidden="true">▶</span>
            </GuidanceAffordance>
          }
        />
        <button type="button" className="ad12-listening-pocket__skip" onClick={skip}>
          {ui.audioSkipLabel}
        </button>
      </div>
    );
  }

  const finished = index >= lines.length;
  const current = finished ? lines[lines.length - 1]! : lines[index]!;
  const prev = index > 0 ? lines[index - 1] : undefined;
  const refrain = !finished && current.speaker === 'PONTA' ? prev?.refrainSplit : undefined;

  return (
    <div className="mission-shell__wrapper ad12-listening-pocket" data-audio-role={role}>
      <div
        className="ad12-listening-pocket__progress"
        role="img"
        aria-label={`${Math.min(index + 1, lines.length)} / ${lines.length}`}
      >
        {lines.map((_, i) => (
          <span
            key={i}
            className={`ad12-listening-pocket__mark${
              i < index || finished ? ' is-past' : i === index ? ' is-current' : ''
            }`}
          />
        ))}
      </div>

      {refrain ? (
        <RefrainCompletionPlane
          speakerLabel={speakerLabelFor(current.speaker, ui)}
          refrain={refrain}
          remainder={remainderAfterCompletion(current.text, refrain.completion)}
        />
      ) : (
        <VoicePlane speaker={current.speaker} speakerLabel={speakerLabelFor(current.speaker, ui)} text={current.text} />
      )}

      <div className="ad12-listening-pocket__controls">
        <button
          type="button"
          className="ad12-listening-pocket__control ad12-tappable"
          onClick={togglePause}
          disabled={finished}
          aria-label={paused ? ui.audioResumeLabel : ui.audioPauseLabel}
        >
          <span aria-hidden="true">{paused ? '▶' : '⏸'}</span>
        </button>
        <button
          type="button"
          className="ad12-listening-pocket__control ad12-tappable"
          onClick={replay}
          aria-label={ui.audioReplayLabel}
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>

      <button type="button" className="ad12-listening-pocket__skip" onClick={skip}>
        {ui.audioSkipLabel}
      </button>
    </div>
  );
}
