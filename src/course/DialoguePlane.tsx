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
  /** Course redesign (Founder, 1 Oct 2026): real character art next to the speaker label — only
   *  ever passed where `speaker` genuinely names that character (e.g. the practice/audit feedback
   *  panels, whose `speaker` is literally courseUi's own「ハテナ」) so the art never contradicts
   *  the text next to it. Omitted (as before) for every dialogue line whose speaker is some other
   *  open-ended cast member (a parent, a teacher, ...). Decorative only (`speaker` itself already
   *  carries the name for assistive tech) — `alt=""`, `aria-hidden`, no separate alt text needed. */
  iconUrl?: string;
}

export function DialoguePlane({ speaker, text, className, iconUrl }: DialoguePlaneProps) {
  return (
    <Plane className={className}>
      <p className="ad12-ui-text course-dialogue__speaker">
        {iconUrl && <img src={iconUrl} alt="" className="course-dialogue__speaker-icon" aria-hidden="true" />}
        {speaker}
      </p>
      <p className="ad12-reading-text"><Ruby text={text} /></p>
    </Plane>
  );
}
