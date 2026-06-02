# 05 — The Express Backend (`server/`)

A thin orchestrator. It **does not import the pipeline modules** — it shells out to the two
ts-node CLIs (`analyze-cli.ts`, `run-flow.ts`) inside `../prototyping-system`, models each run as a
**job with ordered steps streamed over SSE**, and serves the on-disk shelved artifacts as JSON /
markdown / png. Reproduced in full so it can be re-typed.

---

## Project files

`server/package.json`:

```json
{
  "name": "prototyping-server",
  "version": "1.0.0",
  "private": true,
  "description": "Express API that orchestrates the AI prototyping pipeline (analyze a library -> generate a prototype -> render + shelve).",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "start": "ts-node src/index.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.0"
  }
}
```

`server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## `config.ts` — paths + port

```ts
import * as path from 'path';

export const PORT = Number(process.env.PORT || 4000);

// server/ -> repo root -> prototyping-system
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const PROTO_ROOT = path.join(REPO_ROOT, 'prototyping-system');

export const DOC_READER_DIR = path.join(PROTO_ROOT, 'doc-reader');
export const LIBRARY_REFS_DIR = path.join(PROTO_ROOT, 'library-refs');
export const PROTOTYPES_DIR = path.join(PROTO_ROOT, 'prototypes');

// The pipeline CLIs we invoke (relative to PROTO_ROOT).
export const ANALYZE_CLI = path.join('src', 'ai', 'analyze-cli.ts');
export const RUN_FLOW_CLI = path.join('src', 'ai', 'run-flow.ts');
```

> `__dirname` is `server/dist` or `server/src` depending on run mode; `../..` resolves to the repo
> root either way when run via `ts-node src/index.ts` (`__dirname` = `server/src`, `../..` = repo
> root). Adjust if you compile to `dist/`.

---

## `jobs.ts` — in-memory job store + SSE fan-out

```ts
import { EventEmitter } from 'events';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type StepStatus = 'pending' | 'running' | 'done' | 'error';

export interface JobStep { name: string; status: StepStatus; }

export interface Job {
  id: string;
  type: 'analyze' | 'generate';
  status: JobStatus;
  steps: JobStep[];
  log: string[];
  result?: unknown;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let counter = 0;
function nextId(): string {
  counter += 1;
  return `job_${process.pid}_${counter}`; // monotonic, no Date.now()
}

export function createJob(type: Job['type'], stepNames: string[]): Job {
  const job: Job = {
    id: nextId(), type, status: 'queued',
    steps: stepNames.map((name) => ({ name, status: 'pending' })),
    log: [], createdAt: counter,
  };
  jobs.set(job.id, job);
  return job;
}
export function getJob(id: string): Job | undefined { return jobs.get(id); }

function publish(job: Job) { emitter.emit(job.id, job); }

export function setStep(job: Job, name: string, status: StepStatus) {
  const step = job.steps.find((s) => s.name === name);
  if (step) step.status = status;
  publish(job);
}
export function appendLog(job: Job, line: string) {
  job.log.push(line);
  if (job.log.length > 500) job.log.shift();
  publish(job);
}
export function setStatus(job: Job, status: JobStatus) { job.status = status; publish(job); }

export function finishJob(job: Job, result: unknown) {
  job.status = 'done'; job.result = result;
  job.steps.forEach((s) => { if (s.status === 'running' || s.status === 'pending') s.status = 'done'; });
  publish(job);
}
export function failJob(job: Job, error: string) {
  job.status = 'error'; job.error = error;
  const running = job.steps.find((s) => s.status === 'running');
  if (running) running.status = 'error';
  publish(job);
}

/** Subscribe to a job's updates. Returns an unsubscribe fn. */
export function subscribe(id: string, fn: (job: Job) => void): () => void {
  emitter.on(id, fn);
  return () => emitter.off(id, fn);
}
```

**The `Job` shape is the API contract** for `GET /api/jobs/:id` and the SSE frames. Every mutation
(`setStep`, `appendLog`, `setStatus`, `finishJob`, `failJob`) republishes the whole job so SSE
subscribers always get the complete current state.

---

## `pipeline.ts` — spawn the CLIs, map output → job steps

```ts
import { spawn } from 'child_process';
import { PROTO_ROOT, ANALYZE_CLI, RUN_FLOW_CLI } from './config';
import { Job, appendLog, setStep, setStatus, finishJob, failJob } from './jobs';

interface SpawnResult { stdout: string; code: number; }

function runCli(
  job: Job, cli: string, args: string[],
  onLine: (line: string, stream: 'out' | 'err') => void
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    // IMPORTANT: spawn `node -r ts-node/register <cli>` with shell:FALSE.
    // shell:false makes Node pass argv verbatim, so args with spaces (--name "Support Dashboard",
    // --prompt "...") survive intact. Using spawn('npx', [...], { shell:true }) on Windows does NOT
    // quote args and the shell re-splits them, corrupting --name/--prompt parsing. ts-node/register
    // resolves from cwd (PROTO_ROOT/node_modules), so npx.cmd is never needed.
    const child = spawn(process.execPath, ['-r', 'ts-node/register', cli, ...args], {
      cwd: PROTO_ROOT,
      shell: false,
      env: process.env,
    });
    let stdout = '', outBuf = '', errBuf = '';
    const pump = (chunk: string, which: 'out' | 'err', buf: string): string => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (line.trim()) { appendLog(job, line); onLine(line, which); }
      }
      return buf;
    };
    child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; outBuf = pump(s, 'out', outBuf); });
    child.stderr.on('data', (d) => { errBuf = pump(d.toString(), 'err', errBuf); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

/**
 * Extract the FIRST balanced JSON object/array from text, respecting string literals so a `{` that
 * appears INSIDE a string value does not throw off the depth count. Mirrors `schema.ts :: extractJson`
 * in the pipeline package. Returns null if none found.
 */
function extractBalancedJson(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

/** Parse the trailing JSON on stdout (run-flow uses __RESULT__; analyze-cli prints a bare object). */
function parseTrailingJson(stdout: string): any {
  const sentinel = stdout.lastIndexOf('__RESULT__');
  if (sentinel >= 0) {
    const tail = stdout.slice(sentinel + '__RESULT__'.length).trim();
    try { return JSON.parse(tail); } catch { /* fall through */ }
  }
  // Bare object (analyze-cli): take the FIRST balanced {...}. Do NOT use lastIndexOf('{') — a
  // string VALUE in the summary can contain a literal `{` (e.g. limitations[] describing an
  // `import { X } from '...'` example), which is not the object start and makes JSON.parse fail,
  // silently breaking the web analyze flow ("analyze exited with code 0").
  const balanced = extractBalancedJson(stdout);
  if (balanced) {
    try { return JSON.parse(balanced); } catch { /* fall through */ }
  }
  return null;
}

export async function runAnalyze(job: Job, source: string): Promise<void> {
  setStatus(job, 'running');
  setStep(job, 'resolve', 'running');
  try {
    const { stdout, code } = await runCli(job, ANALYZE_CLI, ['--source', source], (line) => {
      if (line.includes('resolving source')) setStep(job, 'resolve', 'running');
      if (/\[analyze\]\s+(local|npm|git)\s+->/.test(line)) { setStep(job, 'resolve', 'done'); setStep(job, 'analyze', 'running'); }
      if (line.includes('analyzing (AI hook)') || line.includes('reusing shelved profile')) { setStep(job, 'resolve', 'done'); setStep(job, 'analyze', 'running'); }
      if (line.includes('wrote') && line.includes('REFERENCE.md')) { setStep(job, 'analyze', 'done'); setStep(job, 'reference', 'running'); }
    });
    const result = parseTrailingJson(stdout);
    if (code !== 0 || !result || result.ok === false) {
      throw new Error((result && result.error) || `analyze exited with code ${code}`);
    }
    setStep(job, 'reference', 'done');
    finishJob(job, result);
  } catch (e: any) { failJob(job, e.message || String(e)); }
}

export interface GenerateInput {
  name: string; prompt: string; libraryDir: string;
  installSpec: string | null; profilePath: string; refine?: string;
}

export async function runGenerate(job: Job, input: GenerateInput): Promise<void> {
  setStatus(job, 'running');
  const args = ['--library', input.libraryDir, '--profile', input.profilePath, '--name', input.name, '--prompt', input.prompt];
  if (input.installSpec) args.push('--install', input.installSpec);
  if (input.refine) args.push('--refine', input.refine);

  setStep(job, 'analyze', 'running');
  try {
    const { stdout, code } = await runCli(job, RUN_FLOW_CLI, args, (line) => {
      if (line.includes('[1/4]')) { setStep(job, 'analyze', 'running'); }
      if (line.includes('[2/4]')) { setStep(job, 'analyze', 'done'); setStep(job, 'select', 'running'); }
      if (line.includes('[3/4]')) { setStep(job, 'select', 'done'); setStep(job, 'generate', 'running'); }
      if (line.includes('[4/4]')) { setStep(job, 'generate', 'done'); setStep(job, 'render', 'running'); }
    });
    const result = parseTrailingJson(stdout);
    if (code !== 0 || !result || result.ok === false) {
      throw new Error((result && result.error) || `generation exited with code ${code}`);
    }
    setStep(job, 'render', 'done');
    finishJob(job, result);
  } catch (e: any) { failJob(job, e.message || String(e)); }
}
```

**Step mapping:**
- `analyze` jobs have steps `['resolve','analyze','reference']`, advanced off the analyze-cli's
  stderr log lines (`resolving source`, `[analyze] <kind> ->`, `analyzing (AI hook)` / `reusing
  shelved profile`, `wrote ... REFERENCE.md`).
- `generate` jobs have steps `['analyze','select','generate','render']`, advanced off run-flow's
  stdout `[1/4]…[4/4]` markers.
- `spawn(process.execPath, ['-r','ts-node/register', cli, ...args], { cwd: PROTO_ROOT, shell: false })`
  — **shell:false is mandatory** so argv passes verbatim (spaced `--name`/`--prompt` survive). The
  result is parsed from `__RESULT__<json>` (run-flow) or the FIRST balanced `{...}` (analyze-cli;
  must be balance-aware, not `lastIndexOf('{')` — a string value can contain a literal `{`).

---

## `store.ts` — read shelved artifacts → API shapes

Reads `library-refs/{slug}/{REFERENCE.md, source.json}`, `doc-reader/{slug}/profile.json`, and
`prototypes/{id}/{metadata.json, REFERENTIAL_DOC.json, vN/...}`. Every reader swallows errors and
returns `null`/`[]` so missing artifacts never crash the API. **Reproduce verbatim:**

```ts
/**
 * Read-side: turns the on-disk shelved artifacts into API responses.
 *   - library-refs/{slug}/{REFERENCE.md, source.json}  -> analyzed libraries
 *   - doc-reader/{slug}/profile.json                    -> structured profile (component list)
 *   - prototypes/{id}/{metadata.json, vN/...}           -> prototypes + versions
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { LIBRARY_REFS_DIR, DOC_READER_DIR, PROTOTYPES_DIR } from './config';

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function listDirs(p: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export interface LibrarySource {
  source: string;
  kind: string;
  dir: string;
  installSpec: string | null;
  name: string;
  slug: string;
  version: string;
  profilePath: string; // RELATIVE to PROTO_ROOT (e.g. "doc-reader/antd/profile.json")
}

export async function listLibraries() {
  const slugs = await listDirs(LIBRARY_REFS_DIR);
  const out = [];
  for (const slug of slugs) {
    const src = await readJson<LibrarySource>(path.join(LIBRARY_REFS_DIR, slug, 'source.json'));
    const profile = await readJson<any>(path.join(DOC_READER_DIR, slug, 'profile.json'));
    const hasReference = await fs
      .access(path.join(LIBRARY_REFS_DIR, slug, 'REFERENCE.md'))
      .then(() => true)
      .catch(() => false);
    out.push({
      slug,
      name: src?.name || profile?.library?.name || slug,
      version: src?.version || profile?.library?.version || '0.0.0',
      installSpec: src?.installSpec ?? null,
      componentCount: profile?.components?.length ?? 0,
      components: (profile?.components || []).map((c: any) => c.name),
      hasReference,
    });
  }
  return out;
}

export async function getLibrarySource(slug: string): Promise<LibrarySource | null> {
  return readJson<LibrarySource>(path.join(LIBRARY_REFS_DIR, slug, 'source.json'));
}

export async function getLibraryReference(slug: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(LIBRARY_REFS_DIR, slug, 'REFERENCE.md'), 'utf-8');
  } catch {
    return null;
  }
}

export async function getLibraryDetail(slug: string) {
  const profile = await readJson<any>(path.join(DOC_READER_DIR, slug, 'profile.json'));
  const reference = await getLibraryReference(slug);
  const src = await getLibrarySource(slug);
  if (!profile && !reference) return null;
  return {
    slug,
    name: src?.name || profile?.library?.name || slug,
    version: src?.version || profile?.library?.version || '0.0.0',
    installSpec: src?.installSpec ?? null,
    componentCount: profile?.components?.length ?? 0,
    components: (profile?.components || []).map((c: any) => ({
      name: c.name,
      category: c.category,
      description: c.description,
    })),
    limitations: profile?.limitations || [],
    reference,
  };
}

export async function listPrototypes() {
  const ids = await listDirs(PROTOTYPES_DIR);
  const out = [];
  for (const id of ids) {
    const meta = await readJson<any>(path.join(PROTOTYPES_DIR, id, 'metadata.json'));
    if (!meta) continue; // skip dirs without metadata.json (no placeholder entry)
    out.push({
      id,
      name: meta.name,
      library: meta.library,
      currentVersion: meta.currentVersion,
      description: meta.description,
      updated: meta.updated,
    });
  }
  return out;
}

export async function getPrototype(id: string) {
  const meta = await readJson<any>(path.join(PROTOTYPES_DIR, id, 'metadata.json'));
  if (!meta) return null;
  const refDoc = await readJson<any>(path.join(PROTOTYPES_DIR, id, 'REFERENTIAL_DOC.json'));
  const versions = [];
  for (const v of meta.versions || []) {
    const vDir = path.join(PROTOTYPES_DIR, id, `v${v.version}`);
    const result = await readJson<any>(path.join(vDir, 'result.json'));
    const hasScreenshot = await fs
      .access(path.join(vDir, 'screenshot.png'))
      .then(() => true)
      .catch(() => false);
    versions.push({
      version: v.version,
      requirement: v.requirement,
      hasScreenshot,
      chosenComponents: result?.chosenComponents || [],
      gaps: result?.gaps || [],
      unknownImports: result?.unknownImports || [],
    });
  }
  return { ...meta, referentialDoc: refDoc, versions };
}

export async function getVersionCode(id: string, version: number): Promise<string | null> {
  const p = path.join(PROTOTYPES_DIR, id, `v${version}`, `${id}.tsx`);
  try {
    return await fs.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

export function versionScreenshotPath(id: string, version: number): string {
  return path.join(PROTOTYPES_DIR, id, `v${version}`, 'screenshot.png');
}
```

Notes that must be preserved:
- **`profilePath` stays RELATIVE.** `source.json` shelves it as `path.relative(root, profilePath)`
  (see [`03-library-reference.md`](./03-library-reference.md)). `runGenerate` passes it straight to
  `--profile`, and because the child runs with `cwd: PROTO_ROOT`, run-flow resolves it via
  `path.resolve(args.profile)` against that cwd. Do **not** pre-resolve it in `store.ts`.
- **`getPrototype` spreads `metadata.json`.** Its fields are `{ id, name, library, description,
  currentVersion, versions: [{version, requirement}], created, updated }` (full shape in
  [`04-rendering-and-shelving.md`](./04-rendering-and-shelving.md)). The returned object overrides
  `versions` with the joined per-version objects and adds `referentialDoc` (parsed
  `REFERENTIAL_DOC.json`).
- **Component `category`/`description`** come from each `profile.json` component
  (`ProfiledComponent` in [`02-ai-pipeline.md`](./02-ai-pipeline.md)); `description` may be `''`.
- Name/version fall back through `src?. → profile?. → slug / '0.0.0'` so partial artifacts still render.

---

## `index.ts` — routes + SSE

```ts
import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import { PORT } from './config';
import { createJob, getJob, subscribe } from './jobs';
import { runAnalyze, runGenerate } from './pipeline';
import {
  listLibraries, getLibraryDetail, getLibraryReference, getLibrarySource,
  listPrototypes, getPrototype, getVersionCode, versionScreenshotPath,
} from './store';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const asyncH =
  (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) =>
    fn(req, res).catch((e) => res.status(500).json({ error: e.message || String(e) }));

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Libraries
app.get('/api/libraries', asyncH(async (_req, res) => { res.json({ libraries: await listLibraries() }); }));
app.get('/api/libraries/:slug', asyncH(async (req, res) => {
  const detail = await getLibraryDetail(req.params.slug);
  if (!detail) return res.status(404).json({ error: 'library not analyzed' });
  res.json(detail);
}));
app.get('/api/libraries/:slug/reference', asyncH(async (req, res) => {
  const md = await getLibraryReference(req.params.slug);
  if (md == null) return res.status(404).json({ error: 'no reference' });
  res.type('text/markdown').send(md);
}));
app.post('/api/libraries/analyze', asyncH(async (req, res) => {
  const source = (req.body?.source || '').toString().trim();
  if (!source) return res.status(400).json({ error: 'source is required' });
  const job = createJob('analyze', ['resolve', 'analyze', 'reference']);
  void runAnalyze(job, source);            // fire-and-forget; client watches the job
  res.status(202).json({ jobId: job.id });
}));

// Prototypes
app.post('/api/prototypes', asyncH(async (req, res) => {
  const { name, slug, prompt, refine } = req.body || {};
  if (!name || !slug || !prompt) return res.status(400).json({ error: 'name, slug and prompt are required' });
  const src = await getLibrarySource(slug);
  if (!src) return res.status(404).json({ error: `library "${slug}" not analyzed yet` });
  const job = createJob('generate', ['analyze', 'select', 'generate', 'render']);
  void runGenerate(job, {
    name, prompt, libraryDir: src.dir, installSpec: src.installSpec,
    profilePath: src.profilePath, refine: refine || undefined,
  });
  res.status(202).json({ jobId: job.id });
}));
app.get('/api/prototypes', asyncH(async (_req, res) => { res.json({ prototypes: await listPrototypes() }); }));
app.get('/api/prototypes/:id', asyncH(async (req, res) => {
  const proto = await getPrototype(req.params.id);
  if (!proto) return res.status(404).json({ error: 'not found' });
  res.json(proto);
}));
app.get('/api/prototypes/:id/versions/:version/code', asyncH(async (req, res) => {
  const code = await getVersionCode(req.params.id, Number(req.params.version));
  if (code == null) return res.status(404).json({ error: 'no code' });
  res.type('text/plain').send(code);
}));
app.get('/api/prototypes/:id/versions/:version/screenshot', (req, res) => {
  const p = versionScreenshotPath(req.params.id, Number(req.params.version));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'no screenshot' });
  res.type('image/png').sendFile(p);
});

// Jobs
app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'no such job' });
  res.json(job);
});

// SSE progress stream
app.get('/api/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'no such job' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
  const send = (j: typeof job) => {
    res.write(`data: ${JSON.stringify(j)}\n\n`);
    if (j.status === 'done' || j.status === 'error') {
      res.write('event: end\ndata: {}\n\n');
      res.end();
    }
  };
  send(job);                                 // initial state
  if (job.status === 'done' || job.status === 'error') return;
  const unsub = subscribe(job.id, send);
  req.on('close', unsub);
});

app.listen(PORT, () => console.log(`[server] prototyping API listening on http://localhost:${PORT}`));
```

**SSE protocol:** every job update is sent as `data: <Job JSON>\n\n`. When the job reaches `done`
or `error`, the server sends one more `data:` frame then an `event: end\ndata: {}\n\n` and closes.
The frontend `useJobStream` treats the `end` event as a clean close (not an error).

---

## API contract (authoritative — reproduce verbatim)

Base path: `/api`.

```
GET  /api/libraries
  -> { libraries: [{ slug, name, version, installSpec, componentCount, components: string[], hasReference }] }

GET  /api/libraries/:slug
  -> { slug, name, version, installSpec, componentCount,
       components: [{ name, category, description }], limitations: [], reference: "<md>" }

GET  /api/libraries/:slug/reference
  -> text/markdown   (REFERENCE.md)

POST /api/libraries/analyze   body: { source }
  -> 202 { jobId }            (source = npm spec | git url | owner/repo | local path)

POST /api/prototypes          body: { name, slug, prompt, refine? }
  -> 202 { jobId }

GET  /api/prototypes
  -> { prototypes: [{ id, name, library, currentVersion, description, updated }] }

GET  /api/prototypes/:id
  -> { ...metadata, versions: [{ version, requirement, hasScreenshot,
                                 chosenComponents, gaps, unknownImports }] }

GET  /api/prototypes/:id/versions/:version/code
  -> text/plain

GET  /api/prototypes/:id/versions/:version/screenshot
  -> image/png

GET  /api/jobs/:id            -> Job
GET  /api/jobs/:id/events     -> SSE: data:<Job JSON> per update, event:end at finish.

GET  /api/health             -> { ok: true }

Job = {
  id, type:'analyze'|'generate', status:'queued'|'running'|'done'|'error',
  steps:[{ name, status }], log: string[], result?, error?
}
```

Next: [`06-frontend-react.md`](./06-frontend-react.md) — the web app that drives this contract.
