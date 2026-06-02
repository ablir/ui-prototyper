# ui-prototyper — AI Prototyping Studio (presentation site)

An interactive, **static** presentation of an AI-driven, **library-agnostic** React UI prototyping
system. It does two things:

1. **Spec Explorer** — browse the complete build-from-scratch specification
   (`blueprint-spec-kit.zip`) file by file, with the real text on one side and a **plain-English
   explanation** of each file on the other.
2. **Usage Guide** — a real, end-to-end walkthrough of the AI Studio that teaches it the **Mantine**
   library and asks it to build a **Banking Portfolio — Client Assets** dashboard. Every screenshot
   was captured live from the running application; the final dashboard is the **real Mantine library**
   rendered and photographed by Playwright.

Built with **Mantine** + **Vite** + **React** + **TypeScript**.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # → dist/  (static, deployable anywhere)
npm run preview
```

## Deploy

- **GitHub Pages** — pushing to `main` runs `.github/workflows/deploy.yml`, which builds with
  `BASE_PATH=/ui-prototyper/` and publishes to Pages automatically. Enable Pages → Source:
  **GitHub Actions** once, and the live site appears at
  `https://<user>.github.io/ui-prototyper/`.
- **Vercel** — import the repo as-is (framework: Vite). The default base `/` and the SPA rewrite in
  `vercel.json` make it work with zero extra config.

## Project layout

```
src/
  pages/            Overview · SpecExplorer · UsageGuide
  components/        FileTree · MarkdownView · LaymanPanel · CodeBlock
  data/             specFiles.ts (tree + layman copy) · steps.ts · banking.ts
  spec-content/      the real Markdown from blueprint-spec-kit.zip (bundled)
public/screenshots/  live captures of the AI Studio + the rendered dashboard
```

> The underlying engine (analyze → select → generate → render) is **not** in this repo — this is a
> presentation of it. See the Spec Explorer for the full specification.
