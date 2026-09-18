import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Multi-page static build: LP at /, app at /play, family-code redemption at /play/unlock,
// printable deck at /print/deck.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        lp: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play/index.html'),
        unlock: resolve(__dirname, 'play/unlock/index.html'),
        deck: resolve(__dirname, 'print/deck/index.html'),
        tokushoho: resolve(__dirname, 'legal/tokushoho/index.html'),
        privacy: resolve(__dirname, 'legal/privacy/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
