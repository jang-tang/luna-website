# 작업 현황 (2026-10-31 기준)

저장소: <https://github.com/jang-tang/luna-website> (`main`) · 원본: `upstream` = LUNA-coding/luna-landing
최종 보고서: [docs/REPORT.md](REPORT.md) · 실행 방법: [README.md](../README.md)

## 완료

- React(Next.js 16) 이전, 원본 UI 보존 확인(3개 뷰포트 × 5페이지, Notion 데이터로 렌더링한 상태에서 비교)
- PostgreSQL 스키마/마이그레이션, Notion → DB 동기화(초기·증분·삭제·비공개·복구), 캐시 무효화
- **Notion 연결**: DIMIGO LUNA 'Notion API' 데이터베이스를 `메모장` 아래로 복사한 것(Members 75 · Awards 114 · Projects 72 · FAQ 6)에 연결, 2024~2026 자료 반영. 원래 노션 토큰을 받으면 OPERATIONS.md 2-1 절차로 전환
- 실제 Notion 전체/증분 동기화 및 수정 반영 확인
- Docker 이미지 빌드·compose 전체 실행 검증 완료 (colima). Dockerfile(app/worker), docker-compose(+Traefik 오버라이드), `.gitlab-ci.yml`, `vercel.json`, README, `.env.example`
- 보안 검토 완료 (REPORT.md J 절) — 관리자 액션 인증, DNS 리바인딩 차단, CSP/HSTS, 포트 바인딩 수정
- 검사: lint ✅ typecheck ✅ vitest 38 ✅ playwright 38 ✅ build(DB 유/무) ✅, DB 장애 시 서비스 유지 ✅

- **Vercel 배포 완료**: <https://luna-website-xi.vercel.app> (Neon DB, 운영 전체 동기화 272건 확인)

## 남은 일

1. 운영 서버 배포 + 비밀값 설정 (로컬 Docker(colima) 에서는 전체 검증 완료)
2. 새 도메인 결정 후 `SITE_URL`/`SITE_HOST` 설정 — `luna.codes` 는 탈취되어 사용 금지

## 로컬 환경 메모

- 개발 DB: `npm run db:dev` (PGlite, 데이터 `.pglite/`). `.env.local` 에 `DATABASE_POOL_MAX=1`, `DATABASE_PREPARE=false` 필요
- 화면 캡처는 `node --import tsx scripts/visual/capture-cli.ts ...` 로 직접 실행 (npm 경유 시 이 환경에서 headless 브라우저가 종료되는 현상)
- 동기화 오류 3건(현재): HEIC 사진 1건(JPG 로 재업로드 필요), Projects 의 빈 행 2건(삭제 필요)
- 로컬 Docker: `colima start` 후 `docker compose --env-file .env.docker up -d` (`.env.docker` 는 테스트용, gitignore). 끝나면 `docker compose down`, `colima stop`
