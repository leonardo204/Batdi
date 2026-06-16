# 밧디 KBO 크롤러 — 전용 컨테이너 (batdi-kbo-crawler)
# Playwright 공식 이미지(chromium + 시스템 의존 사전설치). 앱의 playwright 버전과 일치(1.61.0).
# 빌드 컨텍스트 = 레포 루트(monorepo). HTTP 서버 없이 crawler-main 만 실행.
#
# ⚠️ @batdi/types 는 type-only 라 크롤러 런타임 그래프(kbo+prisma)에 런타임 의존 없음.
#    런타임 의존: @nestjs/*, @prisma/client, playwright, cheerio, reflect-metadata, rxjs.
FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

# corepack 으로 pnpm 활성화 (lockfile 버전과 일치)
RUN corepack enable && corepack prepare pnpm@10.6.4 --activate

# 워크스페이스 매니페스트 먼저 복사 → 의존성 레이어 캐시
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/a2ui-schema/package.json packages/a2ui-schema/
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/

# 전체 워크스페이스 의존성 설치 (lockfile 고정)
RUN pnpm install --frozen-lockfile

# 소스 복사 후 prisma 클라이언트 생성 + api 빌드 (nest build → apps/api/dist)
COPY . .
RUN pnpm --filter @batdi/api exec prisma generate \
 && pnpm --filter @batdi/api exec nest build

ENV NODE_ENV=production
ENV KBO_CRAWLER_ENABLED=true

# 시작: 마이그레이션 보정(idempotent) 후 standalone 크롤러 기동.
CMD ["sh", "-c", "pnpm --filter @batdi/api exec prisma migrate deploy && node apps/api/dist/kbo/crawler-main.js"]
