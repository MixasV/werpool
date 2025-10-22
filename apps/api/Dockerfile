# Build stage
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9.12.3

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY turbo.json tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY contracts ./contracts
COPY prisma ./prisma

RUN cd apps/api && pnpm prisma:generate
RUN pnpm build --filter=api

# Production stage
FROM node:20-alpine AS production

RUN npm install -g pnpm@9.12.3

RUN apk add --no-cache \
    ca-certificates \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY turbo.json ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY --from=builder /app/contracts ./contracts

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3333/health || exit 1

USER node

CMD ["node", "apps/api/dist/main.js"]
