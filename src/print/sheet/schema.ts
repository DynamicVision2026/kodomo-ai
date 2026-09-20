/**
 * WO-19 Phase 4: the shared data shape for every text/section-based printable kit item — Rules
 * A4×5, Parent Handbook, Adult Memo, the real-AI family session guide, and the first-question/
 * envelope sheet (spec v0.5 §4.4's kit list). The certificate reuses this same shape with a
 * lighter decorative render (see PrintSheet.tsx).
 *
 * `status` is the honest completion signal WO-19 requires: 'pending' means the schema/template
 * exists but real, human-reviewed content does not yet — PrintSheet renders a clearly-marked
 * placeholder for it, never fabricated copy. Do not set 'ready' without real sections AND (per
 * every other content-approval precedent in this repository) the appropriate human review for
 * that content having actually happened.
 */

export interface PrintSheetSection {
  heading?: string;
  /** One paragraph/line per array entry — kept as an array (not one long string) so a template
   *  can lay out spacing/line-breaks deterministically, same reasoning as DigLayer's own
   *  structured fields over a single blob of prose. */
  body: string[];
}

export type PrintSheetStatus = 'pending' | 'ready';

export interface PrintSheetFile {
  /** Which spec v0.5 §4.4 kit item this is — for reporting/manifest purposes only, never
   *  rendered as child-facing copy. */
  kitItem: string;
  status: PrintSheetStatus;
  title: string;
  sections: PrintSheetSection[];
  /** How many independent copies of this sheet the kit ultimately needs (e.g. Rules = 5 pages,
   *  Adult Memo = 3 memos) — a count, never itself content. Defaults to 1. */
  intendedCount?: number;
}

export interface SheetValidationIssue { rule: string; message: string }

/**
 * Structural validation only (shape, not child-facing register — Rules/Handbook/Memo/Guide/
 * Envelope sheet are PARENT-facing, not child-facing, so pipeline/lib/lintText's Stage-2 rules
 * do not apply to them; a future ticket authoring real content can add a parent-register lint
 * pass separately if the Founder wants one). Catches exactly the dishonesty WO-19 warns against:
 * a file claiming `status: 'ready'` with no actual content.
 */
export function validatePrintSheet(file: PrintSheetFile): SheetValidationIssue[] {
  const issues: SheetValidationIssue[] = [];
  if (!file.kitItem) issues.push({ rule: 'schema', message: 'missing kitItem' });
  if (!file.title) issues.push({ rule: 'schema', message: 'missing title' });
  if (file.status !== 'pending' && file.status !== 'ready') {
    issues.push({ rule: 'schema', message: `status must be "pending" or "ready", got ${JSON.stringify(file.status)}` });
  }
  if (file.status === 'ready' && file.sections.length === 0) {
    issues.push({ rule: 'ready-without-content', message: 'status is "ready" but sections is empty — cannot claim ready with no content' });
  }
  if (file.status === 'pending' && file.sections.length > 0) {
    issues.push({ rule: 'pending-with-content', message: 'status is "pending" but sections already has content — either the content is real (mark ready) or it should not be here yet' });
  }
  return issues;
}
