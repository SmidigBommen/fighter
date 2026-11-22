FROM node:26-alpine AS build
WORKDIR /app
RUN npm install -g --allow-scripts=pnpm pnpm@12.21.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY server ./server
COPY assets/game ./assets/game
RUN pnpm build

# The server has no dependencies outside Node itself.
FROM node:26-alpine
WORKDIR /app
COPY server ./server
COPY --from=build /app/dist ./dist
# The score table lives here. Mount a volume to keep it across deploys.
VOLUME /data
ENV PORT=80 SCORES_FILE=/data/scores.json
EXPOSE 80
CMD ["node", "server/server.mjs"]
