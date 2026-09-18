/**
 * CI GATE 3 — child-facing Japanese strings live only in module JSON, never in components.
 * Spec v0.5 §7. Keeps every stage's wording inside the lint's reach.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');
const EXCLUDE = ['src/lp', 'src/parent', 'src/modules', 'src/legal'];
const JA = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

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
  if (!/\.tsx?$/.test(f)) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, n) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    const strings = code.match(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
    for (const s of strings) {
      if (JA.test(s)) { console.error(`FAIL gate:no-hardcoded-copy — ${rel}:${n + 1} ${s.trim()}`); bad++; }
    }
  });
}
if (bad) process.exit(1);
console.log('gate:no-hardcoded-copy: OK');
