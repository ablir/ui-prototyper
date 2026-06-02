// The guided walkthrough: each step is a real screen of the AI Prototyping Studio,
// captured live while building the "Banking Portfolio — Client Assets" prototype against Mantine.
// Screenshots live in public/screenshots/ and are referenced by filename.

export interface GuideStep {
  n: number;
  title: string;
  /** What the user does on this screen. */
  action: string;
  /** Plain-English explanation of what is happening. */
  plain: string;
  /** What runs behind the scenes (for the curious). */
  behind?: string;
  /** Screenshot filename in public/screenshots/. */
  image: string;
  /** Short caption under the screenshot. */
  caption: string;
}

export const STEPS: GuideStep[] = [
  {
    n: 1,
    title: 'Open the Studio',
    action: 'Launch the web app — it opens on the Libraries tab.',
    plain:
      'The Studio is the front door. The three tabs across the top — Libraries, Generate, History — are the whole workflow: teach it a library, ask for a screen, then revisit what you made.',
    behind: 'The React app loads and asks the Express API for any libraries already on the shelf.',
    image: '01-libraries.png',
    caption: 'The Libraries tab — your shelf of analyzed component libraries.',
  },
  {
    n: 2,
    title: 'Add & analyze Mantine',
    action: 'Type "@mantine/core" into the source box and press Analyze.',
    plain:
      'You point the tool at any React UI library — here, Mantine — by its npm name. You could equally paste a GitHub link or a local folder. Then you hit Analyze and watch the progress stream in live.',
    behind:
      'The server installs the library, gathers a capped slice of its source, and the first AI hook reads it. Progress (resolve → analyze → reference) streams over SSE.',
    image: '02-analyze.png',
    caption: 'Analyzing @mantine/core — live progress as the AI reads the library.',
  },
  {
    n: 3,
    title: 'Mantine is shelved',
    action: 'The job finishes — Mantine appears as a card and is auto-selected.',
    plain:
      'The library is now a reusable "cheat-sheet" on the shelf. The card shows it found 106 components. You only ever analyze a library once; every future prototype reads the shelved knowledge for free.',
    behind:
      'Three files were written: profile.json (for the code), REFERENCE.md (for the AI), and a registry entry so the renderer can find the real library later.',
    image: '03-analyzed.png',
    caption: 'Mantine analyzed — 106 components, ready to build against.',
  },
  {
    n: 4,
    title: 'Describe the screen',
    action: 'On the Generate tab, name it and describe the banking dashboard in plain English.',
    plain:
      'No design files, no component picking. You just write what you want: "a Banking Portfolio — Client Assets dashboard with KPI cards, an asset-allocation ring, a holdings table, tabs, an accordion and a transactions timeline." The AI does the rest.',
    behind:
      'The prompt is sent to the API, which kicks off the four-step flow: analyze (cached) → select → generate → render.',
    image: '04-generate-prompt.png',
    caption: 'The prompt that describes the Banking Portfolio dashboard.',
  },
  {
    n: 5,
    title: 'Watch it build',
    action: 'Press Generate and follow the live steps.',
    plain:
      'The AI first gauges which Mantine components fit your request (and honestly flags anything the library can’t do), then writes the actual code, then renders it. Each step ticks over in real time.',
    behind:
      'Hook 2 produces a ComponentPlan; Hook 3 writes import-audited .tsx; a non-AI step bundles the real Mantine library with Vite and screenshots it with Playwright.',
    image: '05-progress.png',
    caption: 'Live progress: select → generate → render.',
  },
  {
    n: 6,
    title: 'See the result',
    action: 'The job completes — review the chosen components, gaps, screenshot and code.',
    plain:
      'You get two artifacts every time: a true screenshot of the screen rendered with the real Mantine library, and the exact .tsx code behind it. The panel also lists which components were chosen and any capability gaps.',
    behind:
      'Everything is shelved under prototypes/banking-portfolio-client-assets/v1/ with a version number, so nothing is ever lost.',
    image: '06-result.png',
    caption: 'The finished prototype — components, screenshot and code, all in one view.',
  },
  {
    n: 7,
    title: 'Browse history',
    action: 'Open the History tab to revisit every prototype and version.',
    plain:
      'Each prototype keeps its full history. Refine it with a new instruction and you get v2, v3… — the old versions are never overwritten, so you can always compare.',
    behind: 'The store reads the shelved metadata and serves each version’s code + screenshot.',
    image: '07-history.png',
    caption: 'History — every prototype and version, preserved.',
  },
];
