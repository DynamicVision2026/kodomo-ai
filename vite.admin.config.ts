import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// AD-16 §8: the `kodomo-ai-admin` dashboard's OWN, completely separate build — deliberately never
// part of vite.config.ts's own multi-page `input` map. That config's output (`dist/`) is what the
// PUBLIC frontend Cloud Run service ships; if this entry lived there too, the admin UI's HTML/JS
// would ship inside the public, non-IAP-protected container, exactly what AD-16 forbids ("nothing
// admin-related ships in the public frontend or backend"). This config's own output (`dist-admin/`)
// is instead served ONLY by backend/server/adminIndex.ts — the separate, IAP-protected service.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-admin',
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'admin-dashboard/index.html'),
      },
    },
  },
});
