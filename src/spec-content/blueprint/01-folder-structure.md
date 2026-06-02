# 01 — Folder Structure

The complete target tree. Three sibling npm projects under the repo root
(`prototyping-system/`, `server/`, `web/`) plus prompts, the example library fixture, this
blueprint, and the runtime artifact folders that the pipeline creates on disk.

```
D:\Sideline\POC\                         # repo root
│
├── CLAUDE.md                            # project instructions (architecture summary)
├── GOALS.md                             # G0–G8 done-when checklist
├── PLAN.md                              # phased build plan + target architecture
├── PROMPTS.md                           # running log of prompt requirements/feedback
├── USAGE.md                             # how-to / API docs (update when APIs change)
│
├── prompts/                             # the AI-hook prompts (first-class spec)
│   ├── 00-build-prompts.md              # build-driver prompts
│   ├── 01-library-analysis.md           # Hook 1 system+user prompt + LibraryProfile schema
│   ├── 02-component-selection.md        # Hook 2 prompt + ComponentPlan schema
│   └── 03-prototype-generation.md       # Hook 3 prompt + post-gen checks
│
├── ui-library/                          # EXAMPLE source library (RustUI) — a test fixture only
│   └── src/components/                  # Accordion, Button, Header, PieChart, Snackbar, Table
│       └── index.ts                     # barrel export
│
├── prototyping-system/                  # THE ENGINE (pipeline + renderer + MCP)
│   ├── package.json                     # deps: @anthropic-ai/sdk, playwright, zod, ts-node, mcp sdk
│   ├── tsconfig.json                    # REQUIRED for `tsc --noEmit` (V0) + ts-node; excludes render-harness/
│   ├── src/
│   │   ├── ai/                          # ── THE PIPELINE ──
│   │   │   ├── schema.ts                # zod contracts: LibraryProfile, ComponentPlan + helpers
│   │   │   ├── provider.ts              # 3 AI provider tiers + getProvider()
│   │   │   ├── paths.ts                 # ESM/CJS-safe projectRoot() resolver
│   │   │   ├── source-gatherer.ts       # collects bounded library source/types for analysis
│   │   │   ├── library-analyzer.ts      # Hook 1: analyze → LibraryProfile + slug()/loadProfile()
│   │   │   ├── component-selector.ts    # Hook 2: gauge fit + gaps → ComponentPlan
│   │   │   ├── ai-generator.ts          # Hook 3: generate .tsx + auditImports()
│   │   │   ├── profile-to-markdown.ts   # LibraryProfile → REFERENCE.md
│   │   │   ├── resolve-library.ts       # source (local|npm|git) → local dir + installSpec
│   │   │   ├── analyze-cli.ts           # CLI: resolve→analyze→shelve profile+REFERENCE+source.json
│   │   │   ├── run-flow.ts              # CLI: analyze→select→generate→render→shelve (full flow)
│   │   │   └── README.md                # pipeline docs
│   │   ├── render/
│   │   │   └── vite-renderer.ts         # installs real lib, Vite-builds harness, serves, screenshots
│   │   ├── screenshot-capture.ts        # Playwright wrapper (ScreenshotCapture class)
│   │   ├── doc-reader.ts                # static prop scanner (MCP scan/read fallback)
│   │   └── mcp-server.ts                # MCP server (5 tools)
│   │
│   ├── render-harness/                  # tiny Vite app the generated code is dropped into
│   │   ├── package.json                 # react, react-dom, antd (fixture), vite, plugin-react
│   │   ├── vite.config.ts               # base:'./', react plugin, outDir dist
│   │   ├── index.html                   # #root + /src/main.tsx
│   │   └── src/
│   │       ├── main.tsx                 # createRoot(...).render(<Prototype/>)
│   │       └── Prototype.tsx            # OVERWRITTEN per render with generated code
│   │
│   ├── ai-cache/                        # RUNTIME: provider responses <cacheKey>.txt (shelf)
│   ├── doc-reader/{slug}/profile.json   # RUNTIME: shelved LibraryProfiles
│   ├── library-refs/{slug}/             # RUNTIME: per-library reference
│   │   ├── REFERENCE.md                 #   AI-readable build guide
│   │   └── source.json                  #   registry: source/dir/installSpec/profilePath
│   ├── prototypes/{id}/                 # RUNTIME: generated prototypes
│   │   ├── metadata.json                #   versions list, currentVersion, name, library
│   │   ├── REFERENTIAL_DOC.json         #   shelved plan + learnings (fed back into refinement)
│   │   └── v{N}/
│   │       ├── {id}.tsx                 #   the generated base code
│   │       ├── screenshot.png           #   the rendered screenshot
│   │       └── result.json              #   per-version machine result
│   └── .lib-cache/{repo}/               # RUNTIME: git clones for git-sourced libraries
│
├── server/                              # Express API orchestrator (shells out to the CLIs)
│   ├── package.json                     # express, cors, ts-node
│   ├── tsconfig.json
│   └── src/
│       ├── config.ts                    # paths + PORT; locates ../prototyping-system
│       ├── jobs.ts                       # in-memory job store + SSE EventEmitter fan-out
│       ├── pipeline.ts                  # spawn `npx ts-node <cli>`, map stdout→job steps
│       ├── store.ts                     # read shelved artifacts → API shapes
│       └── index.ts                     # all routes + SSE endpoint
│
├── web/                                 # React web app (Vite + React + TS)
│   ├── package.json                     # react, react-dom, vite, plugin-react
│   ├── vite.config.ts                   # dev server :5173, proxy /api → :4000
│   ├── index.html
│   ├── tsconfig.json / tsconfig.node.json
│   └── src/
│       ├── main.tsx                     # [target] React entry → <App/>
│       ├── App.tsx                      # [target] tabs: Libraries / Generate / History
│       ├── api.ts                       # typed API client (mirrors the contract)
│       ├── useJobStream.ts              # SSE hook: subscribe to a job's progress
│       └── components/
│           ├── Libraries.tsx            # pick/analyze a library (streams analysis)
│           ├── Generate.tsx             # [target] prompt → code + screenshot
│           ├── History.tsx              # [target] prototypes + versions
│           ├── JobProgress.tsx          # live steps + log tail
│           ├── CodeViewer.tsx           # read-only code block + copy
│           └── Chips.tsx                # Chips / Gaps / UnknownImports presentational bits
│
├── .claude/
│   ├── settings.local.json              # local Claude Code settings
│   └── skills/                          # [target] analyze-library / generate-prototype skills
│
└── blueprint/                           # THIS folder — the rebuild spec (only .md files)
    ├── README.md  00-overview.md  01-folder-structure.md  02-ai-pipeline.md
    ├── 03-library-reference.md  04-rendering-and-shelving.md  05-backend-express.md
    ├── 06-frontend-react.md  07-runbook.md  08-verification.md
```

## Notes

- **`[target]`** marks files that were not yet present when this blueprint was authored — build
  them from the specs in [`06-frontend-react.md`](./06-frontend-react.md). Everything unmarked
  exists and is reproduced verbatim in the relevant numbered file.
- **RUNTIME** folders (`ai-cache/`, `doc-reader/`, `library-refs/`, `prototypes/`, `.lib-cache/`)
  are created by the pipeline at runtime — do not hand-create them; they appear when you analyze a
  library or generate a prototype. They live **inside `prototyping-system/`** because
  `projectRoot()` (see `paths.ts`) resolves there.
- The **three projects are independent npm packages** with their own `node_modules`. The server
  does not import the engine; it spawns `npx ts-node` against it (cwd = `prototyping-system/`).
- The `ui-library/` fixture and the `antd` dependency in `render-harness/package.json` are the only
  library-specific things in the repo, and both are **fixtures** — nothing in `src/ai/` references
  them.
