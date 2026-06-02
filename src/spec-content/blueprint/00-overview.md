# 00 — Overview

## What the system is

A web application (plus CLIs and an MCP server) that lets a product owner:

1. **Point at any React UI library** — by npm spec (`antd@5`), git url, `owner/repo` shorthand, or a
   local folder path.
2. Have an **AI hook analyze the library** — components, props, variants, theme tokens, idiomatic
   usage — and shelve that as a structured **`LibraryProfile`** plus a human/AI-readable
   **`REFERENCE.md`**.
3. **Type a plain-language prompt** ("a support dashboard with KPI cards and a tickets table").
4. Have an **AI hook gauge which components fit** the prompt (and flag what the library *cannot*
   do) → a **`ComponentPlan`**.
5. Have an **AI hook write real `.tsx`** using only that library, import-audited.
6. **Render the real installed library** (Vite bundle + Playwright) → a true **`screenshot.png`**.
7. Get **two artifacts every time**: the base code and the screenshot, **versioned and shelved**.

## The North Star

> **The engine never hardcodes a single library's components, data, colors, or theme.**

RustUI (`ui-library/`) and Ant Design are *test fixtures only*. No file in the pipeline contains a
library-specific component name. The analyzer, selector, and generator reason entirely over the
shelved profile produced at runtime. If you find yourself typing a component name like `Button` or
a hex color into pipeline code, you are doing it wrong.

## Library suitability (what actually works end-to-end)

The engine is library-agnostic, but a library must be a **real, importable React component package**
for the full analyze → generate → **render** path to work. Pick test fixtures accordingly:

| Library shape | Example | Result |
|---|---|---|
| Published npm component lib | `antd`, `@mui/material`, **Mantine `@mantine/core`** | ✅ analyzes, generates, **renders** a real screenshot |
| Scoped monorepo (`packages/@scope/<pkg>`) | Mantine, Chakra, MUI repos via git url | ✅ — `findLibraryRoot` descends into `@scope/*` to find the package |
| Copy-paste / CLI registry | **shadcn/ui** | ⚠️ analyzes to **0 components** (components are scaffolded into your app, not importable) → can't render |
| Pure CSS framework | **Tailwind CSS** | ⚠️ **0 components** (ships no React components); also a `/tree/...` URL isn't a cloneable remote |

Three resolver/gatherer behaviors make big real libraries work (all detailed in
[`02-ai-pipeline.md`](./02-ai-pipeline.md) and [`03-library-reference.md`](./03-library-reference.md)):
descend into **scoped** monorepo packages; gather **one capped file per component** (so a 100+
component library fits the budget — Mantine profiles all 109); and **recover JSON from a prose
preamble** (the `claude` CLI provider routinely adds one). The render harness runs **React 19** to
satisfy current peers (e.g. Mantine v9), and generated code self-includes the library's provider +
style import from the profile (`globalWrappers`, `styleImport`).

## The three-hook design

Each hook is a single AI call with a dedicated system prompt and a zod-validated output contract.

| Hook | File | Input | Output (zod) | Cache key | When |
|------|------|-------|--------------|-----------|------|
| **1 Analyze** | `ai/library-analyzer.ts` | gathered library source/types | `LibraryProfile` | `analyze__<slug>` | once per library (then shelved) |
| **2 Select** | `ai/component-selector.ts` | prompt + `LibraryProfile` | `ComponentPlan` | `select__<id>` | per prompt (cheap, reads profile only) |
| **3 Generate** | `ai/ai-generator.ts` | prompt + profile + plan | `.tsx` text | `generate__<id>__v<N>` | per prompt/version |

The prompts live in `prompts/01-library-analysis.md`, `02-component-selection.md`,
`03-prototype-generation.md`. They are reproduced verbatim in
[`02-ai-pipeline.md`](./02-ai-pipeline.md). The schemas are reproduced there too.

After hook 3, a **non-AI** step renders the real library and screenshots it (Hook-adjacent,
[`04-rendering-and-shelving.md`](./04-rendering-and-shelving.md)).

## The AI provider tiers

The model behind every hook is chosen by `ai/provider.ts → getProvider()`, in this priority order:

1. **`AnthropicProvider`** — used when **`ANTHROPIC_API_KEY` is set**. Calls the Claude API
   directly via `@anthropic-ai/sdk`. Model from `CLAUDE_MODEL` (default `claude-opus-4-8`).
2. **`ClaudeCodeProvider`** — used when no API key but the **`claude` CLI is on PATH**. Shells out
   `claude -p --output-format text` with the `system+user` prompt piped via **stdin** (NOT argv —
   the prompt embeds the profile JSON and would overflow the Windows command-line length limit).
   This is the "nothing configured" default — the model is Claude Code itself, at a fresh context.
3. **`ShelfProvider`** — used otherwise. Replays a precomputed response from
   `ai-cache/<cacheKey>.txt`. Fully offline / deterministic.

Every provider **persists its response to `ai-cache/<cacheKey>.txt`** so reruns are reproducible
(the shelf both caches live calls and serves offline replay). See full source in
[`02-ai-pipeline.md`](./02-ai-pipeline.md).

## The per-library reference system

Analysis shelves **three** things per library:

- `doc-reader/{slug}/profile.json` — the machine contract (`LibraryProfile`), used by select/generate.
- `library-refs/{slug}/REFERENCE.md` — the **AI-readable reference** (rendered from the profile by
  `profile-to-markdown.ts`). This is the file a fresh AI reads to build prototypes with *only* this
  library: setup, theme tokens, a section per component, limitations, build instructions.
- `library-refs/{slug}/source.json` — a registry entry mapping `slug → source/dir/installSpec/
  profilePath` so the backend can later find the library to render against.

`slug` is `name.toLowerCase().replace(/[^a-z0-9]+/g,'-')` derived from the library's real package
name. Detailed in [`03-library-reference.md`](./03-library-reference.md).

## How it is exposed

- **CLI** — `ai/analyze-cli.ts` (analyze only) and `ai/run-flow.ts` (full flow). Each prints a
  machine-readable JSON object as its final stdout line so a parent process can parse the result.
- **Express API** (`server/`) — shells out to those two CLIs with `npx ts-node`, models progress as
  **jobs streamed over SSE**, and serves the shelved artifacts. See
  [`05-backend-express.md`](./05-backend-express.md).
- **React web app** (`web/`) — Libraries / Generate / History pages, live SSE progress. See
  [`06-frontend-react.md`](./06-frontend-react.md).
- **MCP server** (`prototyping-system/src/mcp-server.ts`) — exposes the pipeline as MCP tools
  (`capture_screenshot`, `capture_html`, `scan_library`, `generate_prototype`,
  `read_component_docs`). Optional; the CLIs and API are the primary surfaces.

## Glossary

| Term | Meaning |
|------|---------|
| **Hook** | One AI call with a system prompt + zod-validated output. There are exactly three. |
| **Provider** | The swappable LLM backend (`AnthropicProvider` \| `ClaudeCodeProvider` \| `ShelfProvider`). |
| **LibraryProfile** | Hook 1 output: structured description of a library (components, props, theme). |
| **ComponentPlan** | Hook 2 output: chosen components + layout + **gaps** + dataShape. |
| **Profile** | Shorthand for the shelved `LibraryProfile` JSON at `doc-reader/{slug}/profile.json`. |
| **Reference** | The `REFERENCE.md` rendered from a profile, the AI-readable build guide. |
| **slug** | Lowercased, dash-separated library identity derived from the package name. |
| **Shelf / shelving** | Persisting artifacts to disk (`ai-cache/`, `doc-reader/`, `library-refs/`, `prototypes/`) so repeat work is cheap and reproducible. |
| **Render harness** | A tiny Vite app the generated code is dropped into, built against the real library, then screenshotted. |
| **Import audit** | A regex check that every symbol imported from the library's `importPath` exists in the profile. |
| **Job** | A backend unit of work (`analyze` \| `generate`) with ordered steps, streamed over SSE. |

## Goals (G0–G8) at a glance

Build order: **G0→G1→G2→G3** (the brain) · **G4→G5** (the eyes) · **G6→G7→G8** (the product).
G0–G5 are done; G6 (web app) is in progress; G7 (cheaper refinement) and G8 (sandboxing) are
target work. The full done-when criteria are reproduced in [`08-verification.md`](./08-verification.md).
