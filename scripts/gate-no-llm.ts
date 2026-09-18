/**
 * CI GATE 1 — no LLM or API hosts in the shipped bundle. Runs on dist/ AFTER build.
 * Spec v0.5 §7. This is the guardrail the whole product promise rests on.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const FORBIDDEN = [
  'api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com',
  'api.cohere', 'api.mistral', 'openrouter.ai', 'huggingface.co/api',
  'claude.ai/api', 'chatgpt.com/backend',
];

if (!existsSync(DIST)) { console.error('gate:no-llm — dist/ not found. Run the build first.'); process.exit(1); }

const files: string[] = [];
(function walk(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(DIST);

let bad = 0;
for (const f of files) {
  if (!/\.(js|mjs|css|html|json)$/.test(f)) continue;
  const src = readFileSync(f, 'utf8');
  for (const host of FORBIDDEN) {
    if (src.includes(host)) { console.error(`FAIL gate:no-llm — ${f} references ${host}`); bad++; }
  }
}
if (bad) process.exit(1);
console.log(`gate:no-llm: OK (${files.length} files scanned)`);
