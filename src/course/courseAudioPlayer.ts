/**
 * Founder iPad Safari report (28 Sep 2026): "audio plays the first line, then stops; the progress
 * bar doesn't move." Root cause: VoiceCue.tsx used to mount a BRAND NEW `<audio>` element per
 * clip, autoplaying it from a `useEffect`. iOS Safari only allows a `.play()` call that is a
 * direct result of a user gesture UNLESS the calling element has already been "activated" by one
 * earlier in the same page session — after that, the SAME element may be replayed indefinitely
 * (new `src`, `.play()` from a timer/effect/promise continuation) with no further gesture needed.
 * Several course screens (ExerciseScreen, AuditScreen, TeachBackScreen, FamilyScreen, MakeScreen)
 * mount 2-3+ VoiceCues simultaneously in one render (e.g. ask/reply/feedback together) — only the
 * first of several BRAND NEW elements can ever be gesture-activated, so every clip after it
 * silently failed. This module is the fix: exactly ONE `<audio>`-backed element for the whole
 * course session, never recreated, so "activate once, reuse forever" actually applies.
 *
 * `unlock()` is called from BeginnerLessonScreen.tsx's/LessonScreen.tsx's own step-selection taps
 * (the one place every entry into an audio-driven screen already passes through) so this shared
 * element is always already activated by the time a screen's own effect tries to auto-narrate its
 * first line on mount — no separate silent-clip gesture needed from the child.
 */

const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;
let queue: string[] = [];
let queueIndex = 0;

function getAudioEl(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.addEventListener('ended', playNextInQueue);
    audioEl.addEventListener('error', playNextInQueue);
  }
  return audioEl;
}

function playNextInQueue(): void {
  if (queueIndex >= queue.length) return;
  const src = queue[queueIndex++];
  const el = getAudioEl();
  el.src = `/${src}`;
  el.play().catch(() => {
    // File not recorded yet, or the element genuinely isn't unlocked (shouldn't happen once
    // unlock() has run) — either way, move on rather than getting stuck on one bad clip.
    playNextInQueue();
  });
}

/** Call synchronously inside a real user-gesture click handler, once per page session — a no-op
 *  every time after the first. Plays (and immediately pauses) a near-silent clip purely to
 *  register this ONE element as gesture-activated for the rest of the session. */
export function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  const el = getAudioEl();
  el.src = SILENT_WAV_DATA_URI;
  const p = el.play();
  if (p && typeof p.then === 'function') p.then(() => el.pause()).catch(() => { /* fine either way */ });
}

/**
 * Replaces N simultaneous `<VoiceCue>` mounts with ONE queued, sequential playback through the
 * shared element — `srcs` (falsy entries skipped) play in order, each one advancing to the next
 * on `ended` (or `error`, so one missing/un-recorded file never blocks the rest of the queue).
 * Superseded by the next call (interrupts whatever was still mid-queue).
 */
export function playQueue(srcs: (string | undefined)[]): void {
  queue = srcs.filter((s): s is string => !!s);
  queueIndex = 0;
  playNextInQueue();
}

/** Stops whatever is currently playing/queued — call on screen unmount so leaving mid-queue never
 *  lets a clip keep playing silently into the next screen. */
export function stopQueue(): void {
  queue = [];
  queueIndex = 0;
  audioEl?.pause();
}

/** Test-only: resets module-scoped state between test cases in the same file (the singleton
 *  otherwise persists across every `it()` in one vitest module, same as any other module-level
 *  cache). Never imported by production code. */
export function __resetCourseAudioPlayerForTests(): void {
  audioEl = null;
  unlocked = false;
  queue = [];
  queueIndex = 0;
}
