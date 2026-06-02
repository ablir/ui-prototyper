---
name: render-and-shelve
description: Bundle a generated prototype against the REAL installed UI library with Vite and capture a Playwright screenshot, then shelve code + screenshot together under prototypes/{id}/v{N}/. Use after generate-prototype produces .tsx, when the user wants to SEE the rendered result.
---

# Skill: Render a Prototype with the Real Library → screenshot.png

The screenshot must show the **actual** installed library — never hand-written clones. You bundle the
generated `.tsx` in a Vite harness that imports the real package, then screenshot it headlessly.

## Fast path — the renderer is present (preferred)
The renderer is invoked automatically by `run-flow.ts` (see **generate-prototype**). To render a
specific code file on its own, call `renderPrototype(code, opts)` from
`prototyping-system/src/render/vite-renderer.ts`:

```ts
import { renderPrototype } from './src/render/vite-renderer';
await renderPrototype(code, {
  libraryInstall: ['antd@5'],                 // npm specs to ensure installed; [] if already present
  outputScreenshotPath: 'prototypes/<id>/v<N>/screenshot.png',
});
```

## What it does (recreate manually if needed)
1. **Ensure deps.** In `prototyping-system/render-harness/`: `npm install` (react, react-dom, vite,
   @vitejs/plugin-react), then `npm install <libraryInstall...>` for the target library.
2. **Inject code.** Write the generated component to `render-harness/src/Prototype.tsx` (it must
   `export default`). `src/main.tsx` mounts `<Prototype/>` into `#root`; `index.html` is the Vite entry.
3. **Build.** `npm run build` in the harness (Vite → `dist/`, `base: './'`).
4. **Serve + screenshot.** Serve `dist/` over a local HTTP server and use Playwright (Chromium,
   headless) to navigate to it, wait for `#root` to populate, and capture a PNG. (Reuse
   `screenshot-capture.ts`: `waitForFunction` on `#root.children.length > 0`, settle ~1s, then shoot.)
5. **Shelve.** Save the PNG next to the code at `prototypes/{id}/v{N}/screenshot.png`.

## Prerequisites & gotchas
- Playwright browsers must be installed once: `npx playwright install chromium` (run in `prototyping-system`).
- The library must be installable from npm for a true render. For **git-only** libraries that aren't
  published, rendering is best-effort: try `npm install <localCloneDir>` (file: install) or link the
  clone into the harness; if the bundle fails, still shelve the code and report the render gap rather
  than crashing.
- Honor each library's style setup: import its style entrypoint and global wrappers in the generated
  code (this is already required by **generate-prototype**), so the bundle renders themed.

## Output
The screenshot path, and confirmation that code + screenshot are shelved together under the same
`v{N}/` folder. Report any render fallback or failure clearly instead of faking an image.
```
