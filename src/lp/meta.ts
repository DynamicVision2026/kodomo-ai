// COPY-01: the real post-launch <title> for "/" — the ONE place this string is written. Imported
// by both src/lp/main.tsx (client-side document.title override, for a browser whose cached copy
// of this page predates the flip) and scripts/prerender-legal.ts (which patches the STATIC
// <title> tag baked into dist/index.html at build time, so a no-JS fetch of "/" sees the real
// title immediately too) — never a second hand-kept copy of this string to drift out of sync.
export const BEGINNER_LAUNCH_TITLE = 'ナゼホリ 入門コース — 家族で育てる「もう一問」の力';
