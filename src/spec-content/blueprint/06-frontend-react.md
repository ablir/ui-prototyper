# 06 — The React Frontend (`web/`)

A Vite + React + TypeScript SPA. Three tabs — **Libraries** (pick/analyze), **Generate** (prompt →
code + screenshot), **History** (prototypes + versions) — all driven by the API contract in
[`05-backend-express.md`](./05-backend-express.md). Long jobs stream progress over SSE via the
`useJobStream` hook.

> **Status note.** The full `web/` app now **exists and is the source of truth**: `package.json`,
> `vite.config.ts`, `index.html`, `tsconfig.json`, `tsconfig.node.json`, `src/main.tsx`,
> `src/App.tsx`, `src/api.ts`, `src/useJobStream.ts`, `src/styles.css`, `src/vite-env.d.ts`, and the
> components `Libraries.tsx`, `Generate.tsx`, `History.tsx`, `JobProgress.tsx`, `CodeViewer.tsx`,
> `Chips.tsx`. It typechecks and builds clean, and was verified rendering against the live backend.
> Sections below that were written before those files landed are tagged **[target spec]** — they are
> complete, working specifications; when rebuilding, prefer copying the actual `web/` files, and use
> the [target spec] prose as the authoritative description of intended behavior.

---

## Project config (present — verbatim)

`web/package.json`:

```json
{
  "name": "prototyping-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "~5.4.5",
    "vite": "^5.3.4"
  }
}
```

`web/vite.config.ts` — dev server on `:5173`, proxy `/api` → backend `:4000`. The proxy streams
chunks (no buffering) so SSE works:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
```

`web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Prototyping Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/tsconfig.json` (strict, `react-jsx`, `noUnusedLocals/Parameters`) and
`web/tsconfig.node.json` (composite, for `vite.config.ts`) — reproduce as standard Vite-React-TS
configs; the exact `tsconfig.json` `compilerOptions` are: `target ES2020`,
`useDefineForClassFields true`, `lib ["ES2020","DOM","DOM.Iterable"]`, `module ESNext`,
`moduleResolution "bundler"`, `allowImportingTsExtensions true`, `resolveJsonModule true`,
`isolatedModules true`, `noEmit true`, `jsx "react-jsx"`, `strict true`, `noUnusedLocals true`,
`noUnusedParameters true`, `noFallthroughCasesInSwitch true`; `include ["src"]`,
`references [{ "path": "./tsconfig.node.json" }]`.

Literal files (verified to `npm run build` clean — note `noUnusedLocals/noUnusedParameters: true`,
so any unused import in the reconstructed components is a hard error):

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`web/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

Also add `web/src/vite-env.d.ts` containing `/// <reference types="vite/client" />` so
`import.meta.env.VITE_API_BASE` typechecks.

---

## `src/api.ts` — typed client (present — verbatim)

`API_BASE = import.meta.env.VITE_API_BASE ?? '/api'`. All types mirror the backend contract.

```ts
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

// ---- Domain types ----
export interface LibrarySummary {
  slug: string; name: string; version: string; installSpec: string | null;
  componentCount: number; components: string[]; hasReference: boolean;
}
export interface LibraryComponent { name: string; category: string; description: string; }
export interface LibraryDetail {
  slug: string; name: string; version: string; installSpec: string | null;
  componentCount: number; components: LibraryComponent[]; limitations: string[]; reference: string;
}
export interface Gap { need: string; libraryCanProvide: boolean; fallback: string; }
export interface PrototypeSummary {
  id: string; name: string; library: string; currentVersion: number; description: string; updated: string;
}
export interface PrototypeVersion {
  version: number; requirement: string; hasScreenshot: boolean;
  chosenComponents: string[]; gaps: Gap[]; unknownImports: string[];
}
export interface PrototypeDetail {
  id: string; name: string; library: string; currentVersion: number;
  description: string; versions: PrototypeVersion[];
}
export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type StepStatus = 'pending' | 'running' | 'done' | 'error';
export interface JobStep { name: string; status: StepStatus; }
export interface AnalyzeResult {
  ok: boolean; name: string; slug: string; version: string; componentCount: number;
  components: string[]; installSpec: string | null; referencePath: string; [k: string]: unknown;
}
export interface GenerateResult {
  ok: boolean; id: string; name: string; library: string; version: number;
  codePath: string; screenshotPath: string; chosenComponents: string[];
  gaps: Gap[]; unknownImports: string[]; [k: string]: unknown;
}
export interface Job<R = unknown> {
  id: string; type: 'analyze' | 'generate'; status: JobStatus;
  steps: JobStep[]; log: string[]; result?: R; error?: string;
}

// ---- fetch helper ----
async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try { const body = (await res.json()) as { error?: string }; if (body?.error) message = body.error; } catch {}
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// ---- Libraries ----
export async function listLibraries(): Promise<LibrarySummary[]> {
  const data = await jsonOrThrow<{ libraries: LibrarySummary[] }>(await fetch(`${API_BASE}/libraries`));
  return data.libraries;
}
export async function getLibrary(slug: string): Promise<LibraryDetail> {
  return jsonOrThrow<LibraryDetail>(await fetch(`${API_BASE}/libraries/${encodeURIComponent(slug)}`));
}
export async function analyzeLibrary(source: string): Promise<string> {
  const data = await jsonOrThrow<{ jobId: string }>(await fetch(`${API_BASE}/libraries/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }),
  }));
  return data.jobId;
}

// ---- Prototypes ----
export async function createPrototype(input: { name: string; slug: string; prompt: string; refine?: string; }): Promise<string> {
  const data = await jsonOrThrow<{ jobId: string }>(await fetch(`${API_BASE}/prototypes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  return data.jobId;
}
export async function listPrototypes(): Promise<PrototypeSummary[]> {
  const data = await jsonOrThrow<{ prototypes: PrototypeSummary[] }>(await fetch(`${API_BASE}/prototypes`));
  return data.prototypes;
}
export async function getPrototype(id: string): Promise<PrototypeDetail> {
  return jsonOrThrow<PrototypeDetail>(await fetch(`${API_BASE}/prototypes/${encodeURIComponent(id)}`));
}
export async function getVersionCode(id: string, version: number): Promise<string> {
  const res = await fetch(`${API_BASE}/prototypes/${encodeURIComponent(id)}/versions/${version}/code`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}
export function screenshotUrl(id: string, version: number): string {
  return `${API_BASE}/prototypes/${encodeURIComponent(id)}/versions/${version}/screenshot`;
}

// ---- Jobs ----
export async function getJob<R = unknown>(id: string): Promise<Job<R>> {
  return jsonOrThrow<Job<R>>(await fetch(`${API_BASE}/jobs/${encodeURIComponent(id)}`));
}
export function jobEventsUrl(id: string): string {
  return `${API_BASE}/jobs/${encodeURIComponent(id)}/events`;
}
```

---

## `src/useJobStream.ts` — SSE progress hook (present — verbatim)

Subscribes to a job's SSE stream, returns the latest `Job` snapshot + connection flags. Treats the
named `end` event as a clean close (not an error).

```ts
import { useEffect, useRef, useState } from 'react';
import { jobEventsUrl, type Job } from './api';

export interface JobStreamState<R = unknown> {
  job: Job<R> | null;
  connected: boolean;
  streamError: string | null;
}

export function useJobStream<R = unknown>(jobId: string | null): JobStreamState<R> {
  const [job, setJob] = useState<Job<R> | null>(null);
  const [connected, setConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setJob(null); setStreamError(null); setConnected(false);
    if (!jobId) return;

    const es = new EventSource(jobEventsUrl(jobId));
    sourceRef.current = es;
    let ended = false;

    es.onopen = () => setConnected(true);
    es.onmessage = (ev) => {
      if (!ev.data) return;
      try {
        const parsed = JSON.parse(ev.data) as Job<R>;
        if (parsed && typeof parsed === 'object' && 'id' in parsed) setJob(parsed);
      } catch {}
    };
    es.addEventListener('end', () => { ended = true; setConnected(false); es.close(); });
    es.onerror = () => {
      if (ended) return;                 // normal close after `end` also fires onerror
      setConnected(false);
      setStreamError('Lost connection to job stream.');
      es.close();
    };
    return () => { es.close(); sourceRef.current = null; };
  }, [jobId]);

  return { job, connected, streamError };
}
```

---

## Shared components (present — verbatim summaries)

- **`components/JobProgress.tsx`** — `{ job, connected, streamError }`. Renders a status badge,
  an ordered `<ol>` of steps with icons (`pending ○`, `running ◐`, `done ●`, `error ✕`), and a
  `<pre>` log tail (auto-scrolled to bottom). Shows "Starting job…" when `job` is null.
- **`components/CodeViewer.tsx`** — `{ code, filename? }`. Read-only `<pre><code>` block with a
  copy-to-clipboard button (toggles "Copied!" for 1.5 s).
- **`components/Chips.tsx`** — exports `Chips({ items })` (chip list, "none" when empty),
  `Gaps({ gaps })` (per-gap row: covered vs. not-covered + fallback), and
  `UnknownImports({ imports })` (error line listing imports not in the profile).
- **`components/Libraries.tsx`** — `{ libraries, selectedSlug, onSelect, onAnalyzed }`. Renders a
  card grid of analyzed libraries (name, version, componentCount, installSpec, selected state) and
  an "Add a library" form. On submit it calls `analyzeLibrary(source)`, gets a `jobId`, watches it
  via `useJobStream<AnalyzeResult>`, renders `<JobProgress/>`, and calls `onAnalyzed(result.slug)`
  when the job finishes `done`. Placeholder shows the four accepted source forms.

---

## `src/main.tsx` — entry **[target spec]**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';            // optional stylesheet; see class names used by the components

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

## `src/App.tsx` — shell + tabs **[target spec]**

Top-level state and routing between the three tabs. Behavior:

- On mount, fetch `listLibraries()` and `listPrototypes()`.
- Hold `selectedSlug: string | null` (the library to generate against) and an active-tab state
  (`'libraries' | 'generate' | 'history'`).
- Render a tab bar + the active panel:
  - **Libraries** → `<Libraries libraries selectedSlug onSelect={setSelectedSlug}
    onAnalyzed={(slug) => { refetchLibraries(); setSelectedSlug(slug); }} />`.
  - **Generate** → `<Generate selectedSlug libraries onGenerated={refetchPrototypes} />`.
  - **History** → `<History prototypes onRefresh={refetchPrototypes} />`.
- Provide a `refetchLibraries` / `refetchPrototypes` that re-call the list endpoints (called after
  an analyze/generate job finishes so the UI updates without a manual reload).

## `src/components/Generate.tsx` — prompt → code + screenshot **[target spec]**

Props: `{ selectedSlug: string | null; libraries: LibrarySummary[]; onGenerated: () => void }`.

Behavior:
1. Require a selected library; if none, prompt the user to pick one on the Libraries tab.
2. Form fields: **name** (text), **prompt** (textarea), optional **refine** (text — only meaningful
   when re-generating an existing prototype name).
3. On submit: `const jobId = await createPrototype({ name, slug: selectedSlug, prompt, refine })`.
   Set `jobId`; watch it with `useJobStream<GenerateResult>(jobId)`. Render `<JobProgress/>`.
4. While running, disable the submit button ("Generating…").
5. When the job finishes `done`, read `job.result` (a `GenerateResult`) and render the two
   deliverables:
   - **Screenshot:** `<img src={screenshotUrl(result.id, result.version)} />`.
   - **Code:** fetch `getVersionCode(result.id, result.version)` and show in `<CodeViewer
     filename={`${result.id}.tsx`} />`.
   - **Chosen components** via `<Chips items={result.chosenComponents} />`, **gaps** via
     `<Gaps gaps={result.gaps} />`, **unknown imports** via
     `<UnknownImports imports={result.unknownImports} />`.
   - Call `onGenerated()` once (guard with a "handled job id" like `Libraries.tsx` does) so History
     refreshes.
6. Surface `job.error` / `streamError` inline.

## `src/components/History.tsx` — prototypes + versions **[target spec]**

Props: `{ prototypes: PrototypeSummary[]; onRefresh: () => void }`.

Behavior:
1. List prototypes (name, library, currentVersion, updated). Clicking one fetches
   `getPrototype(id)` → `PrototypeDetail`.
2. Show each version (newest first): `requirement`, `chosenComponents` (`<Chips/>`), `gaps`
   (`<Gaps/>`), `unknownImports` (`<UnknownImports/>`), the screenshot
   (`screenshotUrl(id, version)`, shown only when `hasScreenshot`), and a "View code" action that
   calls `getVersionCode(id, version)` into `<CodeViewer/>`.
3. A refresh button calls `onRefresh()`.

---

## Styling note

The shipped components use semantic class names (`panel`, `card-grid`, `lib-card`,
`lib-card--selected`, `job-progress`, `steps`, `step--<status>`, `badge--<status>`, `log`,
`code-viewer`, `chips`, `chip`, `gaps`, `gap--ok|warn`, `error`, `muted`, `btn`, `btn--ghost`,
`btn--sm`, `row`). Provide a `styles.css` implementing these (or a CSS framework) — none ships yet,
so this is **[target spec]**; the exact look is unspecified, only the class hooks are fixed.

---

## Frontend flow (end to end)

```
Libraries tab:  type "antd@5" -> POST /api/libraries/analyze -> jobId
                useJobStream watches SSE -> steps resolve→analyze→reference -> done
                -> refetch /api/libraries, auto-select the new slug
Generate tab:   name + prompt -> POST /api/prototypes -> jobId
                useJobStream -> steps analyze→select→generate→render -> done (GenerateResult)
                -> show screenshot (GET .../screenshot) + code (GET .../code) + chips/gaps
History tab:    GET /api/prototypes -> list; GET /api/prototypes/:id -> versions + artifacts
```

Next: [`07-runbook.md`](./07-runbook.md) to install and run all three projects.
