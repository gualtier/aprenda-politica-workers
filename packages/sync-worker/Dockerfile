FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/sync-worker/package.json packages/sync-worker/
RUN npm ci
COPY packages/shared/src packages/shared/src
COPY packages/sync-worker/src packages/sync-worker/src
CMD ["npx", "tsx", "packages/sync-worker/src/index.ts"]
