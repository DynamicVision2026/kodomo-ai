/**
 * WO-C2 §3.3 (rewrites WO-C1 §3 screen 5) — Make（つくる）. One `CourseMakeBlock` at a time
 * (c01.lesson.json's own DEVIATION: `make` is an array, one block per tool taught — see
 * content/types.ts). The 「おうちの人も いっしょ？」 switch changes what support is offered while
 * the child composes their own question aloud: ON walks a parent through `parentPrompts` one at a
 * time; OFF gives the child their own escalating hint (`hint.h1`, then `hint.h2Highlight`
 * highlighted inside whichever dialogue line contains it) — never the model question itself.
 * `parentPeek` only unlocks after this block's own tried action fires, matching
 * 「いってみた！」 — see that fields own doc comment.
 */
import { useState } from 'react';
import { Plane } from '../../ad12/Plane';
import { Icon } from '../Icon';
import { DialoguePlane } from '../DialoguePlane';
import { VoiceCue } from '../VoiceCue';
import { Ruby } from '../../engine/ruby';
import { courseUi } from '../content/courseManifest';
import { makeDialogueAudioPath, SHARED_AUDIO } from '../audioPaths';
import type { CourseMakeBlock } from '../content/types';

export interface MakeScreenProps {
  lessonId: string;
  blocks: CourseMakeBlock[];
  blockIndex: number;
  onMakeDone: () => void;
  onNextBlock: () => void;
  onBack: () => void;
}

/** Same "highlight the exact substring" helper ExerciseScreen uses for hint.h2Highlight. */
function highlightSubstring(text: string, needle: string) {
  const at = needle ? text.indexOf(needle) : -1;
  if (at === -1) return <Ruby text={text} />;
  const before = text.slice(0, at);
  const after = text.slice(at + needle.length);
  return (
    <>
      {before && <Ruby text={before} />}
      <mark className="course-make__dialogue-highlight"><Ruby text={needle} /></mark>
      {after && <Ruby text={after} />}
    </>
  );
}

export function MakeScreen({ lessonId, blocks, blockIndex, onMakeDone, onNextBlock, onBack }: MakeScreenProps) {
  const [tried, setTried] = useState(false);
  const [parentMode, setParentMode] = useState(false);
  const [parentPromptIndex, setParentPromptIndex] = useState(0);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [peekRevealed, setPeekRevealed] = useState(false);
  const block = blocks[blockIndex];
  if (!block) return null;

  const highlightLineIndex = hintLevel === 2 && block.hint
    ? block.dialogue.findIndex((line) => line.text.includes(block.hint!.h2Highlight))
    : -1;

  function handleTried() {
    setTried(true);
    onMakeDone();
  }

  return (
    <main className="ad12 course-screen course-make">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <p className="ad12-ui-text">{courseUi.lessonStepMake} {blockIndex + 1}/{blocks.length}</p>
      <Icon tool={block.methodCard} size={40} />

      {block.dialogue.map((line, i) => (
        <div key={i}>
          {i === highlightLineIndex ? (
            <Plane>
              <p className="ad12-ui-text course-dialogue__speaker">{line.speaker}</p>
              <p className="ad12-reading-text">{highlightSubstring(line.text, block.hint!.h2Highlight)}</p>
            </Plane>
          ) : (
            <DialoguePlane speaker={line.speaker} text={line.text} />
          )}
          <VoiceCue src={makeDialogueAudioPath(lessonId, block.tool, i)} />
        </div>
      ))}

      <Plane className="course-make__starters">
        <p className="ad12-ui-text course-make__starters-title">{courseUi.makeStartersTitle}</p>
        <ul className="course-make__starter-list">
          {block.starterCards.map((card, i) => <li key={i} className="ad12-reading-text course-make__starter">{card}</li>)}
        </ul>
      </Plane>

      <label className="course-make__parent-toggle ad12-ui-text">
        <input
          type="checkbox"
          checked={parentMode}
          onChange={(e) => { setParentMode(e.target.checked); setParentPromptIndex(0); }}
        />
        {courseUi.makeParentToggleLabel}
      </label>

      {parentMode ? (
        <Plane className="course-make__parent">
          <p className="ad12-ui-text">{courseUi.parentNoteLabel} {parentPromptIndex + 1} / {block.parentPrompts.length}</p>
          <p className="ad12-ui-text">{block.parentPrompts[parentPromptIndex]?.text}</p>
          {parentPromptIndex + 1 < block.parentPrompts.length && (
            <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setParentPromptIndex((i) => i + 1)}>
              {courseUi.makeNextHintLabel}
            </button>
          )}
        </Plane>
      ) : (
        block.hint && (
          <>
            <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setHintLevel((l) => (l < 2 ? ((l + 1) as 0 | 1 | 2) : l))}>
              {courseUi.exerciseHintLabel}
            </button>
            {hintLevel >= 1 && (
              <Plane className="course-make__hint">
                <p className="ad12-ui-text">{block.hint.h1}</p>
              </Plane>
            )}
          </>
        )
      )}

      <p className="ad12-ui-text course-make__say-prompt">{courseUi.makeSayItPrompt}</p>
      <VoiceCue src={SHARED_AUDIO.makeSayItPrompt} />

      {!tried ? (
        <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={handleTried}>
          {courseUi.makeTriedLabel}
        </button>
      ) : (
        <>
          <Plane className="course-make__self-check-wrap">
            <p className="ad12-ui-text course-make__self-check-title">{courseUi.makeSelfCheckTitle}</p>
            <ul className="course-make__self-check">
              {block.selfCheck.map((c, i) => <li key={i} className="ad12-ui-text">☐ {c}</li>)}
            </ul>
          </Plane>

          {block.parentPeek.length > 0 && (
            <>
              <button type="button" className="ad12-ink-button ad12-tappable" onClick={() => setPeekRevealed((v) => !v)}>
                {courseUi.makePeekRevealLabel}
              </button>
              {peekRevealed && (
                <Plane className="course-make__peek-wrap">
                  <p className="ad12-ui-text course-make__peek-title">{courseUi.makePeekTitle}</p>
                  <ul className="course-make__peek">
                    {block.parentPeek.map((p, i) => <li key={i} className="ad12-ui-text">{p}</li>)}
                  </ul>
                  {block.peekNote && <p className="ad12-ui-text course-make__peek-note">{block.peekNote}</p>}
                </Plane>
              )}
            </>
          )}

          <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onNextBlock}>
            {blockIndex + 1 >= blocks.length ? courseUi.backToLessonLabel : courseUi.makeNextLabel}
          </button>
        </>
      )}

      {block.parentNote && (
        <p className="ad12-ui-text course-make__parent-note">{courseUi.parentNoteLabel}：{block.parentNote}</p>
      )}
    </main>
  );
}
