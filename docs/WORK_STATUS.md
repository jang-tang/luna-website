# 작업 현황 (2026-10-31 기준)

브랜치: `feat/react-notion-db` — **아직 커밋하지 않음**
최종 보고서: [docs/REPORT.md](REPORT.md) · 실행 방법: [README.md](../README.md)

## 완료

- React(Next.js 16) 이전, 원본 UI 보존 확인(3개 뷰포트 × 5페이지, Notion 데이터로 렌더링한 상태에서 비교)
- PostgreSQL 스키마/마이그레이션, Notion → DB 동기화(초기·증분·삭제·비공개·복구), 캐시 무효화
- **실제 Notion 구성**: `메모장` 아래 DB 5개 생성 + 원본 콘텐츠 188건·이미지 175장 이전, 데이터 소스 ID 를 `.env` 에 기록
- 실제 Notion 전체/증분 동기화 및 수정 반영 확인
- Docker 이미지 빌드·compose 전체 실행 검증 완료 (colima). Dockerfile(app/worker), docker-compose(+Traefik 오버라이드), `.gitlab-ci.yml`, `vercel.json`, README, `.env.example`
- 검사: lint ✅ typecheck ✅ vitest 38 ✅ playwright 38 ✅ build(DB 유/무) ✅, DB 장애 시 서비스 유지 ✅

## 남은 일

1. 커밋 (사용자 확인 후). `.env`, `.env.local`, `.notion-bootstrap.json` 은 gitignore 됨
2. 운영 서버 배포 + 비밀값 설정 (로컬 Docker(colima) 에서는 전체 검증 완료)
3. 새 도메인 결정 후 `SITE_URL`/`SITE_HOST` 설정 — `luna.codes` 는 탈취되어 사용 금지

## 로컬 환경 메모

- 개발 DB: `npm run db:dev` (PGlite, 데이터 `.pglite/`). `.env.local` 에 `DATABASE_POOL_MAX=1`, `DATABASE_PREPARE=false` 필요
- 화면 캡처는 `node --import tsx scripts/visual/capture-cli.ts ...` 로 직접 실행 (npm 경유 시 이 환경에서 headless 브라우저가 종료되는 현상)
- `.notion-bootstrap.json`: 부트스트랩 진행 기록. 다시 실행해도 중복 생성되지 않음 (삭제하면 새로 만듦에 주의)
- 로컬 Docker: `colima start` 후 `docker compose --env-file .env.docker up -d` (`.env.docker` 는 테스트용, gitignore). 끝나면 `docker compose down`, `colima stop`
