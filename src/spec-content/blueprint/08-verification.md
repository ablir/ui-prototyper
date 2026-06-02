# 08 — Verification Checklist

A concrete checklist a fresh AI runs to confirm the rebuild matches expectations. Each item has a
**done-when** criterion. The structure mirrors the project goals **G0–G8**.

Run from the repo root unless noted. Assume the [`07-runbook.md`](./07-runbook.md) install steps
are complete.

---

## V0 — Typecheck every package (build sanity)

```bash
cd prototyping-system && npx tsc --noEmit
cd ../server && npm run typecheck      # tsc --noEmit -p tsconfig.json
cd ../web && npm run typecheck         # tsc --noEmit
```

**Done when:** all three typecheck with no errors. (zod 4 must be installed in
`prototyping-system`; `@types/express`/`@types/cors` in `server`; `@types/react*` in `web`.)

---

## V1 — Provider selection (G0)

- With no `ANTHROPIC_API_KEY` and no `claude` CLI, `getProvider().name === 'shelf'`.
- With the `claude` CLI on PATH (no key), it is `'claude-code'`.
- With `ANTHROPIC_API_KEY` set, it is `'anthropic'`.

**Done when:** `node -e "process.env.ANTHROPIC_API_KEY='x'; console.log(require('ts-node/register'),
require('./prototyping-system/src/ai/provider').getProvider().name)"` (or an equivalent
ts-node check) prints the expected tier for each environment. Also: the API key is read from env
only — grep `src/ai` for a hardcoded key and find **none**.

---

## V2 — Analyze a known library (G1)

```bash
cd prototyping-system
npx ts-node src/ai/analyze-cli.ts --source "antd@5"
```

**Done when:**
- The final stdout line is a JSON object with `ok: true`, a `slug`, `componentCount > 0`, and a
  `components: string[]`.
- These files exist:
  - `prototyping-system/doc-reader/antd/profile.json` (valid `LibraryProfile`),
  - `prototyping-system/library-refs/antd/REFERENCE.md`,
  - `prototyping-system/library-refs/antd/source.json` (has `dir`, `installSpec`, `profilePath`).
- `REFERENCE.md` contains the sections: `# Library Reference — …`, `## Setup …`, `## Theme tokens`,
  `## Components (N)`, `## Known limitations`, `## How to build a prototype from this reference`,
  and one `### <Name>` section per component.
- Re-running without `--force` logs "reusing shelved profile" (no second AI call).

> Library-agnostic check (G1): grep `prototyping-system/src/ai/*.ts` for any literal component name,
> hex color, or `antd`/`rustui` identity. **Done when:** none found (fixtures live only in
> `render-harness/package.json` and `ui-library/`).

---

## V2b — Analyze a large scoped-monorepo library via git (G1 robustness)

```bash
cd prototyping-system
npx ts-node src/ai/analyze-cli.ts --source "https://github.com/mantinedev/mantine"
```

**Done when:**
- `[analyze] git -> …/.lib-cache/mantine/packages/@mantine/core` — the resolver **descended into the
  `@mantine` scope folder** (not the repo root). `findLibraryRoot` must consider `packages/@scope/*`.
- The result JSON has `name: "@mantine/core"`, `installSpec: "@mantine/core @mantine/hooks"`, and
  `componentCount` **in the dozens-to-100+** (Mantine profiles ~109). A count of 0 means the resolver
  stopped at the scope folder; a count of ~13 means `src/components` used the greedy walk instead of
  `gatherPerComponent` (per-component, `PER_FILE≈2200`, `DEFAULT_BUDGET=300_000`).
- `doc-reader/mantine-core/profile.json` has `library.styleImport === "@mantine/core/styles.css"`
  (the gatherer detects the `./styles.css` export, not just `./styles`) and
  `globalWrappers` includes `"MantineProvider"`.
- With the **`claude` CLI provider**, this still succeeds even though the model often prepends a prose
  preamble — `parseJsonAgainst` → `extractJson` recovers the JSON. (A raw `JSON.parse` would throw
  *"Model did not return valid JSON"*.)

> Contrast (honest 0-component cases): `--source "https://github.com/shadcn-ui/ui"` (copy-paste
> registry) and any pure-CSS framework analyze to `componentCount: 0` with explanatory
> `limitations[]` — correct behavior, but they cannot be generated/rendered against.

---

## V3 — Capability gauging differs per library (G2)

Analyze a second, unrelated library (e.g. the local fixture: `--source "../ui-library"`), then run
the select hook (via the full flow) against the **same prompt** for both.

**Done when:** the two runs' `ComponentPlan.chosenComponents` (in each `REFERENTIAL_DOC.json` /
`result.json`) differ, and each plan's `gaps[]` is present and honest (gaps non-empty when the
prompt asks for something the library lacks).

---

## V4 — Generate a prototype: code + screenshot (G3, G4, G5)

```bash
cd prototyping-system
npx ts-node src/ai/run-flow.ts --library ./render-harness/node_modules/antd --install "antd@5" \
  --name "Support Dashboard" --prompt "A support dashboard with KPI cards and a tickets table with priority/status."
```

**Done when:**
- The final stdout line is `__RESULT__{...}` with `ok: true`, `version: 1`, `codePath`,
  `screenshotPath`, `chosenComponents`, `gaps`, `unknownImports`.
- These exist:
  - `prototypes/support-dashboard/v1/support-dashboard.tsx` (a single default-exported component
    importing **only** from `antd`),
  - `prototypes/support-dashboard/v1/screenshot.png` (a non-empty PNG showing real antd styling),
  - `prototypes/support-dashboard/v1/result.json`,
  - `prototypes/support-dashboard/metadata.json` (currentVersion 1),
  - `prototypes/support-dashboard/REFERENTIAL_DOC.json` (componentPlan + learnings).
- **Import audit (G3):** `unknownImports` is empty (every imported symbol exists in the profile).
- **Real render (G4):** the screenshot reflects the actual library — no hand-written clones.

---

## V5 — Refinement produces a new version (G5, G7)

Re-run the flow with the same `--name` plus `--refine "add a status filter row above the table"`.

**Done when:**
- `prototypes/support-dashboard/v2/` exists with its own `.tsx`, screenshot, and `result.json`.
- `metadata.json.currentVersion === 2` and `versions` has two entries; **v1 is untouched** (history
  never overwritten).
- The select/generate hooks received the prior `REFERENTIAL_DOC.json` (learnings) and the prior v1
  code (`previousCode`) — the v2 code is an edit of v1, not a from-scratch rewrite.

---

## V6 — API endpoints (G6 backend)

Start the backend (`cd server && npm run dev`). With the artifacts from V2/V4 present:

```bash
curl localhost:4000/api/health                      # { "ok": true }
curl localhost:4000/api/libraries                   # { libraries: [ { slug:"antd", componentCount>0, hasReference:true, ... } ] }
curl localhost:4000/api/libraries/antd              # detail with components[], limitations[], reference (md)
curl localhost:4000/api/libraries/antd/reference    # text/markdown body
curl localhost:4000/api/prototypes                  # { prototypes: [ { id:"support-dashboard", currentVersion:2, ... } ] }
curl localhost:4000/api/prototypes/support-dashboard            # versions[] with chosenComponents/gaps/hasScreenshot
curl localhost:4000/api/prototypes/support-dashboard/versions/1/code        # text/plain .tsx
curl -o /tmp/s.png localhost:4000/api/prototypes/support-dashboard/versions/1/screenshot   # image/png
```

Async + SSE:

```bash
curl -s -X POST localhost:4000/api/libraries/analyze -H 'content-type: application/json' \
  -d '{"source":"antd@5"}'                          # -> 202 { jobId }
curl -N localhost:4000/api/jobs/<jobId>/events       # SSE: data:<Job JSON> frames, then event:end
curl -s -X POST localhost:4000/api/prototypes -H 'content-type: application/json' \
  -d '{"name":"Demo","slug":"antd","prompt":"a pricing page"}'   # -> 202 { jobId }
```

**Done when:** every endpoint returns the documented shape and status; the SSE stream emits
`data:` frames whose JSON `status` progresses `queued`/`running` → `done`, with steps advancing
(`resolve→analyze→reference` for analyze; `analyze→select→generate→render` for generate), ending
with an `event: end` and a closed connection. A bad `slug` on `POST /api/prototypes` returns
`404 { error: 'library "<slug>" not analyzed yet' }`; missing `source` on analyze returns `400`.

---

## V7 — Load the UI (G6 frontend)

Start the web app (`cd web && npm run dev`) with the backend running. Open `http://localhost:5173`.

**Done when:** (assumes the **[target spec]** `App.tsx`/`main.tsx`/`Generate.tsx`/`History.tsx`
from [`06-frontend-react.md`](./06-frontend-react.md) are built)
- **Libraries** tab lists the analyzed `antd` card; submitting a source shows live
  `<JobProgress/>` steps and auto-selects the new library on completion.
- **Generate** tab: with a library selected, submitting name+prompt streams progress and, on
  `done`, shows the screenshot (`screenshotUrl`) and code (`getVersionCode`) plus chips/gaps.
- **History** tab lists prototypes and, on selecting one, shows each version's requirement,
  components, gaps, screenshot, and code.
- No terminal is needed for the connect→analyze→prompt→see-code+screenshot flow.

---

## V8 — Safety / error surfacing (G8 — target)

- Analyze a deliberately bad source (`--source "this-package-does-not-exist@9.9"`).

**Done when:** the failure surfaces as a clear job `error` (and `{ ok:false, error }` from the CLI),
the SSE stream ends with `status: 'error'`, and the UI shows the message — **no server crash**.

> Note: true sandbox isolation for arbitrary `npm install` (G8) is **target work**, not yet
> implemented. This item verifies graceful error surfacing, which is the part that exists.

---

## Goal mapping (G0–G8)

| Goal | Verified by | Status in source |
|------|-------------|------------------|
| G0 Prove the AI hook works | V1, V2 | done |
| G1 Library-agnostic analysis | V2 (+ grep), V3 | done |
| G2 Capability gauging + gaps | V3 | done |
| G3 Real prompt-driven generation + import audit | V4 | done |
| G4 Real library rendering → true screenshot | V4 | done |
| G5 Two outputs every time + metadata/referential doc | V4, V5 | done |
| G6 Web app (no terminal) | V6, V7 | backend done; frontend partial (target) |
| G7 Cheaper refinement (reuse shelf + learnings) | V5 | mechanism present |
| G8 Safe with arbitrary libraries | V8 | error surfacing only; sandbox is target |

**Rebuild is "done" when** V0–V6 pass fully and V7 passes once the target-spec frontend pages are
built. V8's sandbox portion remains future work.
