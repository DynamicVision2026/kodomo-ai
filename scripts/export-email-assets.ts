/**
 * Email-redesign (Founder, 1 Oct 2026), item 3: "No SVG in email (Gmail strips it) — export
 * hatena_question.svg to PNG (2x)." Vite's own `public/` convention copies this verbatim into
 * every future `dist/` build (same convention scripts/build-home-kit.ts's own header comment
 * documents) — backend/server/frontendIndex.ts then serves `dist/` as-is, so the committed file
 * this script writes is what ships at `https://domo-ai.com/email/hatena_question@2x.png` with no
 * further build step. Re-run this script whenever the source SVG changes; `npm run build` alone
 * will not regenerate it.
 *
 * Usage: npx tsx scripts/export-email-assets.ts
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src/lp/assets/svg/hatena_question.svg');
const OUT_DIR = resolve(ROOT, 'public/email');
const OUT = resolve(OUT_DIR, 'hatena_question@2x.png');

// Source viewBox is 200x230 — rendered at that same 1x box size, then captured at
// deviceScaleFactor 2 for the "2x" export (400x460 actual pixels), transparent background so it
// sits cleanly on the navy header band at any email client's own rendering.
async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const svg = readFileSync(SRC, 'utf8');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 200, height: 230 }, deviceScaleFactor: 2 });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:200px;height:230px}</style></head><body>${svg}</body></html>`,
  );
  const svgEl = await page.$('svg');
  if (!svgEl) throw new Error('svg element not found after setContent');
  await svgEl.screenshot({ path: OUT, omitBackground: true });
  await browser.close();
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
