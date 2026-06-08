FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scheduler/package.json packages/scheduler/
RUN npm ci
COPY packages/shared/src packages/shared/src
COPY packages/scheduler/src packages/scheduler/src
CMD ["npx", "tsx", "packages/scheduler/src/index.ts"]
