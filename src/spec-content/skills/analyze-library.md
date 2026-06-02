---
name: analyze-library
description: Analyze any React UI library (npm package, GitHub repo, or local folder) into a structured profile and a Claude-readable REFERENCE.md that later guides prototype generation. Use when the user adds/points at a new library, or asks to "scan", "analyze", or "index" a library before building anything.
---

# Skill: Analyze a UI Library → REFERENCE.md

You are the **analyze hook** of a library-agnostic prototyping system. Your job: read the raw
source of ONE React component library and produce two shelved artifacts that let a *fresh* Claude
context build prototypes with **only** that library:

- `prototyping-system/doc-reader/{slug}/profile.json` — the machine contract (zod `LibraryProfile`).
- `prototyping-system/library-refs/{slug}/REFERENCE.md` — the human/AI-readable reference.
- `prototyping-system/library-refs/{slug}/source.json` — `{ source, kind, dir, installSpec, name, slug, version, profilePath }` so the generator can find/install the library again.

`{slug}` = the npm package name lowercased, non-alphanumerics → `-` (e.g. `@mui/material` → `mui-material`).

## Two ways to run

### A. Fast path — the pipeline is present (preferred)
If `prototyping-system/src/ai/analyze-cli.ts` exists, just run it:

```bash
cd prototyping-system
npx ts-node src/ai/analyze-cli.ts --source "<npm spec | git url | owner/repo | local path>"
# examples:
#   --source "antd@5"
#   --source "https://github.com/owner/repo"
#   --source "../ui-library"
```

It resolves the source (npm install into `render-harness`, `git clone` into `.lib-cache`, or use the
local dir), runs analysis through the active provider, and writes all three artifacts. The final
stdout line is a JSON summary. **Done** — report the summary.

### B. Manual path — no pipeline code, you ARE the model
Do it by hand when only the Markdown system exists (or the CLI fails):

1. **Resolve the source.**
   - Local path → read it directly.
   - npm spec → `npm install <spec>` inside `prototyping-system/render-harness`, then read `node_modules/<pkg>`.
   - GitHub URL / `owner/repo` → `git clone --depth 1 <url> prototyping-system/.lib-cache/<repo>`, then find the package (root `src/components/`, else a `packages/*` workspace).
2. **Gather source** (cap ~120k chars): component source (`.tsx`/`.ts`) or, for compiled npm packages, the `.d.ts` declarations (`types`/`es`/`lib`/`dist`); plus `*.stories.tsx` and `README.md`. Read `package.json` for name, version, and any `./styles` export.
3. **Produce a `LibraryProfile`** (schema below). Describe ONLY what is actually present — never invent components, props, or theme values.
4. **Render `REFERENCE.md`** in the exact section layout below and shelve all three artifacts.

## `LibraryProfile` schema (the contract you must satisfy)

```jsonc
{
  "library": {
    "name": "string", "version": "string", "importPath": "string",
    "styleImport": "string|null",          // e.g. "antd/dist/reset.css", null if none
    "themeTokens": { "colors": { "primary": "#.." }, "spacing": "string|null", "notes": "string" }
  },
  "components": [{
    "name": "string",
    "category": "layout|input|data-display|feedback|navigation|chart|other",
    "description": "string",
    "importExample": "string",             // exact import statement
    "props": [{ "name": "string", "type": "string", "required": true, "default": "string|null", "description": "string" }],
    "variants": ["string"],
    "composesWith": ["string"],
    "usageExample": "string",              // minimal COMPILABLE JSX from the stories/docs
    "capabilities": ["string"]             // plain language: "sortable", "pagination", "row selection"
  }],
  "globalWrappers": ["string"],            // components that must wrap the app (e.g. ThemeProvider, ConfigProvider)
  "limitations": ["string"]                // what the library notably does NOT provide
}
```

System framing to adopt while analyzing (from `prompts/01-library-analysis.md`): *"You are a React UI
library analyst… Describe ONLY what is present. Capture how components are MEANT to be composed.
Prefer the public, exported API. Note required vs optional props and defaults."* Populate
`capabilities` — the selection hook reasons over it.

## REFERENCE.md layout (must match `profile-to-markdown.ts`)

```md
# Library Reference — {name}@{version}
> One source of truth for building prototypes with ONLY this library.

## Setup (required for the prototype to run)
- Install: `npm install {name}`
- Import from: `{importPath}`
- Style entrypoint: `import '{styleImport}';`  (or "none required")
- Global wrappers: `Wrapper`, …  (or "none required")

## Theme tokens
| Token | Value |  …  (or "No exposed color tokens detected.")

## Components ({n})
Quick index: `A`, `B`, …
### {ComponentName}
- Category / What it is / Variants / Capabilities / Composes with
**Import** ```tsx … ```
**Props** | Prop | Type | Required | Default | Description |
**Usage example** ```tsx … ```

## Known limitations
- …

## How to build a prototype from this reference
1. Use only the components above; import from the Setup import path.
2. Apply the style entrypoint and global wrappers once at the root.
3. Don't invent props not in the tables.
4. Generate realistic mock data for the requested domain.
5. Surface anything under Known limitations as a gap, don't fake it.
6. Emit a single self-contained, default-exported `.tsx`.
```

## Output
Report: library name@version, component count, the path to the new `REFERENCE.md`, and any
limitations. Then hand off to the **generate-prototype** skill when the user gives a prompt.
```
