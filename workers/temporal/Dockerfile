FROM node:20-alpine

RUN apk add --no-cache ca-certificates

RUN npm install -g pnpm@9.15.4
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

COPY packages/ ./packages/
COPY workers/ ./workers/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter "@beomz-studio/temporal-worker..." build

CMD ["node", "workers/temporal/dist/worker.js"]
