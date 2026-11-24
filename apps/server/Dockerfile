# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @numera/shared build \
  && pnpm --filter @numera/server build

FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --filter @numera/server...

COPY --from=build /app/packages/shared/src packages/shared/src
COPY --from=build /app/apps/server/dist apps/server/dist

WORKDIR /app/apps/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
