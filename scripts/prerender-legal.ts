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
import { BEGINNER_LAUNCH_TITLE } from '../src/lp/meta';

const DIST = resolve(process.cwd(), 'dist');

if (!existsSync(DIST)) {
  console.error('prerender-legal — dist/ not found. Run `vite build` first.');
  process.exit(1);
}

// Read directly from process.env, not import.meta.env — this file runs as a plain `tsx` process
// (no Vite transform of its own top-level code), and matching the exact same raw env var
// Dockerfile.frontend's ARG/ENV pair sets means this check never depends on Vite's own
// import.meta.env substitution working correctly inside ssrLoadModule below — it's an
// independent, second verification of the same flag.
const BEGINNER_LAUNCH = process.env.VITE_BEGINNER_LAUNCH === '1';

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
  /** Substrings the rendered markup must NOT contain — catches the specific regression of a
   *  flag-on build still rendering retired/flag-off/draft copy (e.g. the prerender step silently
   *  running against an undefined flag, or the draft banner leaking onto a live route). Checked
   *  only when present. */
  mustNotContain?: string[];
}

const TARGETS: Target[] = [
  {
    modulePath: '/src/legal/tokushoho/TokushohoPage.tsx',
    exportName: 'TokushohoPage',
    distHtmlPath: 'legal/tokushoho/index.html',
    // WO-C7 flip-regression gate (Founder, 3 Oct 2026): once BEGINNER_LAUNCH is on, this page
    // MUST carry the real v4 72-hour wording and MUST NOT still show the pre-launch "coming
    // soon" refund placeholder, nor the internal draft/review banner (Founder-approved for
    // launch — that banner now lives only on TokushohoPreviewPage, never this real public route).
    // Off-flag builds keep the original, weaker heading-only check (this page's off-flag content
    // is the current production default, not a regression target).
    mustContain: BEGINNER_LAUNCH ? 'ご購入日時から72時間以内' : '特定商取引法に基づく表記',
    mustNotContain: BEGINNER_LAUNCH ? ['返金ポリシーは近日公開予定です', '草案'] : undefined,
  },
  {
    modulePath: '/src/legal/tokushoho/TokushohoPage.tsx',
    exportName: 'TokushohoPreviewPage',
    distHtmlPath: 'legal/tokushoho-preview/index.html',
    // The preview always renders the v3 text regardless of VITE_BEGINNER_LAUNCH — this is the
    // one place a stray regression (reverting to the old row set, or losing the v4 72h wording)
    // would be caught at build time. The draft banner is expected and fine here (reviewer-only,
    // noindexed route) — never asserted absent.
    mustContain: 'ご購入日時から72時間以内',
  },
  {
    modulePath: '/src/legal/privacy/PrivacyPage.tsx',
    exportName: 'PrivacyPage',
    distHtmlPath: 'legal/privacy/index.html',
    mustContain: 'プライバシーポリシー',
    // Same flip-regression gate as tokushoho above — this page has no preview variant at all, so
    // the draft banner is removed unconditionally in source; this just confirms it stays gone.
    mustNotContain: BEGINNER_LAUNCH ? ['草案'] : undefined,
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
          `prerender-legal — ${target.distHtmlPath}: rendered markup is missing the expected text "${target.mustContain}" (VITE_BEGINNER_LAUNCH=${BEGINNER_LAUNCH ? '1' : 'unset'})`,
        );
        failed = true;
        continue;
      }
      const foundForbidden = target.mustNotContain?.find((s) => markup.includes(s));
      if (foundForbidden) {
        console.error(
          `prerender-legal — ${target.distHtmlPath}: rendered markup still contains the retired/draft text "${foundForbidden}" (VITE_BEGINNER_LAUNCH=${BEGINNER_LAUNCH ? '1' : 'unset'})`,
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

  // WO-C7 flip follow-up (Founder, 3 Oct 2026): dist/index.html's static <title> is baked at
  // vite-build time and was never flag-gated (src/lp/main.tsx's own client-side document.title
  // override only reaches a browser that runs the JS — a no-JS fetch of "/" saw the pre-launch
  // title even with the flag on). Patches it here, in the same build step that already makes the
  // legal pages' body text real static HTML, from the SAME shared string src/lp/main.tsx imports
  // — never a second hand-kept copy to drift from it.
  if (BEGINNER_LAUNCH) {
    const rootHtmlPath = resolve(DIST, 'index.html');
    if (!existsSync(rootHtmlPath)) {
      console.error(`prerender-legal — ${rootHtmlPath} not found (check vite.config.ts's rollupOptions.input)`);
      failed = true;
    } else {
      const original = readFileSync(rootHtmlPath, 'utf-8');
      const titleTag = /<title>.*?<\/title>/s;
      if (!titleTag.test(original)) {
        console.error(`prerender-legal — ${rootHtmlPath}: no <title> tag found to patch`);
        failed = true;
      } else {
        writeFileSync(rootHtmlPath, original.replace(titleTag, `<title>${BEGINNER_LAUNCH_TITLE}</title>`));
        console.log('prerender-legal — OK: dist/index.html <title> patched to the post-launch title');
      }
    }

    // WO-C7 flip follow-up (Founder, 3 Oct 2026): "/lp-new/" is the reviewer-only pre-launch
    // preview of the new landing page (src/lp/newMain.tsx already does `window.location.
    // replace('/')` there once the flag is on) — but that's a client-side-only redirect, so a
    // no-JS fetch of "/lp-new/" still saw the "（プレビュー）"-titled preview page even after
    // launch. Patches dist/lp-new/index.html the same way: a static <meta http-equiv="refresh">
    // redirect (honoured by real browsers without JS) plus the same post-launch title, so a no-JS
    // client is told to go to "/" immediately instead of seeing stale preview copy. The existing
    // client script tag is untouched — JS-enabled browsers still redirect instantly via it too.
    const lpNewHtmlPath = resolve(DIST, 'lp-new/index.html');
    if (!existsSync(lpNewHtmlPath)) {
      console.error(`prerender-legal — ${lpNewHtmlPath} not found (check vite.config.ts's rollupOptions.input)`);
      failed = true;
    } else {
      const original = readFileSync(lpNewHtmlPath, 'utf-8');
      const titleTag = /<title>.*?<\/title>/s;
      if (!titleTag.test(original) || !original.includes('</head>')) {
        console.error(`prerender-legal — ${lpNewHtmlPath}: no <title> tag or </head> found to patch`);
        failed = true;
      } else {
        const withTitle = original.replace(titleTag, `<title>${BEGINNER_LAUNCH_TITLE}</title>`);
        const withRedirect = withTitle.replace(
          '</head>',
          `    <meta http-equiv="refresh" content="0; url=/" />\n  </head>`,
        );
        writeFileSync(lpNewHtmlPath, withRedirect);
        console.log('prerender-legal — OK: dist/lp-new/index.html patched with a static redirect to /');
      }
    }
  }

  if (failed) {
    console.error('prerender-legal: FAILED');
    process.exit(1);
  }
}

main();
