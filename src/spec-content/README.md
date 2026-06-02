# Build-From-Scratch Spec Kit

This archive is the **complete, self-contained specification** for the AI-driven, library-agnostic
UI prototyping system. A fresh AI (Claude Code) given **only** this archive can recreate the entire
system from the ground up: the AI pipeline, the per-library reference system, the real-library
renderer, the Express backend, and the React frontend.

## Contents (this is everything needed)

```
blueprint/        # the rebuild spec — read README.md, then 00 → 08 in order
.claude/skills/   # 4 runtime skills that let Claude run the system at a fresh context
```

## How to build from scratch

1. Unzip into an empty folder and open it with Claude Code (or hand the folder to any capable agent).
2. Tell it: *"Read `blueprint/README.md`, then build the whole system per files 00–08."*
3. It will create `prototyping-system/`, `server/`, `web/`, `render-harness/`, and `prompts/`,
   then `npm install` each and run the verification checklist in `blueprint/08-verification.md`.

## Requirements at build/run time

- **Node.js 18+** and npm; **git** (only for git-sourced libraries).
- **Playwright Chromium** for real rendering: `npx playwright install chromium`.
- **One AI provider** (the engine auto-selects, see `blueprint/00-overview.md`):
  1. `ANTHROPIC_API_KEY` set → direct Claude API, or
  2. the `claude` CLI on PATH → Claude Code runs the hooks, or
  3. neither → shelf replay from pre-seeded `ai-cache/` (offline/deterministic only).

> This kit was validated on 2026-06-02 by a full rebuild that passed verification gates V0–V7
> live. Start at `blueprint/README.md`.
