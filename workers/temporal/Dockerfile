FROM node:20-alpine
WORKDIR /app
COPY workers/temporal/dist ./dist
COPY workers/temporal/package.json ./package.json
CMD ["node", "dist/worker.js"]
