# 04 — Rendering & Shelving

After Hook 3 produces `.tsx`, a non-AI step bundles the **real installed library** with the
generated code and screenshots it. Then everything is shelved under `prototypes/{id}/v{N}/`. The
full-flow CLI `run-flow.ts` orchestrates analyze → select → generate → render → shelve.

Files: `render-harness/` (Vite app), `src/render/vite-renderer.ts`, `src/screenshot-capture.ts`,
`src/ai/run-flow.ts`.

---

## The render harness (`render-harness/`)

A minimal Vite + React app. The generated code is written to `src/Prototype.tsx`, the harness is
built, and the static `dist/` is served and screenshotted. `node_modules` here holds the real
target libraries (installed by `resolve-library.ts` / the renderer).

`render-harness/package.json`:

```json
{
  "name": "render-harness",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "scripts": { "build": "vite build" },
  "dependencies": {
    "antd": "^5.29.3",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11"
  }
}
```

> `antd` is here as the default test fixture; any analyzed npm library gets installed alongside it
> on demand. `type: "module"` — the harness is ESM.
>
> **React version must satisfy the target library's `peerDependencies.react`.** The harness ships
> **React 19** because current libraries require it — e.g. **Mantine v9** (`@mantine/core`) has
> `react: ^19`. antd 5 and MUI work on both 18 and 19, so 19 is the safe default. If a render fails
> with a React peer/version error, bump (or pin) the harness React to match that library, then
> `npm install` in `render-harness/`.

`render-harness/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset URLs relative so the build can be served from any root.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  logLevel: 'warn',
});
```

`render-harness/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Prototype Render</title>
    <style>
      html, body, #root { margin: 0; padding: 0; min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`render-harness/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import Prototype from './Prototype';

createRoot(document.getElementById('root')!).render(<Prototype />);
```

`render-harness/src/Prototype.tsx` is a **placeholder that gets overwritten on every render** with
the generated code. Seed it with any valid default-exported component (e.g. `export default () =>
<div>prototype</div>;`).

> **The harness mounts `<Prototype />` bare — no provider wrapper, library-agnostic by design.** So
> the *generated code itself* must include any required root wrapper and style import. That works
> because Hook 1 records them in the profile (`globalWrappers`, `library.styleImport`) and Hook 3's
> system prompt says *"If the library has a style entrypoint or required wrapper, include it."* For
> Mantine the generated `.tsx` therefore imports `@mantine/core/styles.css` and wraps the screen in
> `<MantineProvider>` — without which Mantine components render unstyled or throw.

---

## `screenshot-capture.ts` — Playwright wrapper

A `ScreenshotCapture` class (used by both the renderer and the MCP server). Key behaviors:

- `initialize(options)` launches headless Chromium and a context with `viewport`,
  `deviceScaleFactor`. Creates `outputDir`. Defaults: `1280×720`, `deviceScaleFactor: 2`,
  `outputDir: './screenshots'`, `fullPage: false`.
- `captureURL(url, filename, options?)` — `page.goto(url, { waitUntil: 'networkidle', timeout:
  30000 })`, then waits (10 s) for `#root` to have children (React rendered), then a 1 s settle,
  then `page.screenshot({ path: <outputDir>/<filename>.png, fullPage })`. Returns
  `{ screenshotPath, timestamp, viewport, url }`.
- `captureHTML(html, filename, options?)` — `setContent` + same wait/settle/screenshot (used by the
  MCP `capture_html` tool).
- `captureComponent(html, name, options?)` — wraps a fragment in a minimal HTML doc then calls
  `captureHTML`.
- `close()` closes context + browser.
- Convenience `captureScreenshot(url, filename, options?)` initializes, captures a URL, closes.

```ts
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ScreenshotOptions {
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  outputDir?: string;
  fullPage?: boolean;
}
export interface CaptureResult {
  screenshotPath: string; timestamp: number;
  viewport: { width: number; height: number }; url: string;
}

export class ScreenshotCapture {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private defaultOptions: ScreenshotOptions = {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2, outputDir: './screenshots', fullPage: false,
  };

  async initialize(options?: Partial<ScreenshotOptions>): Promise<void> {
    const opts = { ...this.defaultOptions, ...options };
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: opts.viewport, deviceScaleFactor: opts.deviceScaleFactor,
    });
    if (opts.outputDir) await fs.mkdir(opts.outputDir, { recursive: true });
  }

  async captureURL(url: string, filename: string, options?: Partial<ScreenshotOptions>): Promise<CaptureResult> {
    if (!this.context) throw new Error('ScreenshotCapture not initialized. Call initialize() first.');
    const opts = { ...this.defaultOptions, ...options };
    const page = await this.context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      try {
        await page.waitForFunction(
          `(() => { const root = document.getElementById('root'); return root && root.children.length > 0; })()`,
          { timeout: 10000 }
        );
      } catch { console.warn('Warning: React content not detected in #root, proceeding anyway...'); }
      await page.waitForTimeout(1000);
      const screenshotPath = path.join(opts.outputDir || './screenshots', `${filename}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: opts.fullPage });
      return { screenshotPath, timestamp: Date.now(), viewport: opts.viewport!, url };
    } finally { await page.close(); }
  }

  // captureHTML / captureComponent omitted for brevity — same wait/settle/screenshot pattern.

  async close(): Promise<void> {
    if (this.context) { await this.context.close(); this.context = null; }
    if (this.browser) { await this.browser.close(); this.browser = null; }
  }
}
```

---

## `vite-renderer.ts` — real-library render

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import { execSync } from 'child_process';
import { ScreenshotCapture } from '../screenshot-capture';

const HARNESS_DIR = path.join(__dirname, '..', '..', 'render-harness');

export interface RenderOptions {
  libraryInstall: string[];     // npm spec(s), e.g. ["antd@5"], installed into the harness
  outputScreenshotPath: string;
  viewport?: { width: number; height: number };
  port?: number;
}

function mime(file: string): string {
  if (file.endsWith('.js') || file.endsWith('.mjs')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function ensureDeps(libraryInstall: string[]): Promise<void> {
  const viteInstalled = await fs.access(path.join(HARNESS_DIR, 'node_modules', 'vite'))
    .then(() => true).catch(() => false);
  if (!viteInstalled) {
    console.log('[renderer] installing harness base deps (react, vite)…');
    execSync('npm install', { cwd: HARNESS_DIR, stdio: 'inherit' });
  }
  for (const spec of libraryInstall) {
    const baseName = spec.startsWith('@') ? '@' + spec.slice(1).split('@')[0] : spec.split('@')[0];
    const present = await fs.access(path.join(HARNESS_DIR, 'node_modules', baseName))
      .then(() => true).catch(() => false);
    if (!present) {
      console.log(`[renderer] installing target library: ${spec}…`);
      execSync(`npm install ${spec}`, { cwd: HARNESS_DIR, stdio: 'inherit' });
    }
  }
}

function serveDist(distDir: string, port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(distDir, p);
      try {
        const data = await fs.readFile(file);
        res.setHeader('Content-Type', mime(file));
        res.end(data);
      } catch { res.statusCode = 404; res.end('not found'); }
    });
    server.listen(port, () => resolve(server));
  });
}

export async function renderPrototype(code: string, opts: RenderOptions): Promise<string> {
  await ensureDeps(opts.libraryInstall);

  // 1. Drop generated code into the harness entry component.
  await fs.writeFile(path.join(HARNESS_DIR, 'src', 'Prototype.tsx'), code, 'utf-8');

  // 2. Build with Vite.
  console.log('[renderer] building harness with Vite…');
  execSync('npm run build', { cwd: HARNESS_DIR, stdio: 'inherit' });

  // 3. Serve the static build.
  const port = opts.port ?? 4317;
  const distDir = path.join(HARNESS_DIR, 'dist');
  const server = await serveDist(distDir, port);

  // 4. Screenshot via Playwright.
  const capture = new ScreenshotCapture();
  try {
    await fs.mkdir(path.dirname(opts.outputScreenshotPath), { recursive: true });
    await capture.initialize({
      viewport: opts.viewport ?? { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      outputDir: path.dirname(opts.outputScreenshotPath),
      fullPage: true,
    });
    const result = await capture.captureURL(
      `http://localhost:${port}`,
      path.basename(opts.outputScreenshotPath, '.png')
    );
    if (result.screenshotPath !== opts.outputScreenshotPath) {
      await fs.copyFile(result.screenshotPath, opts.outputScreenshotPath);
    }
    return opts.outputScreenshotPath;
  } finally {
    await capture.close();
    server.close();
  }
}
```

**Render flow:** ensure deps → overwrite `Prototype.tsx` → `npm run build` → serve `dist/` over a
tiny `http` server on port `4317` → Playwright `captureURL` at `1440×900`, `fullPage`,
`deviceScaleFactor: 2` → copy/return the PNG. The screenshot reflects the **actual** library
because the harness imports it from `node_modules` and Vite bundles it for real.

---

## `run-flow.ts` — the full orchestrator CLI

Required flags: `--library <dir>` `--name "<name>"` `--prompt "<text>"`. Optional: `--install
"<spec...>"` (one OR MORE space-separated npm specs — a package plus its runtime peers, e.g.
`"@mui/material @emotion/react @emotion/styled"` — ensured installed for analysis+render),
`--profile <path>` (use a specific shelved profile; the backend passes
`doc-reader/{slug}/profile.json`), `--refine "<instruction>"`.

Steps (each logged with a `[n/4]` marker the backend keys progress off):

```
0. installSpecs = --install split on whitespace. If any: ensure render-harness has them
        (npm install harness base, then `npm install <all specs>`; presence keyed off the first).
1. [1/4] analyze: reuse the shelved profile at --profile (or doc-reader/{slug(libName)}/profile.json),
        else run analyzeLibrary. Re-render library-refs/{slug}/REFERENCE.md from the profile.
2.       versioning: id = slug(name). If prototypes/{id}/metadata.json exists -> bump currentVersion,
        push a new version entry; else create metadata. Make prototypes/{id}/v{N}/.
3. [2/4] select: read prior REFERENTIAL_DOC.json (if any) as referentialDoc -> selectComponents().
4. [3/4] generate: componentName = PascalCase(id). For v>1, load prior v{N-1}/{id}.tsx as previousCode.
        generatePrototype() -> { code, unknownImports }. Warn on unknown imports. Write v{N}/{id}.tsx.
5. [4/4] render: renderPrototype(code, { libraryInstall: installSpecs, outputScreenshotPath })
        -> v{N}/screenshot.png.
6. Write metadata.json, REFERENTIAL_DOC.json, and v{N}/result.json.
   Print "__RESULT__<json>" as the FINAL stdout line.
```

Key code excerpts (the parts a re-implementer must match exactly):

```ts
function componentNameFromId(id: string): string {
  return id.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

const id = slug(args.name);                 // e.g. "Support Dashboard" -> "support-dashboard"
const componentName = componentNameFromId(id); // -> "SupportDashboard"

// versioning
if (hadMeta) {
  metadata = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
  metadata.currentVersion += 1;
  metadata.versions.push({ version: metadata.currentVersion, requirement: args.refine || args.prompt });
  metadata.updated = new Date('2026-05-29').toISOString();
} else {
  metadata = {
    id, name: args.name, library: profile.library.name, description: args.prompt,
    currentVersion: 1, versions: [{ version: 1, requirement: args.prompt }],
    created: new Date('2026-05-29').toISOString(), updated: new Date('2026-05-29').toISOString(),
  };
}

// prior code only for refinements
if (version > 1) {
  priorCode = await fs.readFile(path.join(protoDir, `v${version - 1}`, `${id}.tsx`), 'utf-8').catch(() => undefined);
}

// final stdout line the backend parses:
console.log(`__RESULT__${JSON.stringify(result)}`);
```

> Note: timestamps use a fixed `new Date('2026-05-29')` for deterministic output in this build.
> If you want real timestamps, swap to `new Date()` — the backend does not depend on the value.

The orchestrator gets its provider via `getProvider()` and prints `=== AI Prototyping Flow
(provider: <name>) ===` plus `[1/4]…[4/4]` progress lines to stdout.

---

### Full `run-flow.ts` (complete, verified)

The excerpts above are the load-bearing parts; the complete file below was rebuilt from this
blueprint and verified end-to-end (it prints the `[1/4]…[4/4]` markers the backend keys progress
off, and the `__RESULT__<json>` final line `pipeline.ts` parses):

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { getProvider } from './provider';
import { analyzeLibrary, loadProfile, slug } from './library-analyzer';
import { profileToMarkdown } from './profile-to-markdown';
import { selectComponents } from './component-selector';
import { generatePrototype } from './ai-generator';
import { renderPrototype } from '../render/vite-renderer';
import { projectRoot } from './paths';

interface Args { library: string; name: string; prompt: string; install?: string; profile?: string; refine?: string; }

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.replace(/^--/, '')] = argv[++i];
  }
  for (const req of ['library', 'name', 'prompt']) {
    if (!out[req]) throw new Error(`Required: --library <dir> --name "<name>" --prompt "<text>"`);
  }
  return out as unknown as Args;
}
async function exists(p: string): Promise<boolean> { return fs.access(p).then(() => true).catch(() => false); }
function componentNameFromId(id: string): string {
  return id.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** Step 0 — make sure the render harness has the install specs (base deps first). */
async function ensureHarnessDeps(root: string, installSpecs: string[]): Promise<void> {
  if (!installSpecs.length) return;
  const harness = path.join(root, 'render-harness');
  const first = installSpecs[0];
  const baseName = first.startsWith('@') ? '@' + first.slice(1).split('@')[0] : first.split('@')[0];
  if (await exists(path.join(harness, 'node_modules', baseName))) return;
  if (!(await exists(path.join(harness, 'node_modules', 'vite')))) {
    execSync('npm install', { cwd: harness, stdio: 'inherit' });
  }
  execSync(`npm install ${installSpecs.join(' ')}`, { cwd: harness, stdio: 'inherit' });
}

async function libraryNameOf(libraryDir: string): Promise<string> {
  const pkg = JSON.parse((await fs.readFile(path.join(libraryDir, 'package.json'), 'utf-8').catch(() => '')) || '{}');
  return pkg.name || path.basename(libraryDir);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = getProvider();
  const root = projectRoot();
  console.log(`=== AI Prototyping Flow (provider: ${provider.name}) ===`);

  const installSpecs = (args.install || '').split(/\s+/).filter(Boolean);
  await ensureHarnessDeps(root, installSpecs);

  console.log('[1/4] analyze');
  let profile;
  const explicitProfile = args.profile ? path.resolve(args.profile) : null;
  if (explicitProfile && (await exists(explicitProfile))) {
    profile = await loadProfile(explicitProfile);
  } else {
    const guessed = path.join(root, 'doc-reader', slug(await libraryNameOf(args.library)), 'profile.json');
    profile = (await exists(guessed)) ? await loadProfile(guessed) : (await analyzeLibrary(args.library, { provider })).profile;
  }
  const librarySlug = slug(profile.library.name);
  const refDir = path.join(root, 'library-refs', librarySlug);
  await fs.mkdir(refDir, { recursive: true });
  await fs.writeFile(path.join(refDir, 'REFERENCE.md'), profileToMarkdown(profile), 'utf-8');

  const id = slug(args.name);
  const componentName = componentNameFromId(id);
  const protoDir = path.join(root, 'prototypes', id);
  await fs.mkdir(protoDir, { recursive: true });
  const metaPath = path.join(protoDir, 'metadata.json');
  const hadMeta = await exists(metaPath);

  let metadata: any;
  if (hadMeta) {
    metadata = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    metadata.currentVersion += 1;
    metadata.versions.push({ version: metadata.currentVersion, requirement: args.refine || args.prompt });
    metadata.updated = new Date('2026-05-29').toISOString();
  } else {
    metadata = {
      id, name: args.name, library: profile.library.name, description: args.prompt,
      currentVersion: 1, versions: [{ version: 1, requirement: args.prompt }],
      created: new Date('2026-05-29').toISOString(), updated: new Date('2026-05-29').toISOString(),
    };
  }
  const version: number = metadata.currentVersion;
  const vDir = path.join(protoDir, `v${version}`);
  await fs.mkdir(vDir, { recursive: true });

  console.log('[2/4] select');
  const refDocPath = path.join(protoDir, 'REFERENTIAL_DOC.json');
  const priorRefDoc = (await fs.readFile(refDocPath, 'utf-8').catch(() => '')) || undefined;
  const plan = await selectComponents(args.prompt, profile, { provider, prototypeId: id, referentialDoc: priorRefDoc });

  console.log('[3/4] generate');
  let priorCode: string | undefined;
  if (version > 1) {
    priorCode = await fs.readFile(path.join(protoDir, `v${version - 1}`, `${id}.tsx`), 'utf-8').catch(() => undefined);
  }
  const { code, unknownImports } = await generatePrototype(args.prompt, profile, plan, {
    provider, prototypeId: id, componentName, version, previousCode: priorCode, refinementInstruction: args.refine,
  });
  if (unknownImports.length) console.warn(`[warn] unknown imports (not in profile): ${unknownImports.join(', ')}`);
  const codePath = path.join(vDir, `${id}.tsx`);
  await fs.writeFile(codePath, code, 'utf-8');

  console.log('[4/4] render');
  const screenshotPath = path.join(vDir, 'screenshot.png');
  try {
    await renderPrototype(code, { libraryInstall: installSpecs, outputScreenshotPath: screenshotPath });
  } catch (e) {
    console.warn(`[warn] render failed: ${(e as Error).message}`);
  }

  const chosen = plan.chosenComponents.map((c) => c.name);
  const realGaps = plan.gaps.filter((g) => !g.libraryCanProvide).map((g) => g.need).filter(Boolean);
  const learnings = [
    `Library "${profile.library.name}" satisfied the request using: ${chosen.join(', ')}.`,
    realGaps.length ? `Gaps the library could not cover: ${realGaps.join(', ')}.` : 'No capability gaps were found for this request.',
  ];
  const referentialDoc = {
    prototypeId: id, library: profile.library.name, latestVersion: version,
    componentPlan: plan, importAudit: { unknownImports }, learnings,
  };
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  await fs.writeFile(refDocPath, JSON.stringify(referentialDoc, null, 2), 'utf-8');

  const result = {
    ok: true, id, name: args.name, library: profile.library.name, version,
    codePath: path.relative(root, codePath), screenshotPath: path.relative(root, screenshotPath),
    chosenComponents: chosen, gaps: plan.gaps, unknownImports,
  };
  await fs.writeFile(path.join(vDir, 'result.json'), JSON.stringify(result, null, 2), 'utf-8');
  console.log(`__RESULT__${JSON.stringify(result)}`);
}

main().catch((e) => {
  console.log(`__RESULT__${JSON.stringify({ ok: false, error: e.message })}`);
  process.exit(1);
});
```

> `learnings[1]` lists only the gaps where `libraryCanProvide === false`. When only `--library` is
> given (no `--profile`), `libraryNameOf()` derives the slug from the dir's `package.json` name to
> locate a shelved profile before falling back to a fresh analyze. The backend always passes
> `--profile`, so that branch only matters for pure-CLI use.

## The shelving model

```
prototypes/{id}/
├── metadata.json            # see shape below
├── REFERENTIAL_DOC.json     # plan + learnings, fed back into the next select/generate
└── v{N}/
    ├── {id}.tsx             # the generated base code
    ├── screenshot.png       # the rendered screenshot
    └── result.json          # the per-version machine result (== the __RESULT__ payload)
```

`{id}` = `slug(name)`. **Same `--name` ⇒ same `{id}` ⇒ a new `v{N}` (history is never overwritten).**

### `metadata.json`

```jsonc
{
  "id": "support-dashboard",
  "name": "Support Dashboard",
  "library": "antd",
  "description": "<the original prompt>",
  "currentVersion": 2,
  "versions": [
    { "version": 1, "requirement": "<v1 prompt>" },
    { "version": 2, "requirement": "<v2 refine or prompt>" }
  ],
  "created": "2026-05-29T00:00:00.000Z",
  "updated": "2026-05-29T00:00:00.000Z"
}
```

### `REFERENTIAL_DOC.json`

```jsonc
{
  "prototypeId": "support-dashboard",
  "library": "antd",
  "latestVersion": 2,
  "componentPlan": { /* the full ComponentPlan from Hook 2 */ },
  "importAudit": { "unknownImports": [] },
  "learnings": [
    "Library \"antd\" satisfied the request using: Card, Table, Tag, Statistic.",
    "Gaps the library could not cover: real-time websocket updates."  // or "No capability gaps..."
  ]
}
```

`learnings[0]` always lists the chosen components; `learnings[1]` lists the gaps (or a
"No capability gaps were found" line). On a refine run this whole doc is read back in and passed to
Hook 2 as `referentialDoc`, and the prior version's code is passed to Hook 3 as `previousCode` —
the basis for cheaper, consistent refinements (Goal G7).

### `result.json` (== the `__RESULT__` payload)

```jsonc
{
  "ok": true,
  "id": "support-dashboard",
  "name": "Support Dashboard",
  "library": "antd",
  "version": 2,
  "codePath": "prototypes/support-dashboard/v2/support-dashboard.tsx",
  "screenshotPath": "prototypes/support-dashboard/v2/screenshot.png",
  "chosenComponents": ["Card", "Table", "Tag", "Statistic"],
  "gaps": [ { "need": "...", "libraryCanProvide": false, "fallback": "..." } ],
  "unknownImports": []
}
```

Paths are relative to `prototyping-system/`. The backend's `store.ts` reads `result.json` to
populate version detail; `run-flow.ts` also echoes this object after `__RESULT__` for the backend's
`pipeline.ts` to parse.

Next: [`05-backend-express.md`](./05-backend-express.md) — how the server spawns these CLIs and
streams progress.
