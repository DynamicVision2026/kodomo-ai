import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Multi-page static build: LP at /, app at /play, AD-13 Family Account screens at /login and
// /account (outside /play — parent voice, never part of the child play surface), printable deck
// at /print/deck, printable home-kit production containers at /print/kit (WO-19 Phase 4 — pending
// placeholders today; real pages once content lands, no rebuild logic needed here).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        lp: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play/index.html'),
        login: resolve(__dirname, 'login/index.html'),
        account: resolve(__dirname, 'account/index.html'),
        deck: resolve(__dirname, 'print/deck/index.html'),
        kit: resolve(__dirname, 'print/kit/index.html'),
        printCentre: resolve(__dirname, 'print/centre/index.html'),
        // AD-12 Pass 1: a static-states gallery for screenshot/regression coverage of the new
        // src/ad12/ component library — not a product route, never linked from the live app.
        designAd12: resolve(__dirname, 'design/ad12/index.html'),
        tokushoho: resolve(__dirname, 'legal/tokushoho/index.html'),
        privacy: resolve(__dirname, 'legal/privacy/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // e2e/ holds Playwright screenshot specs (playwright.config.ts's own testDir) — real-browser
    // tests, never runnable under jsdom. Vitest's default include (**/*.{test,spec}.*) would
    // otherwise try to load them too and fail on Playwright's own `test`/`expect` globals.
    // Explicitly setting `exclude` replaces Vitest's own default array, so the usual entries are
    // repeated here rather than lost.
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**', 'e2e/**',
    ],
  },
});
