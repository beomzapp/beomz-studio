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

# Build api and all workspace dependencies in topological order
RUN pnpm --filter "@beomz-studio/api..." build

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
