# 03 — The Per-Library Reference System

This is the "ui-library components directory where the analysis is stored for the AI's reference."
When the system receives a new library it (1) resolves the source to a local directory, (2) runs
Hook 1 to build a `LibraryProfile`, and (3) shelves **three** artifacts — including
`library-refs/{slug}/REFERENCE.md`, the self-contained Markdown a fresh AI context reads to build
prototypes with *only* that library.

Files: `ai/resolve-library.ts`, `ai/analyze-cli.ts`, `ai/profile-to-markdown.ts`.

---

## `resolve-library.ts` — source → local directory (+ install spec)

Accepts three source shapes and returns where to analyze plus the npm spec the renderer should
install.

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { projectRoot } from './paths';

export type SourceKind = 'local' | 'npm' | 'git';

export interface ResolvedLibrary {
  kind: SourceKind;
  dir: string;                  // directory containing the source/types to analyze
  installSpec: string | null;   // npm spec to install for rendering (e.g. "antd@5"), or null
  source: string;               // original input
}

function looksLikeGit(s: string): boolean {
  return (
    /^https?:\/\/.+\.git$/i.test(s) ||
    /^https?:\/\/(www\.)?github\.com\//i.test(s) ||
    /^git@/.test(s) ||
    /^[\w.-]+\/[\w.-]+$/.test(s)        // owner/repo shorthand (no scheme, no @version)
  );
}
function gitUrlFromShorthand(s: string): string {
  if (/^https?:\/\//i.test(s) || /^git@/.test(s)) return s.replace(/\.git$/i, '') + '.git';
  return `https://github.com/${s}.git`;
}
function repoName(url: string): string {
  const m = url.replace(/\.git$/i, '').match(/([^/:]+)$/);
  return (m ? m[1] : 'repo').replace(/[^\w.-]/g, '-');
}
async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}
async function readSafe(p: string): Promise<string> {
  return fs.readFile(p, 'utf-8').catch(() => '');
}

// Generic role keywords (NOT library-specific) used only to RANK monorepo packages: SUPPORT names
// are tooling/adjuncts (icons, codemods, utils, theming engines…); PRIMARY names are typical of the
// main component package. Without this, an alphabetical scan of a monorepo's packages/* picks the
// wrong one (e.g. mui/material-ui → packages/mui-codemod instead of packages/mui-material).
const SUPPORT_NAME =
  /(icons?|codemod|eslint|babel|jest|tests?|utils?|helpers?|types?|envinfo|downloads?|tracker|docs?|website|cli|scripts?|configs?|theming|styled-engine|stylis|private|internal|system|tokens?|plugins?|macros?|nextjs|rsc|pigment|waterfall|create-)/i;
const PRIMARY_NAME = /(material|components?|design|kit|core|\blab\b|joy|base|\bui\b|mantine|chakra|antd)/i;

/** Count PascalCase component entries (folders / .tsx / .jsx / .d.ts) directly in a dir. */
async function countComponentEntries(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as any[]);
  let n = 0;
  for (const e of entries) {
    const base = e.name.replace(/\.(d\.ts|tsx|ts|jsx|js)$/, '');
    if (!/^[A-Z][A-Za-z0-9]+$/.test(base) || /\.(test|spec|stories)\./.test(e.name)) continue;
    if (e.isDirectory() || /\.(tsx|jsx)$/.test(e.name) || /\.d\.ts$/.test(e.name)) n++;
  }
  return n;
}

/** Score a dir's likelihood of being THE component library (component count ± name role). */
async function scoreLibraryDir(dir: string): Promise<number> {
  let count = 0;
  if (await exists(path.join(dir, 'src', 'components'))) count = 1000 + (await countComponentEntries(path.join(dir, 'src', 'components')));
  else if (await exists(path.join(dir, 'src'))) count = await countComponentEntries(path.join(dir, 'src'));
  else return -1;
  if (count <= 0) return -1;
  const pkgName = (JSON.parse((await readSafe(path.join(dir, 'package.json'))) || '{}').name || '') + ' ' + path.basename(dir);
  let score = count;
  if (SUPPORT_NAME.test(pkgName)) score -= 1_000_000; // demote tooling (icons/codemod/utils…)
  if (PRIMARY_NAME.test(pkgName)) score += 100;       // nudge toward the main component package
  return score;
}

/**
 * Build an npm install spec so the renderer can install the real published library + runtime peers.
 * Keeps required peers; for OPTIONAL peers keeps third-party runtimes (@emotion/*) but drops the
 * vendor's own optional alt-engines (same scope, e.g. @mui/material-pigment-css). null if private.
 */
async function publishInstallSpec(dir: string): Promise<string | null> {
  const pkg = JSON.parse((await readSafe(path.join(dir, 'package.json'))) || '{}');
  if (!pkg.name || pkg.private) return null;
  const meta = pkg.peerDependenciesMeta || {};
  const scope = pkg.name.startsWith('@') ? pkg.name.split('/')[0] : '';
  const peers = Object.keys(pkg.peerDependencies || {}).filter((p) => {
    if (p === 'react' || p === 'react-dom' || p.startsWith('@types/')) return false;
    const optional = !!(meta[p] && meta[p].optional);
    if (optional && scope && p.startsWith(scope + '/')) return false;
    return true;
  });
  return [pkg.name, ...peers].join(' ');
}

/** Find the dir holding the library: scores repo root + every packages/* (and packages/@scope/*). */
async function findLibraryRoot(repoDir: string): Promise<string> {
  const candidates: string[] = [repoDir];
  const packages = path.join(repoDir, 'packages');
  if (await exists(packages)) {
    const entries = await fs.readdir(packages, { withFileTypes: true }).catch(() => [] as any[]);
    for (const e of entries) {
      const full = path.join(packages, e.name);
      candidates.push(full);
      // Scoped monorepos nest the real packages one level deeper: packages/@scope/<pkg>
      // (e.g. @mantine/core, @chakra-ui/react, @mui/material). Add those children too, or the
      // scope folder itself (no src/) wins nothing and analysis falls back to the repo root.
      if (e.isDirectory() && e.name.startsWith('@')) {
        for (const child of await fs.readdir(full).catch(() => [] as string[])) candidates.push(path.join(full, child));
      }
    }
  }
  let best = repoDir, bestScore = -Infinity;
  for (const c of candidates) { const s = await scoreLibraryDir(c); if (s > bestScore) { bestScore = s; best = c; } }
  return bestScore > 0 ? best : repoDir; // fall back to root; gatherSource then tries .d.ts scanning
}

export async function resolveLibrary(source: string): Promise<ResolvedLibrary> {
  const root = projectRoot();
  const trimmed = source.trim();

  // 1. Existing local directory.
  if (await exists(trimmed)) {
    return { kind: 'local', dir: path.resolve(trimmed), installSpec: null, source: trimmed };
  }

  // 2. Git repository (clone --depth 1 into .lib-cache/<repo>, or git pull if present).
  if (looksLikeGit(trimmed)) {
    const url = gitUrlFromShorthand(trimmed);
    const cacheDir = path.join(root, '.lib-cache');
    await fs.mkdir(cacheDir, { recursive: true });
    const dest = path.join(cacheDir, repoName(url));
    if (await exists(dest)) {
      try { execSync('git pull --ff-only', { cwd: dest, stdio: 'ignore' }); } catch { /* keep */ }
    } else {
      execSync(`git clone --depth 1 ${url} "${dest}"`, { stdio: 'inherit' });
    }
    const libRoot = await findLibraryRoot(dest);
    // If the package is published (non-private name), set an install spec so the renderer can
    // bundle the REAL package: name + runtime peer deps (e.g. @mui/material -> + @emotion/react,
    // @emotion/styled). See publishInstallSpec below.
    return { kind: 'git', dir: libRoot, installSpec: await publishInstallSpec(libRoot), source: trimmed };
  }

  // 3. npm spec — install into render-harness and analyze from node_modules/<pkg>.
  const harness = path.join(root, 'render-harness');
  const baseName = trimmed.startsWith('@')
    ? '@' + trimmed.slice(1).split('@')[0]
    : trimmed.split('@')[0];
  const installed = path.join(harness, 'node_modules', baseName);
  if (!(await exists(installed))) {
    const viteThere = await exists(path.join(harness, 'node_modules', 'vite'));
    if (!viteThere) execSync('npm install', { cwd: harness, stdio: 'inherit' });
    execSync(`npm install ${trimmed}`, { cwd: harness, stdio: 'inherit' });
  }
  return { kind: 'npm', dir: installed, installSpec: trimmed, source: trimmed };
}
```

**Resolution table:**

| Input | Detected as | Analyzed from | `installSpec` |
|-------|-------------|---------------|---------------|
| `../ui-library`, `D:\libs\foo` (existing dir) | `local` | the resolved absolute path | `null` |
| `antd`, `antd@5`, `@mui/material@5` | `npm` | `render-harness/node_modules/<pkg>` (installed first) | the spec |
| `https://github.com/o/r(.git)`, `git@...`, `owner/repo` | `git` | clone in `.lib-cache/<repo>`, then `findLibraryRoot` scores `packages/*` **and `packages/@scope/*`** → best component package | `name + peers` if published, else `null` |

The `@scope` base-name parsing (`'@' + slice(1).split('@')[0]`) correctly handles
`@mui/material@5 → @mui/material`. The renderer reuses the same harness, so npm-sourced libraries
are already installed for the screenshot step.

> **Scoped monorepos (e.g. Mantine):** `mantinedev/mantine` keeps its packages under
> `packages/@mantine/<pkg>`, so `findLibraryRoot` must descend into `@scope` folders (above) — else
> it stops at the `@mantine` scope dir (no `src/`), scores nothing, and falls back to the repo root,
> yielding **0 components**. With the descent it resolves to `packages/@mantine/core` and
> `publishInstallSpec` returns `@mantine/core @mantine/hooks` (the required peer). `PRIMARY_NAME`
> already lists `mantine`/`chakra` so the right package wins the score.

---

## `analyze-cli.ts` — the analyze-only entry point

Resolves a source, runs Hook 1 (or reuses a shelved profile), and shelves all three artifacts.
Prints a JSON summary as the **last stdout line** (so the backend can parse it). Diagnostics go to
`stderr` to keep stdout clean.

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { getProvider } from './provider';
import { resolveLibrary } from './resolve-library';
import { analyzeLibrary, loadProfile, slug } from './library-analyzer';
import { profileToMarkdown } from './profile-to-markdown';
import { projectRoot } from './paths';

interface Args { source: string; force?: boolean; }

function parseArgs(argv: string[]): Args {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a.startsWith('--')) out[a.replace(/^--/, '')] = argv[++i];
  }
  if (!out.source) throw new Error('Required: --source "<npm spec | git url | local path>"');
  return out as unknown as Args;
}
async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = getProvider();
  const root = projectRoot();
  console.error(`[analyze] provider: ${provider.name}`);

  console.error(`[analyze] resolving source: ${args.source}`);
  const resolved = await resolveLibrary(args.source);
  console.error(`[analyze] ${resolved.kind} -> ${resolved.dir}`);

  // Reuse a shelved profile unless --force.
  const libBase = path.basename(resolved.dir);
  let profile;
  let librarySlug = slug(libBase);
  let profilePath = path.join(root, 'doc-reader', librarySlug, 'profile.json');

  if (!args.force && (await exists(profilePath))) {
    console.error(`[analyze] reusing shelved profile ${profilePath}`);
    profile = await loadProfile(profilePath);
  } else {
    console.error(`[analyze] analyzing (AI hook)...`);
    const res = await analyzeLibrary(resolved.dir, { provider });
    profile = res.profile;
    profilePath = res.profilePath;
  }
  // Slug from the REAL package name is the canonical identity.
  librarySlug = slug(profile.library.name);

  // Write the Claude-readable reference MD.
  const refDir = path.join(root, 'library-refs', librarySlug);
  await fs.mkdir(refDir, { recursive: true });
  const referencePath = path.join(refDir, 'REFERENCE.md');
  await fs.writeFile(referencePath, profileToMarkdown(profile), 'utf-8');
  console.error(`[analyze] wrote ${path.relative(root, referencePath)}`);

  // Registry entry (slug -> source/dir/installSpec/profilePath) for later generation.
  await fs.writeFile(
    path.join(refDir, 'source.json'),
    JSON.stringify(
      {
        source: resolved.source,
        kind: resolved.kind,
        dir: resolved.dir,
        installSpec: resolved.installSpec,
        name: profile.library.name,
        slug: librarySlug,
        version: profile.library.version,
        profilePath: path.relative(root, profilePath),
      },
      null, 2
    ),
    'utf-8'
  );

  const summary = {
    ok: true,
    source: resolved.source,
    kind: resolved.kind,
    installSpec: resolved.installSpec,
    name: profile.library.name,
    slug: librarySlug,
    version: profile.library.version,
    componentCount: profile.components.length,
    components: profile.components.map((c) => c.name),
    limitations: profile.limitations,
    referencePath: path.relative(root, referencePath),
    profilePath: path.relative(root, profilePath),
  };
  process.stdout.write(JSON.stringify(summary)); // machine-readable result on the LAST stdout line
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
```

**Crucial details to preserve:**
- All progress logging uses `console.error` (stderr). The **only** stdout write is the final JSON
  summary (or `{ ok:false, error }` on failure). The backend parses the FIRST balanced `{...}` on
  stdout (balance-aware; the summary's `limitations[]` can contain a literal `{` inside a string).
- Profile reuse: if `doc-reader/<slug>/profile.json` exists and `--force` is not passed, the
  profile is loaded (no AI call). The slug is then re-derived from `profile.library.name` so the
  canonical identity always comes from the real package name, not the folder name.
- Usage: `ts-node src/ai/analyze-cli.ts --source "antd@5"` (or a git url / local path), optional
  `--force` to re-analyze.

### The three shelved artifacts

| Path | Produced by | Consumed by |
|------|-------------|-------------|
| `doc-reader/{slug}/profile.json` | Hook 1 (`analyzeLibrary`) | select + generate hooks, `store.ts` (component list) |
| `library-refs/{slug}/REFERENCE.md` | `profileToMarkdown` | a fresh AI context / the web app's library detail |
| `library-refs/{slug}/source.json` | `analyze-cli` | `store.ts` + `runGenerate` (maps slug → dir/installSpec/profilePath) |

---

## `profile-to-markdown.ts` — render the AI-readable reference

This produces the project's promised MD: self-contained and instructional so Claude can act on it
at a fresh context with no other files loaded.

```ts
import type { LibraryProfile, ProfiledComponent } from './schema';

function propsTable(c: ProfiledComponent): string {
  if (!c.props.length) return '_No public props documented._';
  const head = '| Prop | Type | Required | Default | Description |\n|---|---|---|---|---|';
  const rows = c.props.map((p) => {
    const def = p.default == null ? '—' : `\`${p.default}\``;
    const desc = (p.description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    return `| \`${p.name}\` | \`${p.type.replace(/\|/g, '\\|')}\` | ${p.required ? 'yes' : 'no'} | ${def} | ${desc} |`;
  });
  return [head, ...rows].join('\n');
}

function componentSection(c: ProfiledComponent): string {
  const lines: string[] = [];
  lines.push(`### ${c.name}`, '');
  lines.push(`- **Category:** ${c.category}`);
  if (c.description) lines.push(`- **What it is:** ${c.description}`);
  if (c.variants.length) lines.push(`- **Variants:** ${c.variants.map((v) => `\`${v}\``).join(', ')}`);
  if (c.capabilities.length) lines.push(`- **Capabilities:** ${c.capabilities.join(', ')}`);
  if (c.composesWith.length) lines.push(`- **Composes with:** ${c.composesWith.join(', ')}`);
  lines.push('', '**Import**', '', '```tsx', c.importExample.trim(), '```', '');
  lines.push('**Props**', '', propsTable(c), '');
  if (c.usageExample && c.usageExample.trim()) {
    lines.push('**Usage example**', '', '```tsx', c.usageExample.trim(), '```', '');
  }
  return lines.join('\n');
}

export function profileToMarkdown(profile: LibraryProfile): string {
  const lib = profile.library;
  const md: string[] = [];

  md.push(`# Library Reference — ${lib.name}@${lib.version}`, '');
  md.push(
    '> Generated by the analyze hook. This file is the single source of truth a fresh AI ' +
      'context uses to build prototypes with **only** this library. Do not import anything ' +
      'not listed here.',
    ''
  );

  // Setup
  md.push('## Setup (required for the prototype to run)', '');
  md.push(`- **Install:** \`npm install ${lib.name}\``);
  md.push(`- **Import from:** \`${lib.importPath}\``);
  md.push(
    lib.styleImport
      ? `- **Style entrypoint (must be imported once at the app root):** \`import '${lib.styleImport}';\``
      : '- **Style entrypoint:** none required.'
  );
  md.push(
    profile.globalWrappers.length
      ? `- **Global wrappers (must wrap the app/root):** ${profile.globalWrappers.map((w) => `\`${w}\``).join(', ')}`
      : '- **Global wrappers:** none required.'
  );
  md.push('');

  // Theme tokens
  const colors = lib.themeTokens?.colors || {};
  const colorKeys = Object.keys(colors);
  md.push('## Theme tokens', '');
  if (colorKeys.length) {
    md.push('| Token | Value |\n|---|---|');
    for (const k of colorKeys) md.push(`| \`${k}\` | \`${colors[k]}\` |`);
  } else {
    md.push('_No exposed color tokens detected._');
  }
  if (lib.themeTokens?.spacing) md.push(`\n- **Spacing:** \`${lib.themeTokens.spacing}\``);
  if (lib.themeTokens?.notes) md.push(`\n${lib.themeTokens.notes}`);
  md.push('');

  // Component catalogue
  md.push(`## Components (${profile.components.length})`, '');
  md.push('Quick index: ' + profile.components.map((c) => `\`${c.name}\``).join(', '), '');
  for (const c of profile.components) md.push(componentSection(c));

  // Limitations
  md.push('## Known limitations', '');
  if (profile.limitations.length) for (const l of profile.limitations) md.push(`- ${l}`);
  else md.push('_None recorded._');
  md.push('');

  // Build instructions
  md.push('## How to build a prototype from this reference', '');
  md.push('1. Use **only** the components listed above; import them from the import path in Setup.');
  md.push('2. Apply the required style entrypoint and global wrappers exactly once at the root.');
  md.push('3. Prefer the documented variants/props; do not invent props that are not in the tables.');
  md.push('4. Generate realistic mock data for the requested domain — do not reuse unrelated samples.');
  md.push('5. If the request needs something under "Known limitations", call it out as a gap rather than faking it.');
  md.push('6. Emit a single self-contained, default-exported `.tsx` component with all data inline.');
  md.push('');

  return md.join('\n');
}
```

### Exact `REFERENCE.md` section layout

In order, every reference contains:

1. `# Library Reference — {name}@{version}` + a blockquote stating it is the single source of truth.
2. `## Setup (required for the prototype to run)` — install, import-from, style entrypoint (or
   "none required"), global wrappers (or "none required").
3. `## Theme tokens` — a `| Token | Value |` table from `themeTokens.colors`, or
   "_No exposed color tokens detected._"; optional spacing + notes lines.
4. `## Components (N)` — a quick index of backtick'd names, then **one `### {Name}` section per
   component**: Category / What it is / Variants / Capabilities / Composes with bullets, an
   **Import** fenced block (`importExample`), a **Props** table (`| Prop | Type | Required |
   Default | Description |`, or "_No public props documented._"), and an optional **Usage example**
   fenced block.
5. `## Known limitations` — bullet list, or "_None recorded._".
6. `## How to build a prototype from this reference` — the six numbered build rules.

### Short example (abridged)

```markdown
# Library Reference — antd@5.29.3

> Generated by the analyze hook. This file is the single source of truth a fresh AI context uses
> to build prototypes with **only** this library. Do not import anything not listed here.

## Setup (required for the prototype to run)

- **Install:** `npm install antd`
- **Import from:** `antd`
- **Style entrypoint:** none required.
- **Global wrappers (must wrap the app/root):** `ConfigProvider`

## Theme tokens

| Token | Value |
|---|---|
| `colorPrimary` | `#1677ff` |

## Components (2)

Quick index: `Table`, `Card`

### Table

- **Category:** data-display
- **What it is:** A table for displaying rows with sorting and pagination.
- **Capabilities:** sortable, pagination, row selection

**Import**

```tsx
import { Table } from 'antd';
```

**Props**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `columns` | `ColumnsType<T>` | yes | — | Column definitions. |
| `dataSource` | `T[]` | yes | — | Row data. |

**Usage example**

```tsx
<Table columns={columns} dataSource={rows} />
```

## Known limitations

- No built-in charting components.

## How to build a prototype from this reference
1. Use **only** the components listed above; ...
```

`run-flow.ts` re-renders `REFERENCE.md` from the profile on every generation run too (so it stays
in sync) — see [`04-rendering-and-shelving.md`](./04-rendering-and-shelving.md).
