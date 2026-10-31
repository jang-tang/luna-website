# syntax=docker/dockerfile:1
# LUNA website — Next.js(standalone) 앱 + 동기화 워커(스케줄러/마이그레이션) 이미지
#   docker build --target app    -t luna-app .
#   docker build --target worker -t luna-worker .

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- 의존성 ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# 워커 스크립트는 esbuild 로 번들되므로 네이티브 모듈 sharp 만 설치한다 (버전은 package.json 과 동일)
FROM base AS worker-deps
COPY package.json ./package.app.json
RUN npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "sharp@$(node -p "require('./package.app.json').dependencies.sharp")"

# ---- 빌드 ----
# 빌드 시점에는 DB 가 없으므로 페이지는 첫 요청 시 렌더링 후 ISR 캐시된다 (src/app/[[...slug]]/page.tsx).
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

# ---- 웹 앱 ----
FROM base AS app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ---- 동기화 워커 (scheduler / db-migrate / sync / sync-status) ----
FROM base AS worker
ENV NODE_ENV=production
RUN groupadd --system app && useradd --system --gid app app
COPY --from=worker-deps /app/node_modules ./node_modules
COPY --from=build /app/dist/scripts ./dist/scripts
COPY --from=build /app/drizzle ./drizzle
USER app
CMD ["node", "dist/scripts/scheduler.js"]
