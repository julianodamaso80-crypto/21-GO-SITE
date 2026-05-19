# Dockerfile do 21go-website (Next.js 15)
# - Inclui Chromium pra Puppeteer (gera PDF da simulacao)
# - Multi-stage: deps (todas) -> builder -> prod-deps -> runner
# - Imagem final só com prod deps (sem @xenova/transformers, xlsx, puppeteer full, etc)

# ====== Stage 1: deps (todas pra buildar) ======
FROM node:20-slim AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --include=dev

# ====== Stage 2: builder (next build) ======
FROM node:20-slim AS builder
WORKDIR /app

# Build args expostos como ENV pra Next inlinar NEXT_PUBLIC_* no bundle estatico.
# Sem isso, qualquer process.env.NEXT_PUBLIC_* sai como undefined no JS gerado.
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_META_PIXEL_ID_2
ARG NEXT_PUBLIC_GTM_ID
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID \
    NEXT_PUBLIC_META_PIXEL_ID_2=$NEXT_PUBLIC_META_PIXEL_ID_2 \
    NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ====== Stage 3: prod-deps (só dependencies, sem devDependencies) ======
FROM node:20-slim AS prod-deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --omit=dev

# ====== Stage 4: runner ======
FROM node:20-slim AS runner
WORKDIR /app

# Instala Chromium + libs necessarias (~250MB extra)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/next-sitemap.config.js ./next-sitemap.config.js
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
