/**
 * CI GATE 2 — no free-text input anywhere in the child flow.
 * Scans src/ excluding the LP and any parent-only screens. Spec v0.5 §7.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');
const EXCLUDE = ['src/lp', 'src/parent'];
const PATTERNS: [RegExp, string][] = [
  [/<textarea/i, '<textarea>'],
  [/contenteditable/i, 'contenteditable'],
  [/<input(?![^>]*type\s*=\s*["'](?:radio|checkbox|range|hidden)["'])/i, 'free-text <input>'],
];

const files: string[] = [];
(function walk(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(ROOT);

let bad = 0;
for (const f of files) {
  const rel = f.replace(process.cwd() + '/', '');
  if (EXCLUDE.some((e) => rel.startsWith(e))) continue;
  if (!/\.(tsx?|html)$/.test(f)) continue;
  const src = readFileSync(f, 'utf8');
  for (const [re, label] of PATTERNS) {
    if (re.test(src)) { console.error(`FAIL gate:no-free-text — ${rel} contains ${label}`); bad++; }
  }
}
if (bad) process.exit(1);
console.log('gate:no-free-text: OK');
