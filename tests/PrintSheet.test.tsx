import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PrintSheet } from '../src/print/sheet/PrintSheet';
import { validatePrintSheet, type PrintSheetFile } from '../src/print/sheet/schema';

afterEach(() => cleanup());

const PENDING_LABEL = 'ないよう じゅんびちゅう';

describe('validatePrintSheet', () => {
  it('accepts a well-formed pending sheet with no sections', () => {
    const file: PrintSheetFile = { kitItem: 'x', status: 'pending', title: 'T', sections: [] };
    expect(validatePrintSheet(file)).toEqual([]);
  });

  it('accepts a well-formed ready sheet with real sections', () => {
    const file: PrintSheetFile = {
      kitItem: 'x', status: 'ready', title: 'T', sections: [{ heading: 'H', body: ['line'] }],
    };
    expect(validatePrintSheet(file)).toEqual([]);
  });

  it('rejects a sheet claiming ready with no content — the exact dishonesty WO-19 warns against', () => {
    const file: PrintSheetFile = { kitItem: 'x', status: 'ready', title: 'T', sections: [] };
    const issues = validatePrintSheet(file);
    expect(issues).toContainEqual({ rule: 'ready-without-content', message: expect.any(String) });
  });

  it('rejects a sheet marked pending that already carries content (should be "ready" instead)', () => {
    const file: PrintSheetFile = {
      kitItem: 'x', status: 'pending', title: 'T', sections: [{ body: ['line'] }],
    };
    const issues = validatePrintSheet(file);
    expect(issues).toContainEqual({ rule: 'pending-with-content', message: expect.any(String) });
  });

  it('rejects a missing title or kitItem', () => {
    expect(validatePrintSheet({ kitItem: '', status: 'pending', title: 'T', sections: [] }))
      .toContainEqual({ rule: 'schema', message: expect.stringContaining('kitItem') });
    expect(validatePrintSheet({ kitItem: 'x', status: 'pending', title: '', sections: [] }))
      .toContainEqual({ rule: 'schema', message: expect.stringContaining('title') });
  });
});

describe('PrintSheet — pending state (every current kit item)', () => {
  it('shows the title and a clearly-marked pending placeholder, never fabricated body text', () => {
    const sheet: PrintSheetFile = { kitItem: 'parent-handbook', status: 'pending', title: '保護者ハンドブック', sections: [] };
    const { container } = render(<PrintSheet sheet={sheet} pendingLabel={PENDING_LABEL} />);
    expect(container.textContent).toContain('保護者ハンドブック');
    expect(container.textContent).toContain(PENDING_LABEL);
    expect(container.querySelectorAll('.print-sheet__section')).toHaveLength(0);
  });

  it('renders `intendedCount` repeated pages, every one showing the same pending placeholder', () => {
    const sheet: PrintSheetFile = { kitItem: 'adult-memo', status: 'pending', title: 'おとな版1分メモ', sections: [], intendedCount: 3 };
    const { container } = render(<PrintSheet sheet={sheet} pendingLabel={PENDING_LABEL} />);
    expect(container.querySelectorAll('.print-sheet__page')).toHaveLength(3);
  });
});

describe('PrintSheet — ready state (proving the render path works, via clearly-synthetic demo content, not real product copy)', () => {
  it('renders every section heading and body line once real content exists', () => {
    const sheet: PrintSheetFile = {
      kitItem: 'demo', status: 'ready', title: 'DEMO TITLE — not real kit content',
      sections: [
        { heading: 'Section A', body: ['line one', 'line two'] },
        { heading: 'Section B', body: ['line three'] },
      ],
    };
    const { container } = render(<PrintSheet sheet={sheet} pendingLabel={PENDING_LABEL} />);
    expect(container.textContent).toContain('Section A');
    expect(container.textContent).toContain('line one');
    expect(container.textContent).toContain('Section B');
    expect(container.textContent).toContain('line three');
    expect(container.textContent).not.toContain(PENDING_LABEL);
  });
});
