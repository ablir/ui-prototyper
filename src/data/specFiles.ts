// Spec file registry: the real text of every file inside blueprint-spec-kit.zip,
// each paired with a hand-authored plain-English ("layman") explanation.
//
// The raw Markdown is bundled at build time from src/spec-content/** via import.meta.glob.
// Display paths mirror the original zip layout (e.g. `.claude/skills/<name>/SKILL.md`),
// even though the bundled copies live under flatter names to avoid dotfile-glob issues.

const rawModules = import.meta.glob('../spec-content/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Key the raw content by its path *under* spec-content/ (e.g. "blueprint/00-overview.md").
const contentByKey: Record<string, string> = {};
for (const [absKey, text] of Object.entries(rawModules)) {
  const rel = absKey.replace(/^.*spec-content\//, '');
  contentByKey[rel] = text;
}

export interface Layman {
  /** One-line, friendly headline. */
  tagline: string;
  /** A short plain-English paragraph. */
  body: string;
  /** Optional "in a nutshell" bullets. */
  bullets?: string[];
}

export interface SpecFile {
  /** Display path exactly as it appears inside the zip. */
  path: string;
  /** Key into the bundled content map (path under spec-content/). */
  src: string;
  /** Friendly section title. */
  title: string;
  layman: Layman;
}

export function getContent(file: SpecFile): string {
  return contentByKey[file.src] ?? `*(content unavailable for ${file.path})*`;
}

export const SPEC_FILES: SpecFile[] = [
  {
    path: 'README.md',
    src: 'README.md',
    title: 'Kit Welcome Note',
    layman: {
      tagline: 'The cover letter for the whole package.',
      body: 'This is the front door of the zip. It explains that the archive is a complete, self-contained recipe: hand it to an AI and, using nothing else, the AI can rebuild the entire application from scratch — the AI brain, the screenshot engine, the server, and the website.',
      bullets: [
        'Lists what is inside the box and what it is for.',
        'Tells you the three-step "unzip → open with an AI → say build it" process.',
        'Notes the tools you need: Node.js, a headless browser, and one AI provider.',
      ],
    },
  },
  {
    path: 'blueprint/README.md',
    src: 'blueprint/README.md',
    title: 'Blueprint Table of Contents',
    layman: {
      tagline: 'The map of the instruction manual.',
      body: 'The blueprint folder is the full build manual. This page is its table of contents: a one-paragraph summary of what the system does, a diagram of how data flows through it, and the recommended reading order for files 00 through 08.',
      bullets: [
        'Shows the "spine" — library in, screenshot out — as a simple diagram.',
        'Recommends reading the numbered files in order.',
        'Introduces the four reusable AI "skills".',
      ],
    },
  },
  {
    path: 'blueprint/00-overview.md',
    src: 'blueprint/00-overview.md',
    title: 'Overview & North Star',
    layman: {
      tagline: 'The big idea and the ground rules.',
      body: 'Explains the core promise: point the tool at ANY React component library, describe a screen in plain English, and get back working code plus a real screenshot. The golden rule ("north star") is that the engine never hard-codes a specific library — it learns each one fresh.',
      bullets: [
        'Three AI steps: analyze the library → pick components → write the code.',
        'Three ways the AI can run, picked automatically (API key, the claude CLI, or offline replay).',
        'A glossary of all the jargon so nobody gets lost.',
      ],
    },
  },
  {
    path: 'blueprint/01-folder-structure.md',
    src: 'blueprint/01-folder-structure.md',
    title: 'Folder Structure',
    layman: {
      tagline: 'Where everything lives.',
      body: 'A labelled floor-plan of the finished project. Every folder and important file is listed with a one-line note on its job, so you always know where to look.',
      bullets: [
        'Three independent mini-projects: the engine, the server, and the website.',
        'Plus the "shelves" where results are filed away and reused.',
      ],
    },
  },
  {
    path: 'blueprint/02-ai-pipeline.md',
    src: 'blueprint/02-ai-pipeline.md',
    title: 'The AI Pipeline',
    layman: {
      tagline: 'The brain, spelled out in detail.',
      body: 'The deepest chapter. It shows the actual code for the three AI steps, the strict "contracts" that force the AI to answer in a tidy, checkable format, and the exact wording of the instructions given to the AI.',
      bullets: [
        'Step 1 reads the library; Step 2 matches it to your request; Step 3 writes the screen.',
        'Each answer is validated, so a sloppy reply is caught instead of trusted.',
        'A "swappable" design lets you change which AI does the work without touching the rest.',
      ],
    },
  },
  {
    path: 'blueprint/03-library-reference.md',
    src: 'blueprint/03-library-reference.md',
    title: 'Per-Library Reference',
    layman: {
      tagline: 'Turning a library into a reusable cheat-sheet.',
      body: 'Analyzing a big library is expensive, so the system does it once and files the knowledge away as a tidy Markdown "cheat-sheet". Next time, the AI just reads the cheat-sheet — fast and cheap. This file explains how that cheat-sheet is found, built, and laid out.',
      bullets: [
        'Accepts a library by npm name, GitHub link, or a local folder.',
        'Produces a machine file (for the code) and a readable file (for the AI).',
        'Lists the library\'s components, theme colors, and known limitations.',
      ],
    },
  },
  {
    path: 'blueprint/04-rendering-and-shelving.md',
    src: 'blueprint/04-rendering-and-shelving.md',
    title: 'Rendering & Shelving',
    layman: {
      tagline: 'The eyes: building the real UI and photographing it.',
      body: 'Generated code is not trusted until it is actually run. This step bundles the code together with the genuine library, opens it in a real headless browser, and takes a true screenshot — then files the code and picture together, with a version number, so nothing is ever lost.',
      bullets: [
        'Uses the REAL library, not a fake mock-up.',
        'Every run is versioned (v1, v2, …) so history is preserved.',
        'If rendering fails, it says so honestly instead of faking a picture.',
      ],
    },
  },
  {
    path: 'blueprint/05-backend-express.md',
    src: 'blueprint/05-backend-express.md',
    title: 'The Express Backend',
    layman: {
      tagline: 'The waiter that takes orders and reports progress.',
      body: 'The server sits between the website and the engine. It takes requests ("analyze this", "generate that"), runs the engine in the background as a "job", and streams live progress updates back to the browser so you can watch each step tick by.',
      bullets: [
        'Turns long tasks into trackable jobs.',
        'Streams progress live (no need to refresh).',
        'Serves up the finished screenshots and code.',
      ],
    },
  },
  {
    path: 'blueprint/06-frontend-react.md',
    src: 'blueprint/06-frontend-react.md',
    title: 'The React Frontend',
    layman: {
      tagline: 'The storefront you actually click on.',
      body: 'The website with three tabs — Libraries, Generate, and History. This file specifies each screen, how it talks to the server, and how it shows the live progress bar while the AI works.',
      bullets: [
        'Libraries tab: add and analyze a component library.',
        'Generate tab: type a prompt, watch it build, see code + screenshot.',
        'History tab: revisit every prototype and version you made.',
      ],
    },
  },
  {
    path: 'blueprint/07-runbook.md',
    src: 'blueprint/07-runbook.md',
    title: 'Runbook',
    layman: {
      tagline: 'How to install it and press go.',
      body: 'The practical "getting started" guide: what to install, in what order, which settings control the AI mode, and a full worked example you can copy-paste to see the whole thing run end to end.',
      bullets: [
        'Install the three projects one by one.',
        'Pick your AI mode just by setting an environment variable.',
        'A complete demo from analyze to screenshot.',
      ],
    },
  },
  {
    path: 'blueprint/08-verification.md',
    src: 'blueprint/08-verification.md',
    title: 'Verification Checklist',
    layman: {
      tagline: 'The "is it actually working?" checklist.',
      body: 'A list of pass/fail tests (V0–V8) that prove each part of the system really works — from "does it compile" to "can it analyze a giant library" to "does the website load". This is how you know the rebuild succeeded.',
      bullets: [
        'Each check maps to a project goal (G0–G8).',
        'Covers the brain, the eyes, and the product.',
        'Honest about what is done versus still in progress.',
      ],
    },
  },
  {
    path: '.claude/skills/analyze-library/SKILL.md',
    src: 'skills/analyze-library.md',
    title: 'Skill: Analyze Library',
    layman: {
      tagline: 'Claude\'s recipe card for scanning a library.',
      body: 'A short instruction card that lets the AI perform the "analyze a library" step on its own, even with no other files loaded. It has a fast path (run the command) and a manual path (the AI does the thinking itself).',
    },
  },
  {
    path: '.claude/skills/generate-prototype/SKILL.md',
    src: 'skills/generate-prototype.md',
    title: 'Skill: Generate Prototype',
    layman: {
      tagline: 'Claude\'s recipe card for turning a prompt into code.',
      body: 'The instruction card for the "pick components and write the screen" step. Given an analyzed library and a plain-English request, it produces import-checked code and files it on the shelf.',
    },
  },
  {
    path: '.claude/skills/render-and-shelve/SKILL.md',
    src: 'skills/render-and-shelve.md',
    title: 'Skill: Render & Shelve',
    layman: {
      tagline: 'Claude\'s recipe card for taking the screenshot.',
      body: 'The instruction card for bundling the generated code against the real library and capturing a true screenshot, then filing the code and image together.',
    },
  },
  {
    path: '.claude/skills/run-prototype-pipeline/SKILL.md',
    src: 'skills/run-prototype-pipeline.md',
    title: 'Skill: Run Full Pipeline',
    layman: {
      tagline: 'Claude\'s recipe card for doing the whole thing.',
      body: 'The top-level orchestrator card. Given a library and a prompt, it runs all four stages in order — analyze, select, generate, render — and hands back the code and the screenshot.',
    },
  },
];
