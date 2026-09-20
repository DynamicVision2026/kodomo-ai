/**
 * WO-19 Phase 4: the shared data shape for every text/section-based printable kit item — Rules
 * A4×5, Parent Handbook, Adult Memo, the real-AI family session guide, and the first-question/
 * envelope sheet (spec v0.5 §4.4's kit list). The certificate reuses this same shape with a
 * lighter decorative render (see PrintSheet.tsx).
 *
 * `status` is the honest completion signal WO-19 requires, now a 3-state progression matching
 * the same content-then-review pattern every Mission already uses (contentClass "release" +
 * Gate 1 + Gate 2, `src/engine/types.ts`):
 *  - 'pending': the schema/template exists but real content does not yet — PrintSheet renders a
 *    clearly-marked placeholder, never fabricated copy.
 *  - 'candidate' (WO-21 Phase 3): real, drafted content exists and renders for real, but no human
 *    (Founder or otherwise) has reviewed/approved it as final yet — the print-kit equivalent of a
 *    Mission with `contentClass: "release"` and no `review`/Gate 1 stamp.
 *  - 'ready': real sections AND the appropriate human review for that content having actually
 *    happened. Never set this without that review genuinely having occurred.
 */

export interface PrintSheetSection {
  heading?: string;
  /** One paragraph/line per array entry — kept as an array (not one long string) so a template
   *  can lay out spacing/line-breaks deterministically, same reasoning as DigLayer's own
   *  structured fields over a single blob of prose. */
  body: string[];
}

export type PrintSheetStatus = 'pending' | 'candidate' | 'ready';

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
  if (file.status !== 'pending' && file.status !== 'candidate' && file.status !== 'ready') {
    issues.push({ rule: 'schema', message: `status must be "pending", "candidate" or "ready", got ${JSON.stringify(file.status)}` });
  }
  if ((file.status === 'ready' || file.status === 'candidate') && file.sections.length === 0) {
    issues.push({ rule: 'ready-without-content', message: `status is ${JSON.stringify(file.status)} but sections is empty — cannot claim content exists with none` });
  }
  if (file.status === 'pending' && file.sections.length > 0) {
    issues.push({ rule: 'pending-with-content', message: 'status is "pending" but sections already has content — either the content is real (mark candidate or ready) or it should not be here yet' });
  }
  return issues;
}
