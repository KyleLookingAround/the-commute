import { defineConfig } from 'vite';

// GitHub Pages serves the site under /the-commute/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/the-commute/' : '/',
  build: { target: 'es2020', sourcemap: false },
});
