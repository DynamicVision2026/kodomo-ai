/**
 * WO-C1: a small course-only reading plane for one line of dialogue — deliberately NOT
 * src/ad12/VoicePlane.tsx, whose `Speaker` type is a closed Playground-only union ('GUIDE' |
 * 'PONTA' | 'ROBOT'). The course's cast (ポン太, ハテナ, and whichever family member/teacher speaks
 * in a given exercise) is open-ended content, not a fixed set of three roles, and WO-C1's own
 * instruction is to reuse AD-12 primitives (this uses `Plane`, `ad12-reading-text`, `Ruby`) while
 * writing new small pieces for what doesn't fit — never to widen a Playground-only type to fit.
 */
import { Plane } from '../ad12/Plane';
import { Ruby } from '../engine/ruby';

export interface DialoguePlaneProps {
  speaker: string;
  text: string;
  className?: string;
}

export function DialoguePlane({ speaker, text, className }: DialoguePlaneProps) {
  return (
    <Plane className={className}>
      <p className="ad12-ui-text course-dialogue__speaker">{speaker}</p>
      <p className="ad12-reading-text"><Ruby text={text} /></p>
    </Plane>
  );
}
