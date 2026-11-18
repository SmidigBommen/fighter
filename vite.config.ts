import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'assets/game',
  build: { chunkSizeWarningLimit: 2000 },
});
