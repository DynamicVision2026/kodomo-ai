/** WO-C1 §3 screen 7 — Family inquiry. `whoKnows`/`aiExample`/`applyTool`/`notes` are read-only
 *  content; the one interactive element is the ★ button (WO-C1 §4: "separate and never needed
 *  for 100%... can be set only after the make step" — the caller (CourseApp) is what enforces
 *  that gate, this screen just renders whatever `starsEnabled` it's handed). */
import { Plane } from '../../ad12/Plane';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';
import type { CourseFamily } from '../content/types';

export interface FamilyScreenProps {
  family: CourseFamily;
  stars: number;
  starsEnabled: boolean;
  onStar: () => void;
  onBack: () => void;
}

export function FamilyScreen({ family, stars, starsEnabled, onStar, onBack }: FamilyScreenProps) {
  return (
    <main className="ad12 course-screen course-family">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <Plane>
        <p className="ad12-ui-text course-family__label">{courseUi.familyWhoKnowsLabel}</p>
        <p className="ad12-reading-text"><Ruby text={family.whoKnows} /></p>
      </Plane>
      {family.aiExample && (
        <Plane>
          <p className="ad12-ui-text course-family__label">{courseUi.familyAiExampleLabel}</p>
          <p className="ad12-reading-text"><Ruby text={family.aiExample} /></p>
        </Plane>
      )}
      <Plane>
        <p className="ad12-ui-text course-family__label">{courseUi.familyApplyToolLabel}</p>
        <p className="ad12-reading-text"><Ruby text={family.applyTool} /></p>
      </Plane>
      {family.notes.length > 0 && (
        <Plane className="course-family__notes">
          <ul>
            {family.notes.map((note, i) => <li key={i} className="ad12-ui-text">{note}</li>)}
          </ul>
        </Plane>
      )}
      <button
        type="button"
        className="ad12-ink-button ad12-tappable course-screen__primary"
        onClick={onStar}
        disabled={!starsEnabled}
      >
        {courseUi.familyStarLabel} {stars > 0 ? `（${stars}）` : ''}
      </button>
    </main>
  );
}
