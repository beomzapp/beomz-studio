FROM node:20-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.4
WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy workspace sources only. Host node_modules stay out of the build context
# via .dockerignore so native packages are installed for Linux inside Docker.
COPY packages/ ./packages/
COPY workers/ ./workers/
COPY apps/ ./apps/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build the temporal worker and its workspace dependencies
RUN pnpm --filter "@beomz-studio/temporal-worker..." build

EXPOSE 7233
CMD ["node", "workers/temporal/dist/worker.js"]
