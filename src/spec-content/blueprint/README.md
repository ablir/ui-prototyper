# Blueprint — AI-Driven, Library-Agnostic UI Prototyping System

> **Purpose of this folder.** These Markdown files are a complete, self-contained build
> specification. A fresh AI given **only** this `blueprint/` folder (nothing else from the repo)
> can recreate the entire system from the ground up: the AI pipeline, the per-library reference
> system, the real-library renderer, the Express backend, and the React frontend.
>
> Every file path, npm script, function signature, schema, and prompt below mirrors the actual
> working implementation. Where a source file's contents are load-bearing, they are quoted
> verbatim so the file can be re-typed without ambiguity.

---

## What this system does (one paragraph)

The system **analyzes any React UI library** and **generates prototype screens** from
natural-language prompts. It uses **three AI hooks** — *analyze → select → generate* — over a
**swappable AI provider**, then **renders the real installed library** with Vite + Playwright to
produce a true screenshot. Per-library knowledge is shelved as a Markdown **reference** that a
fresh AI context can build from, and every prototype is **versioned** so refinements get cheaper.
**Nothing is ever hardcoded to a specific library** — RustUI (the `ui-library/` fixture) and Ant
Design are just test fixtures.

## Data flow (the spine of the whole system)

```
ANY React UI library (npm spec | git url | owner/repo | local path)
        │
        ▼
[1 Analyze]  AI reads the library's source/types ──► LibraryProfile (zod-validated JSON)
        │                                            shelved: doc-reader/{slug}/profile.json
        │                                            rendered: library-refs/{slug}/REFERENCE.md
        ▼
[2 Select]   AI gauges which components fit a prompt ──► ComponentPlan (+ gaps it can't cover)
        │
        ▼
[3 Generate] AI writes real .tsx using ONLY that library ──► import-audited code
        │
        ▼
[4 Render]   Vite bundles the ACTUAL library + Playwright screenshot ──► screenshot.png
        │
        ▼
[5 Shelve]   prototypes/{id}/v{N}/{id.tsx, screenshot.png, result.json}
             + metadata.json + REFERENTIAL_DOC.json (learnings fed back into refinements)
```

The whole thing is exposed two ways: a **CLI** (`analyze-cli.ts`, `run-flow.ts`) and an
**Express API** (`server/`) consumed by a **React web app** (`web/`). The backend never imports
the pipeline modules directly — it **shells out** to the two CLIs and parses their trailing JSON.

## Read these files in order

| # | File | What it lets you build |
|---|------|------------------------|
| — | [`README.md`](./README.md) (this file) | Orientation + the data-flow map. |
| 0 | [`00-overview.md`](./00-overview.md) | The north star, the three-hook design, provider tiers, glossary. |
| 1 | [`01-folder-structure.md`](./01-folder-structure.md) | The complete target directory tree with a purpose per entry. |
| 2 | [`02-ai-pipeline.md`](./02-ai-pipeline.md) | `schema.ts`, `provider.ts`, `source-gatherer.ts`, the three hooks, `paths.ts`, and the prompts. **Re-typeable.** |
| 3 | [`03-library-reference.md`](./03-library-reference.md) | `resolve-library.ts`, `analyze-cli.ts`, `profile-to-markdown.ts` + the exact `REFERENCE.md` layout. |
| 4 | [`04-rendering-and-shelving.md`](./04-rendering-and-shelving.md) | The render-harness, `vite-renderer.ts`, `screenshot-capture.ts`, `run-flow.ts`, the shelving model + JSON shapes. |
| 5 | [`05-backend-express.md`](./05-backend-express.md) | The full `server/` (config, jobs+SSE, pipeline spawn, store, routes) + the authoritative API contract. **Re-typeable.** |
| 6 | [`06-frontend-react.md`](./06-frontend-react.md) | The full `web/` (Vite+React+TS, proxy, pages, `useJobStream`, `api.ts`). **Re-typeable.** |
| 7 | [`07-runbook.md`](./07-runbook.md) | Install + run order, env vars, the three run modes, end-to-end exercise. |
| 8 | [`08-verification.md`](./08-verification.md) | A concrete done-when checklist mirroring the project goals G0–G8. |

## Dual purpose

1. **Rebuild instructions** — files 00–08 specify how to recreate the system.
2. **Runtime reference contract** — the per-library `REFERENCE.md` (see
   [`03-library-reference.md`](./03-library-reference.md)) is the artifact a fresh AI context reads
   to build a prototype with *only* that library. That is the project's core promise: analyze a
   library once, shelve a Markdown the AI can act on at zero additional context.

## Claude Code skills (`.claude/skills/`)

Four runtime skills let Claude run the system **at a fresh context** (no other files loaded).
Each `.claude/skills/<name>/SKILL.md` has both a *fast path* (call the CLI) and a *manual path*
(Claude acts as the model directly), so they work whether or not the pipeline code is present:

- **`analyze-library`** — given a library source (npm spec | git url | owner/repo | local path),
  produce `doc-reader/{slug}/profile.json` + `library-refs/{slug}/REFERENCE.md`. Mirrors
  [`03-library-reference.md`](./03-library-reference.md).
- **`generate-prototype`** — given an analyzed library slug + a prompt, run select → generate →
  import audit → shelve. Mirrors [`02-ai-pipeline.md`](./02-ai-pipeline.md) hooks 2–3.
- **`render-and-shelve`** — bundle the generated `.tsx` against the real library and screenshot it.
  Mirrors [`04-rendering-and-shelving.md`](./04-rendering-and-shelving.md).
- **`run-prototype-pipeline`** — the orchestrator: ensure analyzed → generate → render → present.

When rebuilding from scratch, recreate these four `SKILL.md` files from the descriptions above; the
CLIs in files 02–04 are the canonical fast-path entry points each skill wraps.
