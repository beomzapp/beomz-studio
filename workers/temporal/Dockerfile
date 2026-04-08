FROM node:20-alpine
WORKDIR /app
COPY dist ./dist
COPY package.json ./package.json
CMD ["node", "dist/worker.js"]
