import { defineConfig } from 'vite';
import type { Connect, Plugin } from 'vite';
import { createScoreHandler } from './server/scores.mjs';

/** Serves the score table from the dev and preview servers, as server/server.mjs does in production. */
function scoreApi(): Plugin {
  const use = (middlewares: Connect.Server) => {
    const handle = createScoreHandler(process.env.SCORES_FILE ?? 'data/scores.json');
    middlewares.use((req, res, next) => {
      handle(req, res).then((done: boolean) => done || next(), next);
    });
  };
  return {
    name: 'score-api',
    configureServer: (server) => use(server.middlewares),
    configurePreviewServer: (server) => use(server.middlewares),
  };
}

export default defineConfig({
  base: './',
  publicDir: 'assets/game',
  build: { chunkSizeWarningLimit: 2000 },
  plugins: [scoreApi()],
});
