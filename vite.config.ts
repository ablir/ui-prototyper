import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lets one build serve two hosts:
//   - Vercel / local:  default '/'
//   - GitHub Pages:    '/ui-prototyper/' (set by the deploy workflow)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
});
