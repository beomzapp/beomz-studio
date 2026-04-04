FROM node:20-alpine
RUN npm install -g pnpm@9.15.4
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile --filter @beomz-studio/api...
RUN pnpm --filter @beomz-studio/api build
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
