FROM node:20-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/usr/local/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && apk add --no-cache curl

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install

COPY . .

RUN pnpm --filter api build

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
