# 세상을 비추는 달, LUNA

한국디지털미디어고등학교 IT 소셜벤처 동아리 LUNA 의 웹사이트입니다.
콘텐츠는 **Notion** 에서 관리하고, 일정 주기로 **PostgreSQL** 에 동기화한 뒤 **Next.js(React)** 가 DB 에서 읽어 화면을 렌더링합니다.

```
Notion (원본) ──(15분마다 동기화)──▶ PostgreSQL ──▶ Next.js (ISR 캐시) ──▶ 방문자
                 scheduler / cron                    동기화 시 캐시 무효화(SWR)
```

- 방문자 요청 시에는 Notion API 를 호출하지 않습니다. Notion 이 장애여도 DB 의 마지막 데이터로 정상 표시됩니다.
- **운영·테스트·배포 절차는 [docs/OPERATIONS.md](docs/OPERATIONS.md) 를 보세요.**
- 화면(UI)은 기존 정적 사이트(HTML/SCSS/jQuery)와 동일합니다. 기존 URL(`/member.html` 등)도 그대로 동작합니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | Next.js 16 (App Router), React 19, TypeScript, SCSS(원본 스타일 그대로) |
| DB | PostgreSQL 17, Drizzle ORM, postgres.js |
| 콘텐츠 원본 | Notion API (`Notion-Version: 2026-03-11`, data source query) |
| 이미지 | 동기화 시 sharp 로 WebP 변환 후 DB 저장 → `/media/<hash>.webp` (1년 immutable 캐시) |
| 3D | three.js r142 + @splinetool/loader (원본과 동일 버전, 지연 로딩) |
| 테스트 | Vitest(단위/통합, PGlite), Playwright(E2E) |

## Notion 구조

DIMIGO LUNA 'Notion API' 페이지의 데이터베이스(Members / Awards / Projects / FAQ)와 같은 구조를 읽습니다. 현재는 그 복사본(개인 워크스페이스 `메모장` 아래)에 연결되어 있으며, 원래 노션으로 바꾸는 방법은 [docs/OPERATIONS.md 2-1](docs/OPERATIONS.md) 을 참고하세요.

| 데이터베이스 | 화면 | 사용하는 열 |
|---|---|---|
| Members | /member | name, lunaGeneration(탭: 최신 기수부터), generation + class(소속), position, description, image |
| Awards | /award | name, year(연도 탭), prize, team, members(다중 선택), date(날짜 → "…하루동안" 문구), image |
| Projects | /project | name, year, description, image, awards |
| FAQ | /qna | question, answer, order |
| LUNA 사이트 설정 | 홈/업적/Q&A 문구 | 키, 값 (stats.projects, stats.contests, stats.prize, home.tags.1~3, qna.video_url) |

- 선택 열: `order`(숫자, 작은 값 먼저), `published`(체크박스, 해제하면 숨김). 없으면 전체 공개, 기본 정렬(멤버·프로젝트 이름순, 업적 최신 날짜순).
- 행 삭제(휴지통) → DB 에서 삭제 처리(soft delete), 복구하면 다시 표시.
- 필수값이 빠진 행(예: 이름 없음, 연도 범위 밖)은 건너뛰고 동기화 기록에 오류로 남습니다. 수정하면 다음 동기화에서 반영됩니다.

## 로컬 개발

```bash
npm install
cp .env.example .env.local      # 값 채우기 (NOTION_TOKEN 등은 .env 에 있어도 됨)

# PostgreSQL 이 없다면 내장 개발 DB(PGlite) 사용 — 별도 터미널에서 실행
npm run db:dev                  # postgres://postgres:postgres@127.0.0.1:54329/postgres
#   이 경우 .env.local 에 DATABASE_POOL_MAX=1, DATABASE_PREPARE=false 필수

npm run db:migrate              # 스키마 적용 (여러 번 실행해도 안전)
npm run sync -- --full          # Notion → DB 최초 전체 동기화
#   (Notion 없이 화면만 보려면: npm run db:seed — 기존 하드코딩 콘텐츠를 DB 에 넣음)

npm run dev                     # http://localhost:3000
```

## 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 서버 / 프로덕션 빌드 / 실행 |
| `npm run lint` / `typecheck` | ESLint / TypeScript 검사 |
| `npm test` | 단위 + 통합 테스트 (실제 PostgreSQL 엔진(PGlite) + 가짜 Notion API) |
| `npm run test:e2e` | Playwright E2E (서버 실행 중이어야 함, `E2E_BASE_URL` 로 대상 변경) |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:generate` | 스키마 변경 후 새 마이그레이션 생성 (`src/services/database/schema.ts` 수정 → 실행 → `drizzle/` 커밋) |
| `npm run db:seed` | 원본 하드코딩 콘텐츠로 DB 채우기 (Notion 데이터가 있는 컬렉션은 건드리지 않음) |
| `npm run sync` | 증분 동기화 (`-- --full` 전체) |
| `npm run sync:status` | 동기화 상태/최근 실행/오류 확인 |
| `npm run scheduler` | 상주형 정기 동기화 프로세스 |
| `npm run notion:discover` | 통합이 접근 가능한 데이터 소스와 환경변수 후보 출력 |
| `node --import tsx scripts/visual/capture-cli.ts <url> <dir> [--legacy]` / `npm run visual:compare -- <기준> <비교> <diff>` | 화면 캡처/비교 (UI 회귀 확인) |

## 환경변수

전체 목록과 설명은 [.env.example](.env.example) 참고. 실제 값은 `.env`/`.env.local`(git 제외) 또는 배포 플랫폼의 Secret 에만 넣습니다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 연결 문자열 |
| `NOTION_TOKEN` | 동기화 시 | Notion 통합 토큰 (서버 전용) |
| `NOTION_*_DATA_SOURCE_ID` | 동기화 시 | 컬렉션별 데이터 소스 ID. 비어 있는 컬렉션은 동기화하지 않음 |
| `SYNC_SECRET` | 운영 | `/api/cron/sync`, `/api/revalidate`, `/api/sync/status` 인증 (32자 이상) |
| `CRON_SECRET` | Vercel | Vercel Cron 인증 |
| `SYNC_INTERVAL_MINUTES` | | 스케줄러 주기 (기본 15) |
| `APP_URL` | 스케줄러 | 동기화 후 캐시 무효화를 요청할 앱 주소 |
| `ADMIN_PASSWORD` | | 설정 시 `/admin/sync` 관리 페이지 활성화 (Basic 인증, 12자 이상) |
| `SITE_URL` | | 운영 사이트 주소 — canonical/og:url. 미설정 시 출력하지 않음 |
| `SITE_HOST` | Traefik | `docker-compose.traefik.yml` 의 라우팅 도메인 |

## 배포

### A. Docker Compose (기존 GitLab CI + Traefik 서버)

```bash
cp .env.example .env            # POSTGRES_PASSWORD, NOTION_*, SYNC_SECRET, ADMIN_PASSWORD 등
docker compose up -d --build    # db → migrate(1회) → app → scheduler
# Traefik 환경 (SITE_HOST 필수): docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
# 다른 env 파일 사용: ENV_FILE=.env.prod docker compose --env-file .env.prod up -d
```

- `app`: Next.js standalone (포트 3000, `/api/health` 헬스체크)
- `scheduler`: 15분마다 Notion → DB 동기화 후 `app` 에 캐시 무효화 요청
- `migrate`: 시작 시 마이그레이션 1회 실행
- GitLab CI(`.gitlab-ci.yml`)는 app/worker 이미지를 빌드·푸시하고 compose 로 배포합니다. 비밀값은 GitLab CI/CD **File 변수 `LUNA_ENV_FILE`** 로 주입합니다.
- 스케줄러는 시작 즉시 첫 동기화를 실행합니다 (빈 DB 기준 약 45초). 수동 실행: `docker compose exec scheduler node dist/scripts/sync-notion.js --full`
- 이미지 크기: app 약 450MB, worker 약 400MB (워커는 번들된 스크립트 + sharp 만 포함)
- macOS 로컬에서 Docker Desktop 없이 테스트하려면: `brew install colima docker docker-compose docker-buildx && colima start --cpu 4 --memory 4`

### B. Vercel

- `vercel.json` 의 Cron 이 15분마다 `GET /api/cron/sync` 를 호출합니다 (`CRON_SECRET` 설정 필요). 주기는 `vercel.json` 에서 변경합니다.
- DB 는 외부 관리형 PostgreSQL(Neon, Supabase 등)을 사용하고 `DATABASE_URL` 을 설정합니다. pgbouncer(transaction) 경유 시 `DATABASE_PREPARE=false`.
- 서버리스 환경이므로 `scheduler` 프로세스는 사용하지 않습니다.

## 동기화 동작

- **초기 동기화**: 커서가 없으면 데이터 소스 전체를 조회합니다. 24시간마다 한 번은 안전망으로 전체 동기화합니다.
- **증분 동기화**: `last_edited_time >= 커서` 인 페이지만 조회합니다 (분 단위 절삭 대비 2분 여유). 내용 해시가 같으면 쓰지 않고, 이미지가 같으면 다시 받지 않습니다.
- **삭제 감지**: 매 실행마다 제목 속성만 받아 전체 목록을 비교합니다. 목록이 불완전하거나 0건이면(권한 해제 의심) 삭제를 보류합니다.
- **원자성**: 컬렉션 단위 트랜잭션. 실패한 컬렉션은 커서를 유지하고 다음 실행에서 재시도하며, 다른 컬렉션은 정상 반영됩니다.
- **중복 실행 방지**: DB 임대 잠금(`sync_locks`, TTL 15분). 동시에 호출되면 하나만 실행되고 나머지는 `skipped` 로 기록됩니다.
- **Rate limit**: 초당 2.5회 이하로 요청, 429/529 는 `Retry-After` 준수, 5xx·네트워크 오류는 지수 백오프 재시도.
- **수동 실행/모니터링**: `npm run sync`, `npm run sync:status`, `/admin/sync`(실행 버튼 포함), `GET /api/sync/status`(Bearer).

## 운영 참고

- **도메인 `luna.codes` 는 탈취되어 사용하지 않습니다.** 코드에 도메인을 하드코딩하지 않으며, 새 도메인은 `SITE_URL`/`SITE_HOST` 로만 지정합니다.
- ISR 캐시는 인스턴스의 로컬 파일시스템에 저장됩니다. 앱을 여러 인스턴스로 늘리면 공유 캐시 핸들러가 필요합니다.
- 원본 사이트가 의존하던 CDN(`fonts.2w.vc`, `npm.2w.vc`)은 DNS 가 사라져 접근할 수 없어, 폰트(SUIT)와 라이브러리를 모두 자체 포함했습니다.

## 라이선스

- 원본 저장소([LUNA-coding/luna-landing](https://github.com/LUNA-coding/luna-landing))에는 별도 LICENSE 파일이 없습니다. 콘텐츠·이미지의 저작권은 LUNA 에 있습니다 (© 2024 LUNA).
- SUIT 폰트: © SUNN, [SIL Open Font License 1.1](public/fonts/suit/OFL.txt)
