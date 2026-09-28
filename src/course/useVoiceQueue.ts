import { useEffect, useRef } from 'react';
import { playQueue, stopQueue } from './courseAudioPlayer';

/**
 * Replaces `<VoiceCue src={a}/><VoiceCue src={b}/><VoiceCue src={c}/>` (which used to mount 3
 * separate, simultaneously-autoplaying `<audio>` elements — the actual iOS Safari bug, see
 * courseAudioPlayer.ts's own doc comment) with one queued playback through the shared element.
 * Plays `srcs` in order exactly once per distinct `key` (e.g. the current phase/step identity) —
 * a re-render with the same key is a no-op, matching each individual VoiceCue's own `[src]`-keyed
 * effect before this. Stops whatever is mid-queue on unmount, so leaving a screen never lets a
 * clip keep playing silently into the next one.
 */
export function useVoiceQueue(srcs: (string | undefined)[], key: string): void {
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      playQueue(srcs);
    }
    return stopQueue;
    // `srcs` is intentionally read fresh from the closure, not listed as a dep — `key` is the
    // caller's own stable identity for "which set of clips should be playing right now."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
