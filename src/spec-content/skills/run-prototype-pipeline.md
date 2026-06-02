---
name: run-prototype-pipeline
description: End-to-end orchestrator — turn a UI library (npm/GitHub/local) plus a plain-language prompt into a working React prototype (code + real-library screenshot), shelved and versioned. Use when the user wants a prototype "from scratch" and the library may or may not be analyzed yet. Routes to analyze-library, generate-prototype, and render-and-shelve.
---

# Skill: Run the Full Prototyping Pipeline

This is the top-level routine. Given a **library source** and a **prompt**, drive the four stages and
hand back the two deliverables every run must produce: the base `.tsx` code and a `.png` screenshot.

```
library source ──▶ [1 analyze] ─▶ REFERENCE.md + profile.json
       prompt  ──▶ [2 select]  ─▶ ComponentPlan (+ gaps)
               ──▶ [3 generate]─▶ import-audited .tsx
               ──▶ [4 render]  ─▶ screenshot.png
                              └─▶ shelve prototypes/{id}/v{N}/ + metadata + REFERENTIAL_DOC
```

## Steps
1. **Ensure the library is analyzed.** Compute `{slug}` from the library name. If
   `prototyping-system/library-refs/{slug}/REFERENCE.md` is missing, run the **analyze-library** skill
   on the source first. If it already exists, reuse it (cheaper — this is the whole shelving premise).
2. **Generate.** Run the **generate-prototype** skill with the slug + prompt (+ `--refine` for a new
   version of an existing prototype). This does select → generate → import audit → shelve.
3. **Render.** The fast path (`run-flow.ts`) already renders. If you generated manually, run the
   **render-and-shelve** skill on the produced code with the library's install spec.
4. **Present.** Return: chosen components, gaps (the library's limits, surfaced up front), the code,
   and the screenshot path.

## One-shot fast path (pipeline present)
```bash
cd prototyping-system
# analyze (once per library; safe to re-run, it reuses the shelf)
npx ts-node src/ai/analyze-cli.ts --source "antd@5"
# generate + render + shelve
npx ts-node src/ai/run-flow.ts \
  --library ./render-harness/node_modules/antd --profile doc-reader/antd/profile.json \
  --install "antd@5" --name "Support Dashboard" \
  --prompt "A support dashboard with KPI cards and a tickets table with priority/status."
```

## Provider modes (how "the AI" actually runs — see provider.ts)
1. `ANTHROPIC_API_KEY` set → direct Claude API (`CLAUDE_MODEL`, default `claude-opus-4-8`).
2. else `claude` CLI on PATH → Claude Code runs the hooks (`claude -p --output-format text`, prompt
   piped via **stdin** to avoid the Windows command-line length limit). **Default when nothing is configured.**
3. else → shelf replay from `ai-cache/<cacheKey>.txt` (deterministic, offline).

## Via the web app instead of the CLI
The same pipeline is exposed over HTTP by `server/` and driven by the `web/` UI: pick/add a library
(`POST /api/libraries/analyze`), type a prompt (`POST /api/prototypes`), watch SSE progress, view the
code + screenshot. See `blueprint/05-backend-express.md` and `blueprint/06-frontend-react.md`.

## Guarantees
- Library-agnostic: nothing here names a specific component, color, or dataset.
- Versioned: same prototype name ⇒ new `v{N}`, history is never overwritten.
- Honest: capability gaps are reported, not faked; render failures are reported, not mocked.
```
