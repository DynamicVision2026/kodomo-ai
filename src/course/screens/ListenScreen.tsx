/** WO-C1 §3 screen 3 — Listen. Renders the lesson's transcript in order, grouped into its own
 *  named `part` sections when present (c01.lesson.json's own DEVIATION field — see
 *  content/types.ts). Marking listen done is a single explicit action at the end, never inferred
 *  from scroll position (no audio-position tracking exists yet — `listen.audio` is stored but not
 *  wired to a real player in this v1; WO-C1 acceptance's own "works with storage blocked" and
 *  F8's "every audio line is shown as text" both already hold since the transcript is the primary
 *  reading surface here, same principle VoicePlane's own doc comment states). */
import { DialoguePlane } from '../DialoguePlane';
import { courseUi } from '../content/courseManifest';
import type { CourseLesson } from '../content/types';

export interface ListenScreenProps {
  lesson: CourseLesson;
  onDone: () => void;
  onBack: () => void;
}

export function ListenScreen({ lesson, onDone, onBack }: ListenScreenProps) {
  const sections: { part: string | null; lines: typeof lesson.listen.transcript }[] = [];
  for (const line of lesson.listen.transcript) {
    const last = sections[sections.length - 1];
    if (last && last.part === (line.part ?? null)) {
      last.lines.push(line);
    } else {
      sections.push({ part: line.part ?? null, lines: [line] });
    }
  }

  return (
    <main className="ad12 course-screen course-listen">
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__back" onClick={onBack}>{courseUi.back}</button>
      <h1 className="ad12-reading-text">{lesson.title}</h1>
      {sections.map((section, i) => (
        <section key={i} className="course-listen__section">
          {section.part && <p className="ad12-ui-text course-listen__section-title">{section.part}</p>}
          {section.lines.map((line, j) => (
            <DialoguePlane key={j} speaker={line.speaker} text={line.text} className="course-listen__line" />
          ))}
        </section>
      ))}
      <button type="button" className="ad12-ink-button ad12-tappable course-screen__primary" onClick={onDone}>
        {courseUi.listenDoneLabel}
      </button>
    </main>
  );
}
