/**
 * CI GATE 4 — no mission ships on unapproved claims or without a native-review stamp.
 * This is the fact gate from spec v0.5 §6, made mechanical.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const MODULES = resolve(process.cwd(), 'src/modules');
const STRICT = process.env.RELEASE === '1'; // review stamp required only for release builds

const files: string[] = [];
(function walk(d: string) {
  if (!existsSync(d)) return;
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.json') && !p.endsWith('module.json') && !/deck\.s\d+\.json$/.test(p)) files.push(p);
  }
})(MODULES);

let bad = 0;
for (const f of files) {
  const rel = f.replace(process.cwd() + '/', '');
  const m = JSON.parse(readFileSync(f, 'utf8'));
  const factsPath = join(f, '..', 'facts.yaml');
  if (!existsSync(factsPath)) { console.error(`FAIL gate:claims — ${rel} has no facts.yaml beside it`); bad++; continue; }

  const facts = parse(readFileSync(factsPath, 'utf8')) as { claims?: { id: string; status: string }[] };
  const unapproved = (facts.claims ?? []).filter((c) => c.status !== 'approved').map((c) => c.id);
  if (unapproved.length) { console.error(`FAIL gate:claims — ${rel} uses facts.yaml with unapproved claims: ${unapproved.join(', ')}`); bad++; }

  if (STRICT && !m.review?.by) { console.error(`FAIL gate:claims — ${rel} has no native-speaker review stamp (RELEASE=1)`); bad++; }
}
if (bad) process.exit(1);
console.log(`gate:claims: OK (${files.length} mission file(s)${STRICT ? ', release mode' : ''})`);
