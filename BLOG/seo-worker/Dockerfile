# =============================================================================
# Dockerfile — seo-worker (21Go)
# Stack: Node 20 + TypeScript (tsc -> dist) + Fastify + BullMQ + node-cron
# Imagem final: ~150MB (sem Chromium)
# =============================================================================

# ----- Stage 1: deps + build -----
FROM node:20-slim AS builder
WORKDIR /app

ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --include=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ----- Stage 2: prod deps -----
FROM node:20-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
# NAO usar --ignore-scripts: o @xenova/transformers depende de sharp,
# que precisa rodar postinstall pra baixar o binario linux-x64.
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --platform=linux --arch=x64

# ----- Stage 3: runner -----
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    NODE_NO_WARNINGS=1

# tini para reaper de zumbis e propagar SIGTERM corretamente
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# Usuario nao-root
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Cache writable pelo Xenova/transformers + tmp/migrations pelo user nao-root
RUN mkdir -p /app/node_modules/@xenova/transformers/.cache /home/app/.cache /app/migrations \
    && chown -R app:app /app /home/app

USER app
ENV TRANSFORMERS_CACHE=/home/app/.cache
EXPOSE 8080

# Healthcheck respondido por GET /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
