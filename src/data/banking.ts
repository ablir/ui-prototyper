// Real output of the live run-flow against Mantine for the
// "Banking Portfolio — Client Assets" prototype (prototypes/.../v1/result.json + the generated .tsx).
import bankingCode from './banking-code.txt?raw';

export interface BankingResult {
  library: string;
  version: number;
  chosenComponents: string[];
  gaps: { need: string; libraryCanProvide: boolean; note?: string }[];
  /** The rendered screenshot, in public/screenshots/. */
  screenshot: string;
  /** The generated source. */
  code: string;
}

export const BANKING: BankingResult = {
  library: '@mantine/core',
  version: 1,
  chosenComponents: [
    'Paper', 'Card', 'Grid', 'SimpleGrid', 'Group', 'Stack', 'Title', 'Text', 'Divider',
    'Avatar', 'Alert', 'Badge', 'RingProgress', 'Progress', 'Table', 'Tabs', 'SegmentedControl',
    'Accordion', 'Timeline', 'ThemeIcon',
  ],
  gaps: [
    {
      need: 'Icons for the alert, timeline bullets, and trend arrows',
      libraryCanProvide: false,
      note: '@mantine/core ships no icon set; the AI fell back to plain text glyphs (▲ ▼) so the screen needs no extra dependency.',
    },
    {
      need: 'Real performance / allocation charts',
      libraryCanProvide: false,
      note: 'Charts live in the separate @mantine/charts package; allocation is approximated with RingProgress + Progress bars.',
    },
    {
      need: 'A sortable / paginated / filterable data grid for holdings',
      libraryCanProvide: false,
      note: 'Mantine’s Table is presentational only; the holdings list is rendered pre-sorted inside a ScrollArea.',
    },
    {
      need: 'Currency / number formatting',
      libraryCanProvide: true,
      note: 'Covered — the code uses Mantine’s NumberFormatter for market values.',
    },
    {
      need: 'Animated / auto-updating live metrics',
      libraryCanProvide: true,
      note: 'RollingNumber exists, but a static screenshot uses plain Text values.',
    },
  ],
  screenshot: 'banking-dashboard.png',
  code: bankingCode,
};
