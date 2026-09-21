/**
 * WO-29 — builds the actual, customer-deliverable Module 1 Home Kit: one real PDF per
 * deliverable (rendered from the SAME production print routes /print/kit already serves, via
 * src/print/kit/main.tsx's `?item=<kitItem id>` filter added for exactly this purpose — see that
 * file's own doc comment), plus the complete ZIP.
 *
 * Output lands in `public/kit/...`, never `dist/` directly: Vite's own `public/` convention
 * already copies that directory verbatim into every future `dist/` build with zero config, so
 * the generated files ship through the EXISTING `npm run build` / Dockerfile.frontend pipeline
 * unchanged (Dockerfile.frontend runs only `npm run build`, nothing else). This script does NOT
 * modify Dockerfile.frontend, package.json's `build` script, or any deploy step — it produces the
 * committed artifact `public/kit/` is supposed to hold, the same way a designer would drop in a
 * hand-made asset. Re-run this script whenever kit content changes; re-running `npm run build`
 * alone will NOT regenerate these PDFs.
 *
 * Usage: npx tsx scripts/build-home-kit.ts
 */
import { chromium } from 'playwright';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homeKitPackage } from '../src/print/kit-data/homeKitPackage';

const ROOT = process.cwd();
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const PUBLIC_KIT = resolve(ROOT, 'public/kit');

function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      fetch(url).then(() => resolvePromise()).catch(() => {
        if (Date.now() > deadline) reject(new Error(`server did not come up at ${url}`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function main() {
  console.log('== WO-29 Home Kit build ==');

  console.log('-- building production frontend (npm run build) --');
  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('vite build failed');

  console.log(`-- starting preview server on :${PORT} --`);
  const preview: ChildProcess = spawn(
    'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  const stopPreview = () => { preview.kill(); };
  process.on('exit', stopPreview);
  await waitForServer(`${BASE}/print/kit/`);

  rmSync(PUBLIC_KIT, { recursive: true, force: true });
  mkdirSync(PUBLIC_KIT, { recursive: true });

  // This environment's cached Chromium revision predates the locally-installed `playwright`
  // package's own expected revision under PLAYWRIGHT_BROWSERS_PATH (this sandbox intentionally
  // never re-downloads browsers — see /root/.ccr/README.md's own PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
  // note) — an explicit executablePath sidesteps that mismatch without pinning the package
  // version. A CI/build environment with a matching Playwright browser cache can drop this.
  const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });

  for (const folder of homeKitPackage.folders) {
    const folderDir = resolve(PUBLIC_KIT, folder.id);
    mkdirSync(folderDir, { recursive: true });
    for (const item of folder.items) {
      const url = `${BASE}/print/kit/index.html?item=${encodeURIComponent(item.kitItem)}`;
      console.log(`   rendering ${folder.id}/${item.fileName}  <-  ${url}`);
      await page.goto(url, { waitUntil: 'networkidle' });
      const outPath = resolve(folderDir, item.fileName);
      await page.pdf({ path: outPath, preferCSSPageSize: true, printBackground: true });
    }
  }

  await browser.close();
  stopPreview();

  console.log('-- zipping the complete kit --');
  const zipWorkDir = resolve(ROOT, '.tmp-homekit-zip');
  rmSync(zipWorkDir, { recursive: true, force: true });
  const zipRoot = resolve(zipWorkDir, homeKitPackage.zipBaseName);
  mkdirSync(zipRoot, { recursive: true });
  for (const folder of homeKitPackage.folders) {
    cpSync(resolve(PUBLIC_KIT, folder.id), resolve(zipRoot, folder.id), { recursive: true });
  }
  const zipPath = resolve(PUBLIC_KIT, `${homeKitPackage.zipBaseName}.zip`);
  if (existsSync(zipPath)) rmSync(zipPath);
  const zip = spawnSync('zip', ['-r', zipPath, homeKitPackage.zipBaseName], { cwd: zipWorkDir, stdio: 'inherit' });
  if (zip.status !== 0) throw new Error('zip failed');
  rmSync(zipWorkDir, { recursive: true, force: true });

  // Mirror into the dist/ this run's own npm-run-build already produced, so the CURRENT preview
  // (e.g. for browser QA right after this script) serves the freshly generated files without a
  // second full rebuild. Future builds pick these up from public/kit/ automatically regardless.
  const distKit = resolve(ROOT, 'dist/kit');
  rmSync(distKit, { recursive: true, force: true });
  cpSync(PUBLIC_KIT, distKit, { recursive: true });

  console.log(`== done. Output: ${PUBLIC_KIT} (mirrored into dist/kit) ==`);
}

main().catch((e) => { console.error(e); process.exit(1); });
