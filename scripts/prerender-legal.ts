/**
 * WO-C7 item 2 follow-up (Founder, 3 Oct 2026): "the body must be plain HTML, not only after
 * JavaScript loads." This repo is a pure client-rendered Vite multi-page app (every route's
 * index.html is just `<div id="root"></div>` + a `<script type="module">` — confirmed, no
 * SSR/static pre-render anywhere else in this codebase), so the static footer added earlier
 * satisfies that for the footer alone, but the legal pages' own BODY TEXT — the actual 特商法/
 * privacy content, including the refund wording — still only appeared after React mounted.
 *
 * This script runs AFTER `vite build` (wired into the `build` npm script, so it's part of the
 * exact same `npm run build` Dockerfile.frontend already runs — no separate deploy step needed)
 * and renders the real TokushohoPage/TokushohoPreviewPage/PrivacyPage components to a static HTML
 * string via `react-dom/server`, using Vite's own `ssrLoadModule` so `import.meta.env.
 * VITE_BEGINNER_LAUNCH` resolves exactly the way it does in the real client bundle built two
 * steps ago in the same `npm run build` invocation (same process, same inherited env) — this is
 * the SAME component tree and the SAME shared consentText.ts constants, never a second hand-kept
 * copy of the legal text.
 *
 * The result is spliced into each route's already-built dist/.../index.html, replacing the empty
 * `<div id="root"></div>` with `<div id="root">...the real rendered markup...</div>`. The client
 * bundle's own `<script type="module">` tag is untouched — it still runs, and `createRoot(...).
 * render(...)` simply re-renders the identical tree over this static content (no hydrateRoot, so
 * no hydration-mismatch risk; the brief re-render is visually a no-op since the markup matches).
 */
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');

if (!existsSync(DIST)) {
  console.error('prerender-legal — dist/ not found. Run `vite build` first.');
  process.exit(1);
}

interface Target {
  /** Module path Vite's ssrLoadModule resolves, same as a browser import specifier. */
  modulePath: string;
  /** Named export to render. */
  exportName: string;
  /** dist/-relative path to the already-built index.html to splice the markup into. */
  distHtmlPath: string;
  /** A substring the rendered markup MUST contain — fails the build if missing, so a future
   *  refactor that silently breaks prerendering (e.g. renaming an export) is caught at build
   *  time, not discovered later by a human curling the live page. */
  mustContain: string;
}

const TARGETS: Target[] = [
  {
    modulePath: '/src/legal/tokushoho/TokushohoPage.tsx',
    exportName: 'TokushohoPage',
    distHtmlPath: 'legal/tokushoho/index.html',
    mustContain: '特定商取引法に基づく表記',
  },
  {
    modulePath: '/src/legal/tokushoho/TokushohoPage.tsx',
    exportName: 'TokushohoPreviewPage',
    distHtmlPath: 'legal/tokushoho-preview/index.html',
    // The preview always renders the v3 text regardless of VITE_BEGINNER_LAUNCH — this is the
    // one place a stray regression (reverting to the old row set, or losing the v4 72h wording)
    // would be caught at build time.
    mustContain: 'ご購入日時から72時間以内',
  },
  {
    modulePath: '/src/legal/privacy/PrivacyPage.tsx',
    exportName: 'PrivacyPage',
    distHtmlPath: 'legal/privacy/index.html',
    mustContain: 'プライバシーポリシー',
  },
];

async function main() {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

  let failed = false;
  try {
    for (const target of TARGETS) {
      const mod = await server.ssrLoadModule(target.modulePath);
      const Component = mod[target.exportName];
      if (typeof Component !== 'function') {
        console.error(`prerender-legal — ${target.modulePath} has no export "${target.exportName}"`);
        failed = true;
        continue;
      }

      const markup = renderToStaticMarkup(createElement(Component));
      if (!markup.includes(target.mustContain)) {
        console.error(
          `prerender-legal — ${target.distHtmlPath}: rendered markup is missing the expected text "${target.mustContain}"`,
        );
        failed = true;
        continue;
      }

      const htmlPath = resolve(DIST, target.distHtmlPath);
      if (!existsSync(htmlPath)) {
        console.error(`prerender-legal — ${htmlPath} not found (check vite.config.ts's rollupOptions.input)`);
        failed = true;
        continue;
      }

      const original = readFileSync(htmlPath, 'utf-8');
      if (!original.includes('<div id="root"></div>')) {
        console.error(`prerender-legal — ${htmlPath}: expected an empty <div id="root"></div> to splice into, found none (already prerendered twice?)`);
        failed = true;
        continue;
      }
      const updated = original.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
      writeFileSync(htmlPath, updated);
      console.log(`prerender-legal — OK: ${target.distHtmlPath}`);
    }
  } finally {
    await server.close();
  }

  if (failed) {
    console.error('prerender-legal: FAILED');
    process.exit(1);
  }
}

main();
