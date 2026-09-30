import { useEffect, useState } from 'react';
import { onAudioError, retryClip } from './courseAudioPlayer';

/**
 * WO-C6 A2: "if a clip fails to load, show a quiet もういちど button on that line, and never
 * block the lesson." `failedSrc` is the path of whichever queued clip most recently failed (the
 * queue itself has already moved on — see courseAudioPlayer.ts) — a screen compares it against
 * its own known srcs to decide which line/card to show the button on. Clears on unmount (leaving
 * the screen retires that line's own failure) and whenever `retry()` is called.
 */
export function useAudioError(): { failedSrc: string | null; retry: () => void } {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAudioError((src) => setFailedSrc(src));
    return () => {
      unsubscribe();
      setFailedSrc(null);
    };
  }, []);

  function retry() {
    if (!failedSrc) return;
    const src = failedSrc;
    setFailedSrc(null);
    retryClip(src);
  }

  return { failedSrc, retry };
}
