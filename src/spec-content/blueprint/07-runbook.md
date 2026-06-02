# 07 — Runbook

How to install, configure, and run all three projects, plus the three AI run modes and an
end-to-end exercise.

---

## Prerequisites

- **Node.js 18+** and npm.
- **git** on PATH (only needed for git-sourced libraries).
- For real rendering: Playwright's Chromium (installed via `npx playwright install chromium`).
- Optionally one of: an **`ANTHROPIC_API_KEY`**, or the **`claude` CLI** on PATH (for live AI).

The repo is three independent npm packages plus runtime artifact folders. Install each separately.

---

## Install order

```bash
# 1. The engine (pipeline + renderer + MCP)
cd prototyping-system
npm install
npx playwright install chromium          # browser for screenshots

# 2. The render harness (real-library bundling). Installs react + vite + the antd fixture.
#    The pipeline auto-installs this on first render, but doing it now avoids a cold start.
cd render-harness
npm install
cd ..

# 3. The backend API
cd ../server
npm install

# 4. The web app
cd ../web
npm install
```

> npm-sourced libraries (e.g. `antd@5`) are installed **into `render-harness/node_modules`** on
> demand by `resolve-library.ts` / `vite-renderer.ts`. You do not pre-install analyzed libraries.

---

## Environment variables

| Var | Used by | Effect |
|-----|---------|--------|
| `ANTHROPIC_API_KEY` | `provider.ts` | If set → **Tier 1** `AnthropicProvider` (direct Claude API). |
| `CLAUDE_MODEL` | `AnthropicProvider` | Overrides the model. Default `claude-opus-4-8`. |
| `CLAUDE_CLI` | `ClaudeCodeProvider` | Override the `claude` binary name/path (default `claude`). |
| `PORT` | `server/config.ts` | Backend port. Default `4000`. |
| `VITE_API_BASE` | `web/src/api.ts` | Override API base. Default `/api` (proxied to `:4000`). |

The web dev server proxies `/api` → `http://localhost:4000`, so no CORS/base config is needed in
dev. The backend passes `process.env` through to the spawned CLIs, so setting `ANTHROPIC_API_KEY`
in the backend's environment makes the pipeline run live.

---

## The three run modes (provider tiers)

`getProvider()` picks automatically; you control it purely via environment:

| Mode | Condition | Provider | Behavior |
|------|-----------|----------|----------|
| **API key** | `ANTHROPIC_API_KEY` set | `AnthropicProvider` | Calls Claude directly; caches each response to `ai-cache/<cacheKey>.txt`. |
| **Claude CLI** | no key, `claude` on PATH | `ClaudeCodeProvider` | Shells `claude -p --output-format text` with the prompt piped via **stdin**; caches to the shelf. |
| **Shelf** | neither | `ShelfProvider` | Replays `ai-cache/<cacheKey>.txt`; **errors if the file is missing.** |

Cache keys: `analyze__<slug>`, `select__<id>`, `generate__<id>__v<N>`. To pre-seed the shelf for a
fully offline/deterministic demo, place hand-written responses at those paths under
`prototyping-system/ai-cache/`.

---

## Run order (dev)

Open three terminals.

```bash
# Terminal A — backend (port 4000)
cd server
# (export ANTHROPIC_API_KEY=... for live AI; otherwise Claude CLI or shelf is used)
npm run dev                  # ts-node src/index.ts -> "[server] prototyping API listening on :4000"

# Terminal B — web app (port 5173, proxies /api -> :4000)
cd web
npm run dev                  # vite -> http://localhost:5173

# Terminal C — optional: direct CLI / MCP usage (see below)
```

Open `http://localhost:5173`.

---

## CLI usage (no web app)

**Analyze a library** (resolve → analyze → shelve profile + REFERENCE.md + source.json):

```bash
cd prototyping-system
npx ts-node src/ai/analyze-cli.ts --source "antd@5"
# or:  --source "https://github.com/owner/repo"   |   --source "owner/repo"   |   --source "../ui-library"
# add --force to re-analyze and overwrite the shelved profile
```

**Full flow** (analyze→select→generate→render→shelve):

```bash
cd prototyping-system
npx ts-node src/ai/run-flow.ts \
  --library ./render-harness/node_modules/antd \
  --install "antd@5" \
  --name "Support Dashboard" \
  --prompt "A support dashboard with KPI cards and a tickets table with priority/status."
# Outputs: prototypes/support-dashboard/v1/{support-dashboard.tsx, screenshot.png, result.json}
#          prototypes/support-dashboard/{metadata.json, REFERENTIAL_DOC.json}
```

**Refine** (same `--name` ⇒ new version, prior learnings + prior code fed back):

```bash
npx ts-node src/ai/run-flow.ts \
  --library ./render-harness/node_modules/antd --install "antd@5" \
  --name "Support Dashboard" \
  --prompt "A support dashboard with KPI cards and a tickets table with priority/status." \
  --refine "add a status filter row above the table"
# -> prototypes/support-dashboard/v2/...
```

**MCP server** (optional): `npm run mcp` (runs `node --loader ts-node/esm src/mcp-server.ts`),
exposing `capture_screenshot`, `capture_html`, `scan_library`, `generate_prototype`,
`read_component_docs`.

---

## End-to-end exercise (the full demo)

With backend + web running:

1. **Analyze antd.** Libraries tab → type `antd@5` → **Analyze**. Watch the steps
   `resolve → analyze → reference` complete over SSE. The library appears as a card and is
   auto-selected. (Behind the scenes: `library-refs/antd/REFERENCE.md`, `doc-reader/antd/
   profile.json`, `library-refs/antd/source.json` are written.)
2. **Generate a dashboard.** Generate tab → name `Support Dashboard`, prompt
   *"A support dashboard with KPI cards and a tickets table with priority/status."* → **Generate**.
   Watch `analyze → select → generate → render`. (Behind the scenes: the four-step flow runs and
   shelves `prototypes/support-dashboard/v1/`.)
3. **View the screenshot and code.** When the job is `done`, the Generate panel shows the
   `screenshot.png` and the `.tsx`, plus chosen components and any gaps.
4. **Browse history.** History tab → click *Support Dashboard* → see v1 with its requirement,
   components, gaps, screenshot, and code.

Pure-CLI equivalent of steps 1–2:

```bash
cd prototyping-system
npx ts-node src/ai/analyze-cli.ts --source "antd@5"
npx ts-node src/ai/run-flow.ts --library ./render-harness/node_modules/antd --install "antd@5" \
  --name "Support Dashboard" --prompt "A support dashboard with KPI cards and a tickets table with priority/status."
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `ShelfProvider: no cached response for "..."` | No API key and no `claude` CLI, and the shelf file is missing. Set `ANTHROPIC_API_KEY`, or install the `claude` CLI, or pre-seed `ai-cache/<cacheKey>.txt`. |
| Backend job stuck / errors on spawn | `npx`/`ts-node` not resolving; ensure `prototyping-system` deps are installed. On Windows `shell:true` handles `npx.cmd`. |
| Screenshot is blank / 404 | Playwright Chromium not installed (`npx playwright install chromium`), or the generated code failed to build — check the job log (Vite build errors stream through). |
| `npm install <lib>` fails during analyze/render | Bad npm spec or peer-dep conflict. The error streams into the job log. Sandbox isolation for arbitrary libraries is Goal G8 (not yet built). |
| SSE never updates in the browser | Backend not on `:4000`, or a proxy buffering responses. The Vite proxy streams; ensure `vite.config.ts` proxy target matches `PORT`. |

Next: [`08-verification.md`](./08-verification.md) — the done-when checklist.
