FROM node:20-alpine
RUN npm install -g pnpm@9.15.4
WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy all packages and apps needed
COPY packages/ ./packages/
COPY workers/ ./workers/
COPY apps/api/ ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build dependency packages first, then api
RUN pnpm --filter @beomz-studio/studio-db build || true
RUN pnpm --filter @beomz-studio/contracts build || true
RUN pnpm --filter @beomz-studio/templates build || true
RUN pnpm --filter @beomz-studio/operations build || true
RUN pnpm --filter @beomz-studio/prompt-policies build || true
RUN pnpm --filter @beomz-studio/kernel build || true
RUN pnpm --filter @beomz-studio/preview-e2b build || true
RUN pnpm --filter @beomz-studio/temporal-worker build || true
RUN pnpm --filter @beomz-studio/api build

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
