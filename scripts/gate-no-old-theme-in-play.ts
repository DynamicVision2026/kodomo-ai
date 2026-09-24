/**
 * CI GATE — post-launch-check work order §A5: "everything under /play uses AD-12 tokens only."
 * A real iPhone walkthrough found several /play screens (だれが ほる？, おうちの人もいっしょ？, the
 * listening screen's own outer frame) still on the pre-AD-12 cream/gold theme
 * (src/styles/tokens.css's --surface/#f7f3ec, --root/#c8922e, --soil-*), traced to a handful of
 * CSS files that had never been migrated when the rest of the app cut over to src/ad12/tokens.css.
 * This gate fails the build if any of those old custom-property references or their literal
 * hex fallbacks reappear in a /play-reachable stylesheet, so that regression can't ship silently
 * a second time.
 *
 * Forbidden custom properties (src/styles/tokens.css's own pre-AD-12 set): --surface, --root,
 * --soil-1..4, --parent-surface, --parent-ink, --ink, --ink-soft.
 * Forbidden literal hex values removed by this same work order: #f7f3ec (old cream surface),
 * #c8922e (old gold "root reached" accent), #e8dcc8/#c9b08a/#a6845c/#7a5c3a (the old soil-1..4
 * scale), #fffaf0/#fbe4b8 (the mascot's old cream/tan body gradient), #fdeee0 (the mascot's old
 * "challenge" fill), #efe6d8 (question-chip's old cream "blocked" fill).
 *
 * --ad12-ponta (#d9b98c, tan) is deliberately NOT forbidden — AD-12 reserves tan for ポン太 only,
 * and this gate only targets the OLD token system, never the new one.
 *
 * Scanned directories: every real product screen and template reachable from /play
 * (src/shell, src/stage, src/templates, src/ui) plus src/ad12 itself, so a future regression in
 * the AD-12 component library would also be caught. Deliberately excludes src/lp, src/parent,
 * src/admin, src/print, src/legal, src/ad12/gallery — none of those are /play.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCAN_ROOTS = ['src/shell', 'src/stage', 'src/templates', 'src/ui', 'src/ad12'].map((p) =>
  resolve(process.cwd(), p),
);
const EXCLUDE_DIR_NAMES = new Set(['gallery']);

const FORBIDDEN_VARS: [RegExp, string][] = [
  [/var\(--surface[,)]/, '--surface (old cream page background)'],
  [/var\(--root[,)]/, '--root (old gold accent)'],
  [/var\(--soil-[1-4][,)]/, '--soil-1..4 (old soil scale)'],
  [/var\(--parent-surface[,)]/, '--parent-surface (old parent background)'],
  [/var\(--parent-ink[,)]/, '--parent-ink (old parent ink)'],
  [/var\(--ink-soft[,)]/, '--ink-soft (old soft ink)'],
  [/var\(--ink[,)]/, '--ink (old ink — use --ad12-ink)'],
];

const FORBIDDEN_HEX: [RegExp, string][] = [
  [/#f7f3ec/i, '#f7f3ec (old cream surface)'],
  [/#c8922e/i, '#c8922e (old gold accent)'],
  [/#e8dcc8/i, '#e8dcc8 (old soil-1)'],
  [/#c9b08a/i, '#c9b08a (old soil-2)'],
  [/#a6845c/i, '#a6845c (old soil-3)'],
  [/#7a5c3a/i, '#7a5c3a (old soil-4)'],
  [/#fffaf0/i, '#fffaf0 (old mascot gradient, cream)'],
  [/#fbe4b8/i, '#fbe4b8 (old mascot gradient, tan)'],
  [/#fdeee0/i, '#fdeee0 (old mascot "challenge" fill)'],
  [/#efe6d8/i, '#efe6d8 (old question-chip "blocked" fill)'],
];

function collectCssFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectCssFiles(full));
    } else if (entry.endsWith('.css')) {
      files.push(full);
    }
  }
  return files;
}

let bad = 0;
for (const root of SCAN_ROOTS) {
  for (const file of collectCssFiles(root)) {
    const raw = readFileSync(file, 'utf8');
    const relPath = file.slice(resolve(process.cwd()).length + 1);
    for (const [re, label] of [...FORBIDDEN_VARS, ...FORBIDDEN_HEX]) {
      if (re.test(raw)) {
        console.error(`FAIL gate:no-old-theme-in-play — ${relPath} still uses ${label}`);
        bad++;
      }
    }
  }
}
if (bad) process.exit(1);
console.log('gate:no-old-theme-in-play: OK');
