FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/news-worker/package.json packages/news-worker/
RUN npm ci
COPY packages/shared/src packages/shared/src
COPY packages/news-worker/src packages/news-worker/src
CMD ["npx", "tsx", "packages/news-worker/src/index.ts"]
