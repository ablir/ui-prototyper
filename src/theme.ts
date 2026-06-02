import { createTheme } from '@mantine/core';

// A calm, "fintech" palette so the presentation reads as a polished product,
// not a scaffold. Indigo primary, generous radius, system font stack.
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: '700',
  },
});
