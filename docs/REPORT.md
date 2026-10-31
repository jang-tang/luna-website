# LUNA 웹사이트 구축·리팩터링 완료 보고서

작성일: 2026-10-31 · 저장소: <https://github.com/jang-tang/luna-website> (`main`) · 원본: `LUNA-coding/luna-landing` @ `0e83cfa`

---

## A. 프로젝트 변경 사항

### 기존 기술 스택 (원본)

- 정적 HTML 5페이지 + SCSS(컴파일된 CSS 커밋) + jQuery 3.6, ScrollMagic 2.0.8, GSAP 2.1.3, three.js r142 + Spline 로더
- 콘텐츠: `data/*.js` 하드코딩 (멤버 54, 업적 73, 프로젝트 48, Q&A 6) + `img/` 로컬 이미지(39MB)
- 배포: `nginx-static` Docker 이미지, GitLab CI → Traefik (기존 도메인 `luna.codes` 는 탈취되어 더 이상 사용하지 않음)
- 백엔드·DB·캐싱 없음. 외부 CDN `fonts.2w.vc`, `npm.2w.vc` 의존 — **현재 두 도메인 모두 DNS 가 사라져 운영 사이트는 폰트·JS 가 로드되지 않는 상태였음**

### 변경 후

- **Next.js 16 (React 19, App Router) + TypeScript**, 원본 SCSS 를 그대로 사용 (선택자 1곳만 `[style='1']` → `[data-style='1']`, React 제약)
- **PostgreSQL + Drizzle ORM**, **Notion API → DB 동기화**, ISR 캐시 + 태그 무효화
- 배포: Docker 멀티스테이지(app / worker) + docker-compose(db, migrate, app, scheduler), Vercel Cron 대안

### 주요 파일

```text
src/
  app/[[...slug]]/page.tsx      모든 기존 URL 처리 (ISR)
  app/api/{cron/sync,revalidate,sync/status,health}/route.ts
  app/media/[file]/route.ts     동기화된 이미지 제공 (immutable 캐시)
  app/admin/sync/               운영자 동기화 상태·수동 실행 (Basic 인증)
  proxy.ts                      /admin 인증
  components/layout|home|pages  원본 DOM 과 동일한 React 컴포넌트
  lib/layout-script.ts          원본 jQuery 레이아웃(750px 스케일 등) 바닐라 이식
  services/notion/              client · properties · collections(매핑/검증) · images · sync · runner
  services/database/            client · schema · queries · sync-repository · migrate
  services/cache/               unstable_cache 래퍼 · 태그 · 무효화
  services/content/             View Model 타입 · 사이트 설정 기본값
  config/env.ts                 환경변수 검증(zod)
drizzle/0000_init.sql           마이그레이션
scripts/                        db-migrate · db-seed · dev-db · sync-notion · sync-status · scheduler
                                notion-discover · optimize-static-images · subset-fonts
                                visual/(capture, compare) · perf/summarize-lighthouse
tests/unit · tests/integration · tests/e2e
Dockerfile · docker-compose.yml · docker-compose.traefik.yml · .gitlab-ci.yml · vercel.json
```

### 제거/수정된 기존 기능

- 제거: `*.html` 5개, `js/utils.*.js`, `css/style.css(.map)` (git 이력에 보존). 기능은 React 로 동일하게 재구현
- 이동: `data/*.js` → `content/seed/` (시드/부트스트랩 원본), 콘텐츠 이미지 → `content/seed/images/`, 디자인 자산 → `public/`
- 정적 이미지 PNG → WebP(표시 크기 2배), SUIT 폰트 자체 호스팅(unicode-range 분할)
- 원본 Q&A 등은 HTML 문자열을 그대로 삽입(XSS 가능)했으나 React 텍스트 렌더링으로 변경 (표시 결과 동일)

---

## B. UI 보존 결과

- 방법: 원본(죽은 CDN 을 jsDelivr 동일 버전으로 대체해 의도된 디자인으로 실행)과 신규를 같은 뷰포트로 `#scroll` 을 한 화면씩 내리며 전 구간 캡처 + 모든 id 요소의 위치·크기·텍스트 시그니처 비교 (`scripts/visual/*`)
- 뷰포트: 데스크톱 1440×900, 태블릿 820×1180, 모바일 390×844(@2x)
- **Notion 에서 동기화된 데이터로 렌더링한 최종 결과**:

| 화면 | 데스크톱 | 태블릿 | 모바일 |
| --- | --- | --- | --- |
| 홈 | 레이아웃 차이 0 | 0 | 23 (아래 ①) |
| 멤버 | 0 | 0 | 0 |
| 업적 | 0 | 0 | 0 |
| 프로젝트 | 0 | 0 | 0 |
| Q&A (첫 항목 펼친 상태) | 0 | 0 | 0 |

- 전체 문서 높이(scrollHeight)와 요소 수가 15개 조합 모두 원본과 동일
- 픽셀 차이 0.0~0.2%: JPEG→WebP 재압축 노이즈, 글자 안티앨리어싱. 홈 1~3%: 무한 bounce 애니메이션의 캡처 시점 차이
- 인터랙션(E2E 로 검증): 탭 전환, Q&A 아코디언, "스크롤하여 더 알아보기" 부드러운 스크롤, 멤버/프로젝트 내비게이션 glass 전환, 홈 태그·업적 이미지 스크롤 패럴랙스, 3D 모델 마우스 회전, 750px 이하 스케일링

### 시각적으로 달라진 항목과 이유

1. 모바일 홈 태그 줄: **페이지를 끝까지 내렸다가 맨 위로 돌아온 경우에만** ±26px 위치 차이. 원본 ScrollMagic 이 body 축소 상태에서 스케일된 좌표와 스크롤 좌표를 섞어 100ms 마다 캐시하는 동작 차이이며, 첫 로드 상태는 동일
2. 폰트: 원본 운영 사이트는 CDN 소멸로 SUIT 대신 기본 폰트가 표시되고 있었음 → 원본 설계대로 SUIT 표시 (`font-display: swap`)
3. 3D 모델이 페이지 load 직후(유휴 시간)에 나타남 — 원본도 CDN 모듈 로딩 후 표시되던 것과 같은 흐름
4. 시도 후 철회: 3D 를 Web Worker 로 옮기는 최적화는 유리 구체 텍스처가 사라져 채택하지 않음

---

## C. DB 구축 결과

- **선택: PostgreSQL** — 기존 운영 서버(Docker + Traefik)에 컨테이너로 추가 가능, 영구 볼륨, 무료. Vercel 사용 시 관리형 PostgreSQL 로 그대로 이전 가능. 서버리스에서 영속성이 없는 SQLite 는 배제
- ORM: 기존 프로젝트에 없어 경량 **Drizzle**(SQL 친화, 마이그레이션 파일 생성) 도입

### 테이블

| 테이블 | 용도 | 주요 컬럼 |
| --- | --- | --- |
| members | 멤버 | name, generation, position, class_name, description, image_id |
| member_groups | 탭(기수) 순서 | name, sort_order (Notion select 옵션 순서) |
| awards | 업적 | year, name, prize, team, members, date_text, image_id |
| projects | 프로젝트 | year, name, description, awards(jsonb), image_id |
| qnas | Q&A | question, answer |
| site_settings | 화면 문구 설정 | key, value |
| media | 변환된 이미지 | id(sha256), source_key, content_type, width, height, data(bytea) |
| sync_state | 컬렉션별 커서 | cursor, last_success_at, last_full_sync_at, last_error |
| sync_runs | 실행 이력 | trigger, mode, status, stats(jsonb: 추가/수정/삭제/비공개/복구/실패), errors |
| sync_locks | 중복 실행 방지 | name, owner, locked_until (임대 잠금) |

- 콘텐츠 테이블 공통: `notion_page_id`(UNIQUE, upsert 기준), `sort_order`, `status`(published/hidden/deleted), `notion_last_edited_at`, `content_hash`, `deleted_at`, `created_at`, `updated_at`
- 인덱스: 목록 조회용 복합 인덱스 `(status, generation|year, sort_order)`, `media(source_key)`, `sync_runs(started_at)`, `(status, started_at)`
- 마이그레이션: `npm run db:migrate` (drizzle 이력 테이블로 재실행 안전). 스키마 변경 시 `schema.ts` 수정 → `npm run db:generate` → 생성된 SQL 검토·커밋

---

## D. Notion 연동 결과

- API: REST 직접 호출(fetch), `Notion-Version: 2026-03-11`, `POST /v1/data_sources/{id}/query` (2025-09-03 의 database/data source 분리 반영, `archived` → `in_trash`)
- 토큰은 서버(동기화 프로세스)에서만 사용. 브라우저·클라이언트 번들·로그에 노출되지 않음 (로그 마스킹 테스트 포함)
- **연결 대상**: DIMIGO LUNA 'Notion API' 페이지의 Members(75) · Awards(114) · Projects(72) · FAQ(6) 데이터베이스와 같은 구조. 현재 토큰은 개인 워크스페이스 소속이라 그 복사본(`메모장` 아래)에 연결되어 있고, 원래 노션 토큰을 받으면 토큰 + 데이터베이스 ID 4개만 바꾸면 됨 (OPERATIONS.md 2-1). 2017~2026 자료 반영 확인

| Notion DB | 화면 컴포넌트 | 속성 |
| --- | --- | --- |
| Members | MemberList (탭 = lunaGeneration, 최신 기수부터) | name, lunaGeneration, generation·class(→ "25기 웹프로그래밍과"), position, description, image |
| Awards | AwardList (연도 탭) | name, year(select), prize, team, members(multi-select → "a,b"), date(→ "YYYY년 MM월 DD일 하루동안"), image |
| Projects | ProjectPage (연도 탭 + 상단 제목) | name, year(select), description, image, awards(multi-select) |
| FAQ | QnaList | question, answer, order |
| LUNA 사이트 설정 | 홈(프로젝트 수·대회 수·상금·태그), 업적 상단, Q&A 영상 | 키, 값 |

- 초기 동기화: 커서가 없거나 `--full` 이면 전체 조회. 실측: 188건 + 이미지 175장, Notion 요청 6회, 65초
- 증분 동기화: `last_edited_time on_or_after (커서)` 필터. Notion 시각이 분 단위로 절삭되므로 커서 = 실행 시작 분 − 2분, 중복 조회분은 content_hash 로 쓰기 생략. 실측: 변경 없음 4.8초(이미지 재다운로드 없음), 실제 Notion 수정 1건 반영 확인
- 삭제/비활성:
  - `공개` 해제 → `hidden` (데이터 유지, 화면 비노출)
  - 휴지통/삭제/공유 해제 → 매 실행 제목만 받는 전체 목록과 비교해 `deleted`(soft delete)
  - 휴지통 복구 → 목록에 다시 나타나면 개별 조회 후 `restored`
  - 목록이 10,000건 상한에 걸리거나 0건이면 삭제 보류(권한 해제 등으로 인한 대량 삭제 방지)
- 25조각 초과로 잘린 텍스트는 property item API 로 전체 조회, 이미지 URL(1시간 만료)은 동기화 시 내려받아 WebP 로 DB 저장

---

## E. 자동 동기화 결과

- 기본 주기: **15분** (`SYNC_INTERVAL_MINUTES`)
- Docker/서버: `scheduler` 컨테이너(상주 프로세스)가 주기마다 동기화 → 변경 컬렉션만 앱에 `POST /api/revalidate` (Bearer `SYNC_SECRET`). 웹 서버와 분리되어 이미지 변환 부하가 사용자 요청에 영향 없음
- Vercel: `vercel.json` Cron → `GET /api/cron/sync` (Bearer `CRON_SECRET`), 서버 내부 setInterval 미사용
- 수동 실행: `npm run sync [-- --full]`, `/admin/sync` 버튼, `POST /api/cron/sync?mode=full` (Bearer)
- 모니터링: `npm run sync:status`, `/admin/sync`, `GET /api/sync/status` — 마지막 시작/성공 시각, 결과, 추가/수정/삭제/비공개/복구/실패 수, 오류 내역
- 실패/재시도: 요청 단위(429/529 Retry-After, 5xx·네트워크 지수 백오프+지터, 20초 타임아웃) → 컬렉션 단위 트랜잭션(실패 시 커서 유지, 다음 주기 재시도) → 이미지 실패 시 기존 이미지 유지 후 재시도. 다른 컬렉션은 정상 반영
- 중복 실행 방지: DB 임대 잠금(TTL 15분, 프로세스가 죽어도 자동 해제), 동시 호출은 `skipped` 기록

---

## F. 성능 최적화 결과

측정: Lighthouse 13.6 (로컬, 모바일=느린 4G·CPU 4배 시뮬레이션). 원본은 python http.server(무압축) + jsDelivr 대체 CDN, 신규는 Next.js standalone(gzip).

| 측정 항목 | 개선 전 (원본) | 개선 후 |
| --- | ---: | ---: |
| LCP (모바일, 홈/멤버/업적/프로젝트/Q&A) | 27.8s / 11.5s / 15.4s / 22.1s / 6.3s | 0.91s / 0.91s / 0.91s / 0.91s / 1.87s |
| LCP (데스크톱, 홈) | 4.28s | 0.25s |
| CLS | 0 | 0 ~ 0.003 |
| INP | 측정 불가 (실험실 환경) | 측정 불가 — 대체 지표 TBT: 멤버·업적·프로젝트·Q&A 0~13ms, 홈 2,175ms(원본 2,370ms) |
| FCP (모바일) | 1.85 ~ 1.94s | 0.91s (Q&A 1.87s) |
| TTFB | 1 ~ 15ms (로컬 정적 서버) | 2 ~ 14ms (ISR 캐시 HIT) — 로컬이라 비교 의미 제한적 |
| JS Bundle | 홈 420KB, Q&A 963KB(유튜브 포함) | 홈 초기 176KB(gzip), three.js+Spline 은 load 후 지연 로딩 |
| 총 전송량 (모바일, 홈/멤버/업적/프로젝트) | 5.6MB / 3.4MB / 4.6MB / 4.2MB | 1.5MB / 0.96MB / 1.6MB / 1.1MB |
| DB Query (페이지당, 로컬 PGlite) | 해당 없음 | 중앙값 0.4~0.9ms, p95 ≤ 1.5ms (ISR 캐시 적중 시 DB 미조회) |
| 이미지 (실제 노션 자료) | 원본 사진 최대 31MB/장 | 멤버 평균 11KB · 업적 평균 53KB · 프로젝트 평균 6KB (WebP) |

> 실제 노션 자료(멤버 75 · 업적 114 · 프로젝트 70)로 다시 측정한 결과도 같은 수준: 모바일 LCP 0.91초(홈·멤버·업적·프로젝트), Q&A 2.05초(유튜브 영상), CLS ≤ 0.003, 멤버·업적·프로젝트 TBT 7~14ms.

주요 개선 요인: 원본 이미지(최대 2MB/장) → 표시 크기 2배 WebP, jQuery·ScrollMagic·GSAP 제거, 콘텐츠를 서버에서 미리 렌더링(원본은 JS 실행 후 DOM 생성), 히어로 배경 preload, 3D 지연 로딩, 정적 자산·미디어 장기 캐시.
남은 병목: 홈 3D 모델 파싱·셰이더 컴파일(약 3초, 모바일 CPU 4배 감속 기준) — UI 보존을 위해 유지. Q&A 는 유튜브 iframe(약 1MB)이 대부분.

---

## G. 테스트 결과 (모두 실제 실행)

| 항목 | 결과 |
| --- | --- |
| Build (`npm run build`, DB 있음/없음 두 경우) | ✅ |
| Lint (`eslint .`) | ✅ |
| Type Check (`tsc --noEmit`) | ✅ |
| Unit Test (25개: 속성 파서, 설정/유튜브 URL 검증, Notion 클라이언트 재시도·페이지네이션, 이미지 변환·SSRF 차단, 로그 마스킹, 인증) | ✅ 25/25 |
| Integration Test (13개: 실제 PostgreSQL 엔진 + 가짜 Notion API — 초기/증분/수정/비공개/삭제/복구/분 단위 수정/검증 실패/Notion 장애 격리/대량 삭제 보류/이미지 재시도/동시 실행/시드 정리/잘린 텍스트/미디어 정리) | ✅ 13/13 |
| E2E (Playwright, 데스크톱+모바일 38개: 전 페이지·라우팅·404·스케일·탭·아코디언·스크롤·glass·3D·API 401·관리자 인증·헬스·미디어 캐시·보안 헤더) | ✅ 38/38 |
| 실제 Notion API: 인증, DB 생성·이전(188건), 전체 동기화, 증분 동기화, 실제 수정 반영 후 원복 | ✅ |
| 캐시 무효화 (DB 변경 → 무효화 → SWR 로 다음 요청에 반영) | ✅ |
| DB 장애 시 서비스 (DB 중지 상태에서 전 페이지·이미지 200, 무효화 후에도 마지막 정상 페이지 유지, 헬스 503, DB 복구 후 자동 회복) | ✅ |
| 스케줄러 (번들 실행, 1주기 동기화 + 무효화 요청 + SIGTERM 정상 종료) | ✅ |
| 화면 비교 (3개 뷰포트 × 5페이지) | ✅ (B 절의 알려진 차이 1건) |
| Docker 이미지 빌드 (colima + Docker 29.5, app 451MB / worker 395MB) | ✅ |
| docker compose 전체 실행 (빈 볼륨 → migrate → app healthy → scheduler 첫 동기화 188건·이미지 130장, 실제 PostgreSQL 17) | ✅ |
| Docker 앱 대상 E2E 38개 / 화면 비교(레이아웃 차이 0, 모바일 홈 예외 동일) | ✅ |
| 컨테이너 간 캐시 무효화(scheduler → app), 동시 실행 잠금(수동 실행이 skipped) | ✅ |
| Traefik 오버라이드 설정 검증(`docker compose config`, SITE_HOST 누락 시 거부) | ✅ |
| GitLab CI 배포 | ❌ 미실행 (운영 서버 접근 없음) |

---

## H. 직접 해야 할 작업

1. **운영 서버 배포**: 로컬 Docker(colima)에서는 전체 검증 완료. 운영 서버에서 `docker compose up -d --build` 또는 GitLab CI 로 배포
2. **운영 비밀값 설정** (GitLab CI/CD File 변수 `LUNA_ENV_FILE` 또는 서버 `.env`):
   `POSTGRES_PASSWORD`, `NOTION_TOKEN`, `NOTION_*_DATA_SOURCE_ID` 5개(로컬 `.env` 값과 동일), `SYNC_SECRET`(`openssl rand -hex 32`), `ADMIN_PASSWORD`
3. **새 도메인 연결**: `luna.codes` 는 탈취되어 사용하지 않음(코드·설정에서 모두 제거). 새 도메인을 정하면 `SITE_URL`, `SITE_HOST` 설정
4. Vercel 로 배포할 경우: 관리형 PostgreSQL 생성 후 `DATABASE_URL`, `CRON_SECRET` 설정 (유료 인프라는 승인 없이 만들지 않았음)
5. (선택) Notion 통합 권한을 `메모장` 전체가 아니라 LUNA 데이터베이스 5개에만 공유하도록 좁히기 — 현재 통합은 개인 페이지 92개에도 접근 가능

---

## I. 최종 실행 가이드

```bash
# 1) 로컬 개발
npm install
npm run db:dev                       # (PostgreSQL 이 없을 때) 별도 터미널
npm run db:migrate
npm run sync -- --full               # Notion → DB 최초 동기화 (.env 의 NOTION_* 사용)
npm run dev                          # http://localhost:3000

# 2) 품질 검사
npm run lint && npm run typecheck && npm test
npm run build && npm run start       # 별도 터미널
npm run test:e2e

# 3) 정기 동기화
npm run scheduler                    # 서버 상주 (Docker 에서는 scheduler 서비스가 담당)
npm run sync:status                  # 상태 확인

# 4) 운영 배포 (Docker Compose)
cp .env.example .env                 # 값 채우기
docker compose up -d --build         # db → migrate → app → scheduler
# scheduler 가 시작 즉시 첫 동기화 실행 (수동: docker compose exec scheduler node dist/scripts/sync-notion.js --full)
# Traefik 서버: SITE_HOST=<새 도메인> docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
# GitLab: main 에 푸시 → .gitlab-ci.yml 이 app/worker 이미지 빌드·푸시·배포
```

---

## J. 보안 검토 결과 (2026-10-31)

| 구분 | 점검 내용 | 결과 |
| --- | --- | --- |
| 비밀값 | 깃허브에 올라간 커밋 이력 전체에서 Notion 토큰·동기화 키·관리자 비밀번호·DB 비밀번호 검색 | 없음 ✅ (`.env*` 는 git 제외, `.env.example` 만 추적) |
| 의존성 | `npm audit` (운영 서버에 들어가는 패키지) | 취약점 0건 ✅ |
| 의존성 | `npm audit` (개발용 도구 포함) | 중간 19건 — esbuild·minimatch 등 개발 도구 전용, 운영 이미지에 포함되지 않음 (위험 낮음) |
| 관리자 기능 | 수동 동기화 서버 액션이 로그인 헤더 "존재 여부"만 확인 → `/admin` 밖 경로로 호출 시 우회 가능성 | **수정** — 액션 안에서도 아이디·비밀번호를 상수 시간 비교로 직접 검증. 가짜 로그인으로 `/`, `/member` 에 호출해도 실행되지 않음을 확인 |
| SSRF | 이미지 다운로드가 주소 문자열만 검사 → 도메인이 내부 IP 로 풀리는 경우(DNS 리바인딩) 미차단 | **수정** — 실제 DNS 조회 결과가 사설·루프백·메타데이터 대역이면 차단, 리다이렉트마다 재검사 |
| 보안 헤더 | 클릭재킹·플러그인·base 태그·외부 폼 전송 제한, HTTPS 강제 | **추가** — CSP(frame-ancestors, object-src, base-uri, form-action, frame-src 유튜브만), HSTS |
| 네트워크 노출 | docker-compose 가 앱 포트를 서버 모든 인터페이스(HTTP)로 공개 | **수정** — 기본 `127.0.0.1` 바인딩, 리버스 프록시(HTTPS) 경유 공개 (`APP_BIND` 로 변경 가능) |
| 인증 키 | Vercel `CRON_SECRET` 최소 길이 검증 없음 | **수정** — 16자 이상 강제 (`SYNC_SECRET` 32자, 관리자 비밀번호 12자 이상은 기존부터 강제) |
| XSS | 원시 HTML 삽입은 고정 레이아웃 스크립트 1곳뿐, 노션 텍스트는 모두 React 이스케이프, 유튜브 주소는 화이트리스트 검증 | 이상 없음 ✅ |
| SQL 인젝션 | 모든 쿼리 파라미터 바인딩, `sql.raw` 는 코드 상수(컬럼명)에만 사용 | 이상 없음 ✅ |
| API | 동기화·무효화·상태 API 는 Bearer 인증(상수 시간 비교), 오류 응답에 내부 정보 미노출, 로그에서 토큰·비밀번호·서명 URL 마스킹 | 이상 없음 ✅ |
| 컨테이너 | 앱·워커 모두 root 가 아닌 사용자로 실행, DB 포트 외부 미노출 | 이상 없음 ✅ |
| 장애 시 데이터 보호 | 노션 DB 가 삭제·권한 해제돼도 기존 데이터 유지 (실제로 'LUNA 사이트 설정' 삭제 상황에서 확인) | 이상 없음 ✅ |

### 운영자 권장 사항

- 관리자 비밀번호는 무작위 12자 이상으로 하고, 가능하면 리버스 프록시(Traefik/Nginx)에서 `/admin` 경로에 IP 제한이나 요청 횟수 제한을 거세요 (앱 자체에는 로그인 시도 횟수 제한이 없음).
- Notion 통합(new_site)은 현재 개인 워크스페이스 전체를 볼 수 있습니다. 사이트용 데이터베이스 4개만 공유하도록 좁히세요.
- 토큰 유출이 의심되면 Notion 개발자 포털에서 토큰을 재발급하고 `.env` 들을 교체하세요.
