FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/photo-worker/package.json packages/photo-worker/
RUN npm ci
COPY packages/shared/src packages/shared/src
COPY packages/photo-worker/src packages/photo-worker/src
CMD ["npx", "tsx", "packages/photo-worker/src/index.ts"]
