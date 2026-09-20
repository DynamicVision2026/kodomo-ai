import type { PrintSheetFile } from './schema';
import './print-sheet.css';

export interface PrintSheetProps {
  sheet: PrintSheetFile;
  /** Parent-facing copy only — module.json's `ui` catalog reserves child-facing strings, but
   *  this one fixed line (shown only for a `pending` sheet) is itself parent/production-facing,
   *  never rendered under /play, so it is passed in by the caller rather than hard-coded here,
   *  keeping this component copy-free like PrintDeck.tsx. */
  pendingLabel: string;
}

/**
 * WO-19 Phase 4: the shared render path for every text/section-based printable kit item (Rules,
 * Parent Handbook, Adult Memo, the real-AI session guide, the first-question/envelope sheet, and
 * the certificate). One A4 page per `PrintSheetFile`; `intendedCount` renders that many repeated
 * pages (e.g. 5 Rules pages, 3 Adult Memos) from the same content once it exists — today, before
 * real content is authored, every page instead shows one clearly-marked "content pending"
 * placeholder, never fabricated copy.
 */
export function PrintSheet({ sheet, pendingLabel }: PrintSheetProps) {
  const copies = Math.max(1, sheet.intendedCount ?? 1);

  return (
    <div className="print-sheet">
      {Array.from({ length: copies }, (_, i) => (
        <div key={i} className="print-sheet__page">
          <p className="print-sheet__title">{sheet.title}</p>
          {sheet.status === 'pending' ? (
            <p className="print-sheet__pending">{pendingLabel}</p>
          ) : (
            sheet.sections.map((section, si) => (
              <div key={si} className="print-sheet__section">
                {section.heading && <p className="print-sheet__heading">{section.heading}</p>}
                {section.body.map((line, li) => <p key={li} className="print-sheet__body">{line}</p>)}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
