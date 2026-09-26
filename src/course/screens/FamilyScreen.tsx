/**
 * WO-C2 §3.6 (rewrites WO-C1 §3 screen 7) — Family inquiry（かぞくで しらべる）. The child first
 * picks one of `family.choices` under `intro`/`familyChoicesLabel` — shown on screen only, never
 * saved to progress (WO-C2 §3.6: "shown on screen only, not saved") — then the rest of the
 * existing WO-C1 guidance (whoKnows/aiExample/applyTool/notes) renders as before. The ★ button
 * (`family.star`'s own label, WO-C1 §4: "separate and never needed for 100%") is unchanged.
 */
import { useState } from 'react';
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
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  return (
    <main className="ad12 course-screen course-family">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>

      {family.intro && (
        <Plane>
          <p className="ad12-reading-text"><Ruby text={family.intro} /></p>
        </Plane>
      )}

      {family.choices && family.choices.length > 0 && (
        <Plane className="course-family__choices">
          <p className="ad12-ui-text course-family__label">{courseUi.familyChoicesLabel}</p>
          <div className="course-family__choice-list">
            {family.choices.map((choice, i) => (
              <button
                key={i}
                type="button"
                className={`ad12-ink-button ad12-tappable course-family__choice ${chosenIndex === i ? 'course-family__choice--picked' : ''}`}
                onClick={() => setChosenIndex(i)}
              >
                <Ruby text={choice} />
              </button>
            ))}
          </div>
        </Plane>
      )}

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
      {family.parentNote && (
        <p className="ad12-ui-text course-family__parent-note">{courseUi.parentNoteLabel}：{family.parentNote}</p>
      )}
      <button
        type="button"
        className="ad12-ink-button ad12-tappable course-screen__primary"
        onClick={onStar}
        disabled={!starsEnabled}
      >
        {family.star ?? courseUi.familyStarLabel} {stars > 0 ? `（${stars}）` : ''}
      </button>
    </main>
  );
}
