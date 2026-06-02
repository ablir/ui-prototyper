---
name: generate-prototype
description: Build a single-file React .tsx prototype screen from a plain-language prompt using ONLY a previously analyzed UI library, gauging which components fit and flagging gaps. Use after a library has a REFERENCE.md, when the user describes a screen/dashboard/page they want.
---

# Skill: Generate a Prototype from a Library Reference

You build a prototype screen for a product owner using **only** one analyzed library. This is the
**select** hook (gauge which components fit + report gaps) followed by the **generate** hook (write
the `.tsx`). Inputs: a library `{slug}` (must already have a `REFERENCE.md`) and a user prompt.

If the library has not been analyzed yet, run the **analyze-library** skill first.

## Two ways to run

### A. Fast path — the pipeline is present (preferred)
```bash
cd prototyping-system
npx ts-node src/ai/run-flow.ts \
  --library "<dir from library-refs/{slug}/source.json .dir>" \
  --profile "doc-reader/{slug}/profile.json" \
  --install "<installSpec from source.json, omit if null>" \
  --name "Support Dashboard" \
  --prompt "A support dashboard with KPI cards and a tickets table." \
  [--refine "add a status filter row above the table"]
```
This runs select → generate → import-audit → render → shelve and prints `__RESULT__<json>` as the
final line. Output lands in `prototypes/{id}/v{N}/`. **Done** — present the code + screenshot.

### B. Manual path — you ARE the model
1. **Read the reference.** Load `library-refs/{slug}/REFERENCE.md` and `doc-reader/{slug}/profile.json`.
   If refining, also load the prior version's code and `prototypes/{id}/REFERENTIAL_DOC.json`.
2. **Select (gauge fit) → `ComponentPlan`.** Choose ONLY components present in the profile. For each,
   give a role + rationale + key props. Propose an ordered top-to-bottom layout. **Honestly list
   gaps** — anything the prompt wants that the library can't do — with the closest fallback. Derive a
   `dataShape` for realistic mock data.

   ```jsonc
   {
     "summary": "one-line interpretation",
     "chosenComponents": [{ "name": "", "role": "", "rationale": "", "keyProps": [""] }],
     "layout": [{ "region": "", "uses": [""] }],
     "requiredWrappers": [""],            // from profile.globalWrappers
     "gaps": [{ "need": "", "libraryCanProvide": false, "fallback": "" }],
     "dataShape": [{ "field": "", "type": "", "exampleValue": "" }]
   }
   ```

3. **Generate the `.tsx`.** A senior-React-engineer pass producing one self-contained file:
   - Import components **only** from the profile's `importPath`. Never hand-write substitutes. Never
     use a component not in the plan.
   - Include the style entrypoint and required wrappers (e.g. `ConfigProvider`, `ThemeProvider`).
   - Use the library's variants/theme tokens; inline styles only for layout (flex/grid/spacing).
   - Generate realistic mock data for the prompt's DOMAIN (not generic banking/crypto) matching `dataShape`.
   - One default-exported component, all data inline, no external imports beyond the library + React.

4. **Import audit (must pass).** Every symbol imported from the library's import path must exist in
   the profile (component names + `globalWrappers`). If any unknown symbol appears, fix the code and
   re-audit before rendering.

5. **Shelve.** Write to `prototypes/{slug-of-name}/v{N}/{id}.tsx`. Same name ⇒ new version, never
   overwrite. Update `metadata.json`, `REFERENTIAL_DOC.json` (plan + learnings + gaps), and
   `result.json`. Then invoke the **render-and-shelve** skill for the screenshot.

## Prompts to adopt
- Selection (`prompts/02-component-selection.md`): *"You are a UI architect… choose only components
  that exist… explicitly identify GAPS… output a plan only."*
- Generation (`prompts/03-prototype-generation.md`): *"You are a senior React engineer… use ONLY the
  specified library… realistic mock data for the domain… one self-contained default-exported file."*

## Output
Present to the user: the chosen components, any gaps (up front — these are the library's limits),
the generated code, and the screenshot path from render-and-shelve.
```
