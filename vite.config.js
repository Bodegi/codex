import { defineConfig } from 'vite';

export default defineConfig({
  // Served from a GitHub Pages *project* site at https://bodegi.github.io/codex/, so built asset
  // URLs must be prefixed with the repo subpath. Dev/preview honor this too (localhost:5173/codex/).
  base: '/codex/',
  server: {
    port: 5173,
    open: false
  }
});
