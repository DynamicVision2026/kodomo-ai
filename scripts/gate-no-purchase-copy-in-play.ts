/**
 * CI GATE — AD-15 rule #5 (hotfix, post-production-incident): "child-facing /play never displays
 * purchase/sales copy." A real incident showed a first-time visitor a literal "please purchase"
 * sentence on a child-facing screen (src/shell/MissionShell.tsx's own locked screen, reached from
 * `ui.lockedMessage`) — this gate makes that class of regression fail CI instead of reaching
 * production a second time.
 *
 * Scans every `src/modules/*\/module.json`'s own `ui` block — the one place ALL of a module's
 * child- and parent-facing chrome copy lives (mission `topics/*.json` content bodies are
 * deliberately NOT scanned: several are genuine money-vocabulary lessons, e.g. bank-100yen/
 * bank-nedan, where 円 is the actual lesson content, not sales copy).
 *
 * `PARENT_ONLY_KEYS` is a narrow, explicit allowlist — the two `ui.*` keys that legitimately
 * mention a prior purchase (multi-device recovery copy, "already bought it elsewhere? here's
 * where to re-register") and are rendered ONLY inside the parent-handoff screen
 * (`screen.kind === 'parent'`), never on any path a child alone can reach. Adding a key here is a
 * deliberate exception, not a default — every other `ui.*` string is treated as potentially
 * child-facing and must stay clear of purchase/price wording.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MODULES_ROOT = resolve(process.cwd(), 'src/modules');

const PARENT_ONLY_KEYS = new Set(['parentUnlockPrompt', 'parentUnlockLinkLabel']);

const FORBIDDEN: [RegExp, string][] = [
  [/購入/, '購入 (purchase)'],
  [/課金/, '課金 (billing/charge)'],
  [/価格/, '価格 (price)'],
  [/[¥$]\s*\d/, 'a currency amount (¥/$)'],
  [/\d+\s*円/, 'a yen amount'],
];

let bad = 0;
for (const moduleDir of readdirSync(MODULES_ROOT)) {
  const moduleJsonPath = join(MODULES_ROOT, moduleDir, 'module.json');
  let raw: string;
  try {
    raw = readFileSync(moduleJsonPath, 'utf8');
  } catch {
    continue; // not every entry under src/modules is a module directory with its own module.json
  }
  const parsed = JSON.parse(raw) as { ui?: Record<string, unknown> };
  const ui = parsed.ui ?? {};
  for (const [key, value] of Object.entries(ui)) {
    if (PARENT_ONLY_KEYS.has(key)) continue;
    if (typeof value !== 'string') continue;
    for (const [re, label] of FORBIDDEN) {
      if (re.test(value)) {
        console.error(`FAIL gate:no-purchase-copy-in-play — src/modules/${moduleDir}/module.json ui.${key} contains ${label}: "${value}"`);
        bad++;
      }
    }
  }
}
if (bad) process.exit(1);
console.log('gate:no-purchase-copy-in-play: OK');
