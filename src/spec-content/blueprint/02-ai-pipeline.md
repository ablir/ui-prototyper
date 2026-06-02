# 02 — The AI Pipeline (`prototyping-system/src/ai/`)

This is the heart of the system. Everything here is **library-agnostic**: no component names, no
colors, no library identities. The files are reproduced in full so they can be re-typed exactly.

Project: `prototyping-system/`. Key deps (`package.json`):

```json
{
  "name": "prototyping-system",
  "version": "1.0.0",
  "description": "Agentic AI-driven UI prototyping system",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "mcp": "node --loader ts-node/esm src/mcp-server.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.100.0",
    "@modelcontextprotocol/sdk": "^1.26.0",
    "@playwright/test": "^1.58.2",
    "@types/node": "^25.2.3",
    "playwright": "^1.58.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3",
    "zod": "^4.3.6"
  }
}
```

> Note: `zod@4` is used. The schemas below use `z.record(z.string(), z.string())` (the two-arg form
> zod 4 requires) and `.default(...)` extensively.

`prototyping-system/tsconfig.json` — **required**; `npx tsc --noEmit` (verification V0) and `ts-node`
both read it. Without it, `tsc` falls back to defaults (target ES3, no ES2022/DOM libs) and the modern
syntax in these files fails to compile. `render-harness/` is excluded so its JSX/React files aren't
pulled into the engine's type-check:

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
  "exclude": ["node_modules", "dist", "render-harness"]
}
```

---

## `paths.ts` — ESM/CJS-safe root resolver

Both `run-flow.ts` (CommonJS via `ts-node`) and `mcp-server.ts` (ESM via `ts-node/esm`) import
this. In CJS, `__dirname` is defined; in ESM it is not, so we fall back to `process.cwd()`.

```ts
import * as path from 'path';

export function projectRoot(): string {
  // `typeof __dirname` is "undefined" (no throw) when running as ESM.
  if (typeof __dirname !== 'undefined') {
    return path.join(__dirname, '..', '..');
  }
  return process.cwd();
}
```

`__dirname` for this file is `<root>/src/ai`, so `../..` → `prototyping-system/`. All runtime
artifact folders (`ai-cache/`, `doc-reader/`, `library-refs/`, `prototypes/`, `.lib-cache/`) hang
off this root.

---

## `schema.ts` — the zod contracts (single source of truth)

```ts
import { z } from 'zod';

// ---- Hook 1 output — LibraryProfile (prompts/01-library-analysis.md) ----

export const ComponentPropSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  default: z.string().nullable().optional(),
  description: z.string().optional().default(''),
});

export const ProfiledComponentSchema = z.object({
  name: z.string(),
  category: z
    .enum(['layout', 'input', 'data-display', 'feedback', 'navigation', 'chart', 'other'])
    .default('other'),
  description: z.string().default(''),
  importExample: z.string(),
  props: z.array(ComponentPropSchema).default([]),
  variants: z.array(z.string()).default([]),
  composesWith: z.array(z.string()).default([]),
  usageExample: z.string().default(''),
  capabilities: z.array(z.string()).default([]),
});

export const LibraryProfileSchema = z.object({
  library: z.object({
    name: z.string(),
    version: z.string(),
    importPath: z.string(),
    styleImport: z.string().nullable().default(null),
    themeTokens: z
      .object({
        colors: z.record(z.string(), z.string()).default({}),
        spacing: z.string().nullable().default(null),
        notes: z.string().default(''),
      })
      .default({ colors: {}, spacing: null, notes: '' }),
  }),
  components: z.array(ProfiledComponentSchema).default([]),
  globalWrappers: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

export type LibraryProfile = z.infer<typeof LibraryProfileSchema>;
export type ProfiledComponent = z.infer<typeof ProfiledComponentSchema>;

// ---- Hook 2 output — ComponentPlan (prompts/02-component-selection.md) ----

// Safety net for live-model drift: coerce an array of bare strings into the object shape the
// schema expects, instead of hard-failing. Applied via z.preprocess to each object-array field.
const normalizeItems =
  (toObj: (s: string) => unknown) =>
  (v: unknown): unknown =>
    Array.isArray(v) ? v.map((it) => (typeof it === 'string' ? toObj(it) : it)) : v;

export const ComponentPlanSchema = z.object({
  // All string fields default to '' and object-arrays are normalized + defaulted so a slightly
  // off-spec live response still parses. gaps.libraryCanProvide defaults false (gaps are, by
  // definition, things the library can't do). dataShape.exampleValue is coerced (models send numbers).
  summary: z.string().default(''),
  chosenComponents: z
    .preprocess(
      normalizeItems((s) => ({ name: s })),
      z.array(
        z.object({
          name: z.string(),
          role: z.string().default(''),
          rationale: z.string().default(''),
          keyProps: z.array(z.string()).default([]),
        })
      )
    )
    .default([]),
  layout: z
    .preprocess(
      normalizeItems((s) => ({ region: s, uses: [] })),
      z.array(z.object({ region: z.string(), uses: z.array(z.string()).default([]) }))
    )
    .default([]),
  requiredWrappers: z.array(z.string()).default([]),
  gaps: z
    .preprocess(
      normalizeItems((s) => ({ need: s })),
      z.array(
        z.object({
          need: z.string().default(''),
          libraryCanProvide: z.boolean().default(false),
          fallback: z.string().default(''),
        })
      )
    )
    .default([]),
  dataShape: z
    .preprocess(
      normalizeItems((s) => ({ field: s })),
      z.array(
        z.object({
          field: z.string().default(''),
          type: z.string().default('string'),
          exampleValue: z.coerce.string().default(''),
        })
      )
    )
    .default([]),
});

export type ComponentPlan = z.infer<typeof ComponentPlanSchema>;

/** Validate model text/JSON against a schema; throws a readable error so hooks can re-ask. */
export function parseJsonAgainst<T>(schema: z.ZodType<T>, raw: string): T {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    // Some providers (notably the `claude` CLI) prepend a prose preamble
    // ("Based on the source...") despite the "JSON only" instruction. Recover by
    // extracting the outermost balanced JSON value from the text.
    const extracted = extractJson(raw);
    if (extracted == null) {
      throw new Error(`Model did not return valid JSON (no JSON object found in response)`);
    }
    try {
      json = JSON.parse(extracted);
    } catch (e) {
      throw new Error(`Model did not return valid JSON: ${(e as Error).message}`);
    }
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new Error(`Output failed schema validation:\n${result.error.toString()}`);
  }
  return result.data;
}

/** Strip ```json fences if a model wrapped its output despite instructions. */
export function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json|tsx|ts|jsx)?\s*\n([\s\S]*?)\n```$/);
  return fence ? fence[1] : trimmed;
}

/**
 * Extract the first balanced JSON object/array from a string that may be wrapped in prose or
 * code fences. String literals (and their escapes) are respected so a brace inside a string
 * doesn't throw off the depth count. Returns null if none. This is what makes the `claude` CLI
 * provider usable: it tends to prepend an explanation before the JSON despite instructions.
 */
export function extractJson(raw: string): string | null {
  const text = stripFences(raw);
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escaped = false;
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
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
```

> **Why `extractJson`:** the default provider (Tier 2, the `claude` CLI) frequently returns a prose
> preamble before the JSON ("Based on the source material, here is the profile…"). Without this
> recovery, every analyze/select on a non-trivial library fails with *"Model did not return valid
> JSON"*. `parseJsonAgainst` tries a strict parse first, then falls back to the balanced extractor.

---

## `provider.ts` — the swappable LLM layer (3 tiers)

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { projectRoot } from './paths';

export interface CompletionRequest {
  system: string;
  user: string;
  /** Stable, human-readable key used for shelf lookup and logging. */
  cacheKey: string;
  maxTokens?: number;
}

export interface AIProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<string>;
}

const CACHE_DIR = path.join(projectRoot(), 'ai-cache');

/** Tier 3: deterministic replay from ai-cache/<cacheKey>.txt. */
export class ShelfProvider implements AIProvider {
  readonly name = 'shelf';
  constructor(private cacheDir: string = CACHE_DIR) {}

  async complete(req: CompletionRequest): Promise<string> {
    const file = path.join(this.cacheDir, `${req.cacheKey}.txt`);
    try {
      return await fs.readFile(file, 'utf-8');
    } catch {
      throw new Error(
        `ShelfProvider: no cached response for "${req.cacheKey}".\n` +
          `Expected file: ${file}\n` +
          `Either set ANTHROPIC_API_KEY to run the hook live, or provide the cached response.`
      );
    }
  }
}

/** Tier 1: real Claude API. Active when ANTHROPIC_API_KEY is set. */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private model: string;

  constructor(model = process.env.CLAUDE_MODEL || 'claude-opus-4-8') {
    this.model = model;
  }

  async complete(req: CompletionRequest): Promise<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk'); // lazy
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(path.join(CACHE_DIR, `${req.cacheKey}.txt`), text, 'utf-8');
    } catch {
      /* non-fatal */
    }
    return text;
  }
}

/** Tier 2: shell out to the local `claude` CLI in non-interactive print mode. */
export class ClaudeCodeProvider implements AIProvider {
  readonly name = 'claude-code';
  constructor(private bin: string = process.env.CLAUDE_CLI || 'claude') {}

  static isAvailable(bin: string = process.env.CLAUDE_CLI || 'claude'): boolean {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
      return true;
    } catch {
      return false;
    }
  }

  async complete(req: CompletionRequest): Promise<string> {
    const prompt = `${req.system}\n\n---\n\n${req.user}`;
    // Prompt goes on STDIN, not argv: it includes the full library-profile JSON and can be tens of
    // KB — far past the Windows command-line length limit ("The command line is too long."). Only
    // the short flags go on argv. `claude -p` reads the prompt from stdin and prints the reply.
    const res = spawnSync(this.bin, ['-p', '--output-format', 'text'], {
      input: prompt,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32', // resolve claude.cmd on Windows
    });
    if (res.error) throw new Error(`claude CLI failed to start: ${res.error.message}`);
    if (res.status !== 0) {
      throw new Error(`claude CLI exited ${res.status}: ${(res.stderr || '').toString().slice(0, 800)}`);
    }
    const text = (res.stdout || '').toString().trim();
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(path.join(CACHE_DIR, `${req.cacheKey}.txt`), text, 'utf-8');
    } catch {
      /* non-fatal */
    }
    return text;
  }
}

/**
 * Priority order:
 *   1. ANTHROPIC_API_KEY set      -> AnthropicProvider
 *   2. else `claude` CLI on PATH  -> ClaudeCodeProvider
 *   3. else                       -> ShelfProvider
 */
export function getProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicProvider();
  if (ClaudeCodeProvider.isAvailable()) return new ClaudeCodeProvider();
  return new ShelfProvider();
}
```

**Key facts to preserve:**
- `shell: process.platform === 'win32'` (so `claude` / `claude.cmd` resolves on Windows).
- **The prompt MUST go via stdin (`spawnSync` `input:`), NOT argv.** Passing the full
  `system + "\n\n---\n\n" + user` (which embeds the profile JSON) as a command-line argument
  overflows the Windows command-line length limit and mangles quoting. `isAvailable()` may still use
  `execFileSync(bin, ['--version'])` since that argv is tiny.
- `--output-format text` keeps stdout clean for parsing; `maxBuffer: 64 * 1024 * 1024`.
- Every successful completion writes `ai-cache/<cacheKey>.txt` (best-effort).

---

## `source-gatherer.ts` — bounded input collector (no analysis)

Handles two library shapes and caps total chars fed to the model.

```ts
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GatheredSource {
  name: string;
  version: string;
  importPath: string;
  styleImport: string | null;
  componentSource: string;
  storiesAndExamples: string;
  readme: string;
}

const DEFAULT_BUDGET = 300_000; // chars of source fed to the model (large enough for ~100+ comps)

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}
async function readSafe(p: string): Promise<string> {
  return fs.readFile(p, 'utf-8').catch(() => '');
}

async function walk(dir: string, exts: string[], budget: { left: number }): Promise<string> {
  let out = '';
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return out; }
  for (const entry of entries) {
    if (budget.left <= 0) break;
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) {
      out += await walk(full, exts, budget);
    } else if (exts.some((e) => entry.endsWith(e))) {
      const content = await readSafe(full);
      const slice = content.slice(0, budget.left);
      budget.left -= slice.length;
      out += `\n// ===== FILE: ${full} =====\n${slice}\n`;
    }
  }
  return out;
}

export async function gatherSource(
  libraryPath: string,
  budgetChars = DEFAULT_BUDGET
): Promise<GatheredSource> {
  const pkgPath = path.join(libraryPath, 'package.json');
  const pkg = JSON.parse((await readSafe(pkgPath)) || '{}');
  const name: string = pkg.name || path.basename(libraryPath);
  const version: string = pkg.version || '0.0.0';

  // Style entrypoint heuristic: a "./styles"-ish export. Mantine v9 ships CSS at "./styles.css"
  // (NOT "./styles"), so check several keys, not just "./styles".
  let styleImport: string | null = null;
  if (pkg.exports && typeof pkg.exports === 'object') {
    const styleKey = ['./styles', './styles.css', './dist/styles.css', './style.css'].find(
      (k) => pkg.exports[k]
    );
    if (styleKey) styleImport = `${name}${styleKey.slice(1)}`; // "@mantine/core" + "/styles.css"
  }

  const readme = (await readSafe(path.join(libraryPath, 'README.md'))).slice(0, 8000) || '';
  const budget = { left: budgetChars };

  const srcComponents = path.join(libraryPath, 'src', 'components');
  const srcDir = path.join(libraryPath, 'src');
  let componentSource = '';
  let storiesAndExamples = '';

  if (await exists(srcComponents)) {
    // Mode 1a: src/components/*. If it's a per-component layout with many PascalCase subdirs/files
    // (e.g. Mantine: src/components/<Name>/<Name>.tsx), gather ONE capped file per component so a
    // large library fits the budget; otherwise read greedily (small libs like the RustUI fixture).
    // Without this, a greedy walk reads a few components' full source and the budget dies early —
    // Mantine gathered only ~13 of 109 components (Accordion..AppShell) before this fix.
    componentSource = (await hasComponentEntries(srcComponents))
      ? await gatherPerComponent(srcComponents, budget)
      : await walk(srcComponents, ['.tsx', '.ts'], budget);
    storiesAndExamples = await walk(
      srcDir,
      ['.stories.tsx', '.stories.ts', '.story.tsx', '.story.ts'], // Mantine uses .story.tsx (singular)
      { left: 40_000 }
    );
  } else if ((await exists(srcDir)) && (await hasComponentEntries(srcDir))) {
    // Mode 1b: per-component layout src/<Component>/<Component>.{d.ts,tsx,ts,js} (e.g. MUI:
    // packages/mui-material/src/Button/Button.d.ts). gatherPerComponent() reads ONE representative
    // file per component — .d.ts preferred (richest props) — capped at PER_FILE (~2200) chars each,
    // so many components fit the char budget instead of one giant file eating it all.
    componentSource = await gatherPerComponent(srcDir, budget);
    storiesAndExamples = await walk(srcDir, ['.stories.tsx', '.stories.ts'], { left: 30_000 });
  } else {
    // Mode 2: installed npm package — gather .d.ts type declarations.
    const typesEntry: string | undefined = pkg.types || pkg.typings;
    if (typesEntry) {
      componentSource += `\n// ===== TYPES ENTRY: ${typesEntry} =====\n`;
      componentSource += (await readSafe(path.join(libraryPath, typesEntry))).slice(0, 20_000);
    }
    for (const dir of ['es', 'lib', 'dist', 'types', '.']) {
      if (budget.left <= 0) break;
      const d = path.join(libraryPath, dir);
      if (await exists(d)) componentSource += await walk(d, ['.d.ts'], budget);
    }
  }

  return {
    name,
    version,
    importPath: name,
    styleImport,
    componentSource: componentSource || '(no source found)',
    storiesAndExamples: storiesAndExamples || '(no stories found)',
    readme: readme || '(no readme)',
  };
}
```

The two helpers `gatherSource` relies on (`PER_FILE = 2200`):

```ts
/** PascalCase base name (not a test/spec/stories file). */
function isComponentName(name: string): boolean {
  const base = name.replace(/\.(d\.ts|tsx|ts|jsx|js)$/, '');
  if (/\.(test|spec|stories|story)\./.test(name)) return false;
  return /^[A-Z][A-Za-z0-9]+$/.test(base);
}

/** True when ≥3 PascalCase component entries (folders/.tsx/.d.ts) sit DIRECTLY inside `dir`. */
async function hasComponentEntries(dir: string): Promise<boolean> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as any[]);
  let n = 0;
  for (const e of entries) {
    if (!isComponentName(e.name)) continue;
    if (e.isDirectory() || /\.(tsx|d\.ts)$/.test(e.name)) n++;
    if (n >= 3) return true;
  }
  return false;
}

/** Pick ONE representative file for a component: .d.ts (richest props) → impl → index. */
async function representativeFile(dir: string, name: string): Promise<string | null> {
  const full = path.join(dir, name);
  const stat = await fs.stat(full).catch(() => null);
  if (stat && stat.isFile()) return full;
  if (!stat || !stat.isDirectory()) return null;
  const candidates = [
    `${name}.d.ts`, `${name}.tsx`, `${name}.ts`, `${name}.jsx`, `${name}.js`,
    'index.d.ts', 'index.tsx', 'index.ts',
  ];
  for (const c of candidates) {
    const p = path.join(full, c);
    if (await exists(p)) return p;
  }
  return null;
}

/**
 * Read ONE representative file per component, name-sorted for deterministic truncation, each capped
 * at PER_FILE chars and headed `// ===== COMPONENT: <Name> (<file>) =====`. Shares the char budget
 * by reference so a 100+ component library fits DEFAULT_BUDGET instead of one giant file eating it.
 */
async function gatherPerComponent(dir: string, budget: { left: number }): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as any[]);
  const names = entries
    .filter((e) => isComponentName(e.name))
    .filter((e) => e.isDirectory() || /\.(tsx|d\.ts|ts|jsx|js)$/.test(e.name))
    .map((e) => e.name.replace(/\.(d\.ts|tsx|ts|jsx|js)$/, ''))
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe (Button/ and Button.tsx → one)
    .sort();

  let out = '';
  for (const name of names) {
    if (budget.left <= 0) break;
    const file = await representativeFile(dir, name);
    if (!file) continue;
    const slice = (await readSafe(file)).slice(0, PER_FILE).slice(0, budget.left);
    budget.left -= slice.length;
    out += `\n// ===== COMPONENT: ${name} (${file}) =====\n${slice}\n`;
  }
  return out;
}
```

**Behavior to preserve:** Three layouts. `hasComponentEntries(dir)` returns true when ≥3 PascalCase
folders/`.tsx`/`.d.ts` sit directly inside `dir` (skipping `.test/.spec/.stories`).
- **Mode 1a** — `src/components/`: if `hasComponentEntries(src/components)` (a per-component layout
  like Mantine `src/components/<Name>/<Name>.tsx`), use `gatherPerComponent` (one capped file each)
  so the whole catalogue fits; otherwise (a small flat fixture like RustUI) walk `.tsx/.ts` greedily.
  Stories: walk `.stories.*` **and** `.story.*` (Mantine uses the singular).
- **Mode 1b** — per-component `src/<Component>/` directly under `src/` (e.g. the MUI source repo):
  same `gatherPerComponent(srcDir, budget)`.
- **Mode 2** — installed npm package: read the `types`/`typings` entry then walk `.d.ts` under
  `es/lib/dist/types/.`.

`gatherPerComponent()` reads ONE representative file per component (`.d.ts` → impl → `index`),
**capped `PER_FILE = 2200` chars each**, name-sorted for deterministic truncation, each block headed
`// ===== COMPONENT: <Name> (<file>) =====`. With `DEFAULT_BUDGET = 300_000` this fits ~100+
components — e.g. Mantine `@mantine/core` profiles all **109** components (it captured only 13 when
`src/components` used the greedy walk). The char budget is shared by reference so it never overflows
the model context. `findLibraryRoot` (see [`03-library-reference.md`](./03-library-reference.md))
ensures a **scoped** monorepo (`packages/@scope/<pkg>`) resolves to the real component package first.

---

## Hook 1 — `library-analyzer.ts`

System prompt is verbatim from `prompts/01-library-analysis.md`.

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIProvider, getProvider } from './provider';
import { gatherSource } from './source-gatherer';
import { LibraryProfile, LibraryProfileSchema, parseJsonAgainst } from './schema';
import { projectRoot } from './paths';

const SYSTEM_PROMPT = `You are a React UI library analyst. You are given the raw source material of ONE React component library — component source files, TypeScript type declarations (.d.ts), Storybook stories, and README/docs. Your job is to produce a precise, structured profile of what this library offers, so that another AI can later build prototypes using ONLY this library.

Rules:
- Describe ONLY what is actually present in the provided material. Never invent components, props, or theme values. If something is unknown, omit it or mark it null.
- Be library-agnostic in your reasoning: do not assume any particular design system.
- Capture how components are MEANT to be composed (from stories/examples), not just their props.
- Prefer the public, exported API. Note required vs optional props and default values.
- Output ONLY a JSON object that conforms to the LibraryProfile schema. No prose, no markdown fences.`;

function buildUserPrompt(src: Awaited<ReturnType<typeof gatherSource>>): string {
  return `LIBRARY NAME: ${src.name}
LIBRARY VERSION: ${src.version}
IMPORT PATH: ${src.importPath}
STYLE ENTRYPOINT (if any): ${src.styleImport ?? 'none'}

Below is the library's source material. Analyze it and return a LibraryProfile JSON object.

=== COMPONENT SOURCE / TYPES ===
${src.componentSource}

=== STORIES / USAGE EXAMPLES ===
${src.storiesAndExamples}

=== README / DOCS ===
${src.readme}`;
}

export interface AnalyzeOptions {
  provider?: AIProvider;
  shelfDir?: string; // defaults to doc-reader/<slug>/
}

export async function analyzeLibrary(
  libraryPath: string,
  opts: AnalyzeOptions = {}
): Promise<{ profile: LibraryProfile; profilePath: string }> {
  const provider = opts.provider ?? getProvider();
  const src = await gatherSource(libraryPath);

  const cacheKey = `analyze__${slug(src.name)}`;
  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(src),
    cacheKey,
    maxTokens: 16000,
  });

  const profile = parseJsonAgainst(LibraryProfileSchema, raw);

  const shelfDir = opts.shelfDir ?? path.join(projectRoot(), 'doc-reader', slug(src.name));
  await fs.mkdir(shelfDir, { recursive: true });
  const profilePath = path.join(shelfDir, 'profile.json');
  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');

  return { profile, profilePath };
}

export async function loadProfile(profilePath: string): Promise<LibraryProfile> {
  const raw = await fs.readFile(profilePath, 'utf-8');
  return LibraryProfileSchema.parse(JSON.parse(raw));
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
```

- Cache key: `analyze__<slug>`. `maxTokens: 16000` (profiles are large).
- Shelves to `doc-reader/<slug>/profile.json`. `slug()` is exported and reused everywhere.

---

## Hook 2 — `component-selector.ts`

System prompt verbatim from `prompts/02-component-selection.md`.

```ts
import { AIProvider, getProvider } from './provider';
import { ComponentPlan, ComponentPlanSchema, LibraryProfile, parseJsonAgainst } from './schema';

const SYSTEM_PROMPT = `You are a UI architect. You are given (a) a structured profile of ONE React component library and (b) a product owner's plain-language request for a screen/prototype. Decide which of the library's components should be used to build the requested screen, and how they fit together.

Rules:
- You may ONLY choose components that exist in the provided profile. Never invent components.
- For each chosen component, give a short rationale tied to the request.
- Explicitly identify GAPS: parts of the request the library cannot satisfy with its components. Suggest the closest available fallback for each gap.
- Propose a high-level layout (top-to-bottom / regions) using only chosen components.
- Do NOT write implementation code here. Output a plan only.
- Output ONLY a JSON object conforming to the ComponentPlan schema. No prose, no markdown fences.

The JSON object MUST have EXACTLY this shape (every array element is an OBJECT, never a bare string):
{
  "summary": "string — one-line interpretation of the request",
  "chosenComponents": [ { "name": "string (must match a component in the profile)", "role": "string", "rationale": "string", "keyProps": ["string"] } ],
  "layout": [ { "region": "string", "uses": ["componentName"] } ],
  "requiredWrappers": ["string (from profile.globalWrappers)"],
  "gaps": [ { "need": "string", "libraryCanProvide": false, "fallback": "string" } ],
  "dataShape": [ { "field": "string", "type": "string", "exampleValue": "string" } ]
}`;

export interface SelectOptions {
  provider?: AIProvider;
  prototypeId: string;
  referentialDoc?: string;
}

export async function selectComponents(
  userPrompt: string,
  profile: LibraryProfile,
  opts: SelectOptions
): Promise<ComponentPlan> {
  const provider = opts.provider ?? getProvider();

  const user = `USER REQUEST:
${userPrompt}

AVAILABLE LIBRARY PROFILE (JSON):
${JSON.stringify(profile, null, 2)}

PRIOR LEARNINGS FOR THIS PROTOTYPE (if refining; else "none"):
${opts.referentialDoc ?? 'none'}

Return a ComponentPlan.`;

  const baseReq = { system: SYSTEM_PROMPT, user, cacheKey: `select__${opts.prototypeId}`, maxTokens: 4000 };
  const raw = await provider.complete(baseReq);
  try {
    return parseJsonAgainst(ComponentPlanSchema, raw);
  } catch (e) {
    // Live models occasionally drift from the schema. Re-ask ONCE with the validation error so the
    // model self-corrects, rather than failing the whole run.
    const retry = await provider.complete({
      ...baseReq,
      cacheKey: `select__${opts.prototypeId}__retry`,
      user: `${user}\n\nYour previous response FAILED ComponentPlan schema validation with:\n${(e as Error).message}\n\nReturn ONLY corrected JSON conforming EXACTLY to the schema. Every gap MUST include "need" (string), "libraryCanProvide" (boolean), and "fallback" (string). No prose, no fences.`,
    });
    return parseJsonAgainst(ComponentPlanSchema, retry);
  }
}
```

- Cache key: `select__<prototypeId>`. `maxTokens: 4000` (cheap — reads only the profile).
- `referentialDoc` is the prior `REFERENTIAL_DOC.json` (string) for refinements.

---

## Hook 3 — `ai-generator.ts` (+ import audit)

System prompt verbatim from `prompts/03-prototype-generation.md`.

```ts
import { AIProvider, getProvider } from './provider';
import { ComponentPlan, LibraryProfile, stripFences } from './schema';

const SYSTEM_PROMPT = `You are a senior React engineer generating a single-file, self-contained prototype screen. You are given: the target library's profile, a component plan (which components to use), and the original user request. Write production-quality React + TypeScript that renders the requested screen using ONLY the specified library.

Hard rules:
- Import components ONLY from the library's importPath given in the profile. Never import or hand-write substitute components. Never use a component not in the plan.
- If the library has a style entrypoint or required wrapper (e.g. ThemeProvider), include it.
- Use the library's own theme tokens/variants — do NOT hardcode arbitrary hex colors when the library exposes a theme. Inline styles are allowed only for layout (spacing/flex/grid).
- Generate realistic mock data that matches the request's DOMAIN and the plan's dataShape. Do NOT reuse generic banking/crypto data unless the request is about that domain.
- The file must be self-contained and compile: one default-exported component, all data inline.
- Keep it readable and idiomatic to the library's usage examples.

Output: ONLY the contents of the .tsx file. No commentary, no markdown code fences.`;

export interface GenerateOptions {
  provider?: AIProvider;
  prototypeId: string;
  componentName: string;
  version: number;
  previousCode?: string;
  refinementInstruction?: string;
}

export interface GenerateResult {
  code: string;
  /** Import-audit findings: library symbols used that are NOT in the profile. */
  unknownImports: string[];
}

export async function generatePrototype(
  userPrompt: string,
  profile: LibraryProfile,
  plan: ComponentPlan,
  opts: GenerateOptions
): Promise<GenerateResult> {
  const provider = opts.provider ?? getProvider();

  const user = `ORIGINAL USER REQUEST:
${userPrompt}

LIBRARY PROFILE (JSON):
${JSON.stringify(profile, null, 2)}

COMPONENT PLAN (JSON):
${JSON.stringify(plan, null, 2)}

PRIOR VERSION CODE (if refining; else "none"):
${opts.previousCode ?? 'none'}

REFINEMENT INSTRUCTION (if refining; else "none"):
${opts.refinementInstruction ?? 'none'}

Generate the complete .tsx file for component name: ${opts.componentName}`;

  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    user,
    cacheKey: `generate__${opts.prototypeId}__v${opts.version}`,
    maxTokens: 8000,
  });

  const code = stripFences(raw);
  const unknownImports = auditImports(code, profile);
  return { code, unknownImports };
}

/**
 * Import audit: collect symbols imported from the library's importPath and check each against
 * the profile's known component names + declared global wrappers. Returns the unknown ones.
 */
export function auditImports(code: string, profile: LibraryProfile): string[] {
  const importPath = profile.library.importPath;
  const known = new Set(profile.components.map((c) => c.name));
  profile.globalWrappers.forEach((w) => known.add(w));

  const unknown: string[] = [];
  // Match: import { A, B as C } from '<importPath>'
  const re = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escapeRegex(importPath)}['"]`,
    'g'
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    for (const part of m[1].split(',')) {
      const symbol = part.trim().split(/\s+as\s+/)[0].trim();
      if (symbol && !known.has(symbol)) unknown.push(symbol);
    }
  }
  return unknown;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- Cache key: `generate__<prototypeId>__v<N>`. `maxTokens: 8000`.
- **Import audit** is the only correctness gate in-code: it parses each
  `import { ... } from '<importPath>'`, splits on commas, strips `as` aliases, and flags any
  symbol not in `profile.components[].name ∪ profile.globalWrappers`. Unknown imports are reported
  (not auto-fixed) — `run-flow.ts` warns and records them in `result.json`/`REFERENTIAL_DOC.json`.
- The prompts' "compile check / re-ask" steps are documented in `prompts/03` as future work; the
  shipped code does the import audit and returns `unknownImports` rather than looping.

---

## The prompt files (`prompts/01–03`)

The three `SYSTEM_PROMPT` constants above are copied **verbatim** from these files; the user
templates in the hooks mirror the "User prompt (template)" sections. Recreate the prompt files as
the canonical spec — they also carry the schemas and implementer notes:

- **`prompts/01-library-analysis.md`** — Hook 1. System prompt + user template
  (`LIBRARY NAME / VERSION / IMPORT PATH / STYLE ENTRYPOINT`, then `=== COMPONENT SOURCE / TYPES ===`,
  `=== STORIES / USAGE EXAMPLES ===`, `=== README / DOCS ===`) + the `LibraryProfile` JSON schema.
  Notes: chunk large libraries per-component and merge `components[]`; validate before shelving;
  re-ask with the validation error on failure; ensure `capabilities[]` is populated (Hook 2 reasons
  over it).
- **`prompts/02-component-selection.md`** — Hook 2. System prompt + user template
  (`USER REQUEST`, `AVAILABLE LIBRARY PROFILE (JSON)`, `PRIOR LEARNINGS ...`) + the `ComponentPlan`
  schema. Notes: `gaps` is REQUIRED and surfaced in the UI; `dataShape` drives domain-appropriate
  mock data in Hook 3.
- **`prompts/03-prototype-generation.md`** — Hook 3. System prompt + user template (`ORIGINAL USER
  REQUEST`, `LIBRARY PROFILE`, `COMPONENT PLAN`, `PRIOR VERSION CODE`, `REFINEMENT INSTRUCTION`,
  `Generate the complete .tsx file for component name: ...`). Notes: post-gen checks (import audit,
  compile, plan adherence); refinement edits the prior file rather than regenerating.

---

## Library-agnostic invariant (enforce in review)

Grep the entire `src/ai/` tree for any literal component name, hex color, or library identity
(`Button`, `antd`, `#`, `rustui`, etc. — outside comments/examples). There must be **none** except
the word "ThemeProvider/ConfigProvider" appearing only inside *prompt text as an example*. The
analyzer, selector, and generator must derive everything from the runtime profile.

Next: [`03-library-reference.md`](./03-library-reference.md) for how the profile becomes the
shelved `REFERENCE.md`, and the source-resolution + analyze CLI.
