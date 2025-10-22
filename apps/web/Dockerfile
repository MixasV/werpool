# Build stage
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9.12.3

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY turbo.json tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_WS_BASE_URL
ARG NEXT_PUBLIC_FLOW_NETWORK
ARG NEXT_PUBLIC_FLOW_ACCESS_NODE
ARG NEXT_PUBLIC_FLOW_WALLET_URL

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WS_BASE_URL=$NEXT_PUBLIC_WS_BASE_URL
ENV NEXT_PUBLIC_FLOW_NETWORK=$NEXT_PUBLIC_FLOW_NETWORK
ENV NEXT_PUBLIC_FLOW_ACCESS_NODE=$NEXT_PUBLIC_FLOW_ACCESS_NODE
ENV NEXT_PUBLIC_FLOW_WALLET_URL=$NEXT_PUBLIC_FLOW_WALLET_URL

RUN pnpm build --filter=web

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
COPY apps/web/package.json ./apps/web/
COPY turbo.json ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.js ./apps/web/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

USER node

CMD ["pnpm", "--filter=web", "start"]
