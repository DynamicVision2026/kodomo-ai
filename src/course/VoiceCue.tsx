/**
 * WO-C2b: a single-shot, invisible autoplaying voice line — the app-side counterpart to
 * ListenScreen's own player, for the ~250 individually-recorded practice/make/teach-back/family
 * lines (never scrubbable, never re-playable by the child; they play once when their own text
 * appears, same "every audio line is also shown as text" principle ListenScreen already follows).
 * Tolerates a missing file exactly like ListenScreen's own `<audio>` does — real audio isn't
 * recorded yet (WO-C2b), so every mount of this component is expected to 404 silently in preview
 * until the real clips exist.
 */
import { useEffect, useRef } from 'react';

export interface VoiceCueProps {
  /** A site-root-relative path (e.g. from src/course/audioPaths.ts) — `undefined` renders
   *  nothing, so a caller can pass a conditional path without an extra guard. */
  src: string | undefined;
}

export function VoiceCue({ src }: VoiceCueProps) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    ref.current?.play().catch(() => { /* file not recorded yet, or autoplay blocked — ignore */ });
  }, [src]);

  if (!src) return null;
  return <audio ref={ref} src={`/${src}`} preload="auto" />;
}
