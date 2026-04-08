FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY workers/temporal/package.json ./workers/temporal/package.json
COPY workers/temporal/dist/ ./workers/temporal/dist/
RUN pnpm install --frozen-lockfile --filter @beomz-studio/temporal-worker...
WORKDIR /app/workers/temporal
CMD ["node", "dist/worker.js"]
