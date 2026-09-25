/**
 * WO-C1 §3 screen 5 — Make. One `CourseMakeBlock` at a time (c01.lesson.json's own DEVIATION:
 * `make` is an array, one block per tool taught — see content/types.ts). `parentPeek` only
 * unlocks after this block's own tried action, per that field's own doc comment.
 */
import { useState } from 'react';
import { Plane } from '../../ad12/Plane';
import { DialoguePlane } from '../DialoguePlane';
import { courseUi } from '../content/courseManifest';
import type { CourseMakeBlock } from '../content/types';

export interface MakeScreenProps {
  blocks: CourseMakeBlock[];
  blockIndex: number;
  onMakeDone: () => void;
  onNextBlock: () => void;
  onBack: () => void;
}

export function MakeScreen({ blocks, blockIndex, onMakeDone, onNextBlock, onBack }: MakeScreenProps) {
  const [tried, setTried] = useState(false);
  const [showParentSection, setShowParentSection] = useState(false);
  const block = blocks[blockIndex];
  if (!block) return null;

  function handleTried() {
    setTried(true);
    onMakeDone();
  }

  return (
    <main className="ad12 course-screen course-make">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <p className="ad12-ui-text">{courseUi.lessonStepMake} {blockIndex + 1}/{blocks.length}</p>
      {block.dialogue.map((line, i) => (
        <DialoguePlane key={i} speaker={line.speaker} text={line.text} />
      ))}

      <Plane className="course-make__starters">
        <p className="ad12-ui-text course-make__starters-title">{courseUi.makeStartersTitle}</p>
        <ul className="course-make__starter-list">
          {block.starterCards.map((card, i) => <li key={i} className="ad12-reading-text course-make__starter">{card}</li>)}
        </ul>
      </Plane>

      <button
        type="button"
        className="ad12-ink-button ad12-tappable"
        onClick={() => setShowParentSection((v) => !v)}
      >
        {courseUi.makeParentToggleLabel}
      </button>
      {showParentSection && (
        <Plane className="course-make__parent">
          <ul className="course-make__parent-list">
            {block.parentPrompts.map((p, i) => <li key={i} className="ad12-ui-text">{p.text}</li>)}
          </ul>
          <p className="ad12-ui-text course-make__self-check-title">{courseUi.makeSelfCheckTitle}</p>
          <ul className="course-make__self-check">
            {block.selfCheck.map((c, i) => <li key={i} className="ad12-ui-text">☐ {c}</li>)}
          </ul>
          {tried && block.parentPeek.length > 0 && (
            <>
              <p className="ad12-ui-text course-make__peek-title">{courseUi.makePeekTitle}</p>
              <ul className="course-make__peek">
                {block.parentPeek.map((p, i) => <li key={i} className="ad12-ui-text">{p}</li>)}
              </ul>
            </>
          )}
        </Plane>
      )}

      {!tried ? (
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={handleTried}>
          {courseUi.makeTriedLabel}
        </button>
      ) : (
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onNextBlock}>
          {blockIndex + 1 >= blocks.length ? courseUi.backToLessonLabel : courseUi.makeNextLabel}
        </button>
      )}
    </main>
  );
}
