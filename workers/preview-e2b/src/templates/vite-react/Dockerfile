FROM node:20-bookworm-slim

ENV PATH="/usr/local/bin:$PATH"

RUN corepack enable \
  && corepack prepare pnpm@9.15.4 --activate \
  && npm install --global tsx@4.20.6

COPY runner.ts /opt/beomz/runner.ts

WORKDIR /workspace

COPY workspace/package.json ./package.json
COPY workspace/tsconfig.json ./tsconfig.json
COPY workspace/vite.config.ts ./vite.config.ts
COPY workspace/index.html ./index.html
COPY workspace/apps ./apps

RUN mkdir -p apps/web/src/app/generated apps/web/src/.beomz

RUN pnpm install
