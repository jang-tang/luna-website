# LUNA 웹사이트 운영 가이드

이 문서는 사이트를 **로컬에서 실행하고, 콘텐츠를 관리하고, 테스트하고, 배포할 때** 따라 하면 되는 순서를 정리한 것입니다.
기술 구조가 궁금하면 [README.md](../README.md), 작업 결과 보고는 [REPORT.md](REPORT.md) 를 보세요.

---

## 0. 한눈에 보기

```
Notion(콘텐츠 수정) ──15분마다──▶ DB(PostgreSQL) ──▶ 웹사이트
```

- **콘텐츠 수정은 Notion 에서만** 합니다. 코드를 고칠 필요가 없습니다.
- 수정 내용은 **최대 15분 뒤** 사이트에 반영됩니다. 급하면 수동 동기화를 실행합니다 (3-3).
- 사이트는 DB 를 읽어 화면을 그립니다. Notion 이 잠시 장애여도 사이트는 마지막 데이터로 계속 동작합니다.

| 하고 싶은 일 | 바로 가기 |
|---|---|
| 내 컴퓨터에서 사이트 띄워보기 | [1. 로컬 실행](#1-로컬에서-실행하기) |
| 멤버/업적/프로젝트/Q&A 수정 | [2. 콘텐츠 관리](#2-콘텐츠-관리-notion) |
| 동기화 상태 확인, 바로 반영 | [3. 동기화 확인·수동 실행](#3-동기화-확인과-수동-실행) |
| 코드 수정 후 검사 | [4. 테스트](#4-테스트) |
| 서버에 배포 | [5. 배포](#5-배포) |
| 문제가 생겼을 때 | [6. 문제 해결](#6-문제-해결) |

---

## 1. 로컬에서 실행하기

### 1-1. 처음 한 번만 준비

필요한 것: Node.js 22 이상, (방법 B 를 쓸 경우) Docker

```bash
cd /Users/taewoongjang/LUNA/luna-website
npm install
```

**환경변수 파일** — 이 컴퓨터에는 이미 만들어져 있습니다.

| 파일 | 용도 | 내용 |
|---|---|---|
| `.env` | 공통 | `NOTION_TOKEN`, Notion 데이터베이스 ID 5개 |
| `.env.local` | 로컬 개발 | DB 주소, `SYNC_SECRET`, 관리자 계정 등 |
| `.env.docker` | 로컬 Docker 테스트 | 위 값 + Docker 용 비밀번호 |

> 세 파일 모두 git 에 올라가지 않습니다. **다른 컴퓨터에서 새로 받았다면** `.env.example` 을 복사해 `.env.local` 을 만들고 값을 채우세요.
> 비밀값 만들기: `openssl rand -hex 32`

### 1-2. 방법 A — 가장 간단한 방법 (Docker 없이)

PostgreSQL 대신 내장 개발용 DB(PGlite)를 씁니다. **터미널 2개**가 필요합니다.

```bash
# 터미널 1: 개발용 DB 켜기 (켜둔 채로 두기)
npm run db:dev
# → PGlite listening: postgres://postgres:postgres@127.0.0.1:54329/postgres
```

```bash
# 터미널 2
npm run db:migrate          # DB 테이블 만들기 (여러 번 실행해도 안전)
npm run sync -- --full      # Notion 내용을 DB 로 가져오기 (처음 1분 정도)
npm run dev                 # 개발 서버 실행

npm run db:migrate          
npm run sync -- --full      
npm run dev 
```

브라우저에서 http://localhost:3000 접속.

- 개발 DB 데이터는 `.pglite/` 폴더에 저장되어 다음에 켜도 남아 있습니다. 처음부터 다시 하고 싶으면 DB 를 끄고 `.pglite/` 폴더를 지우세요.
- `.env.local` 에 `DATABASE_POOL_MAX=1`, `DATABASE_PREPARE=false` 가 꼭 있어야 합니다 (개발 DB 의 제약, 이미 설정됨).
- Notion 없이 화면만 보고 싶으면 `npm run sync` 대신 `npm run db:seed` (원본 사이트의 하드코딩 콘텐츠로 채움).

**실제 운영과 같은 모드로 보기** (개발 모드는 매 요청마다 새로 그려서 느립니다):

```bash
npm run build
npm run start               # http://localhost:3000
```

### 1-3. 방법 B — 운영과 똑같이 (Docker)

실제 서버와 같은 구성(PostgreSQL + 앱 + 스케줄러)으로 띄웁니다. 배포 전 최종 확인용으로 권장합니다.

```bash
colima start --cpu 4 --memory 4                      # Docker 엔진 켜기 (맥 재부팅 후 1회)
docker compose --env-file .env.docker up -d --build  # 빌드 + 실행 (첫 빌드 약 3~4분)
docker compose --env-file .env.docker ps             # 상태 확인
```

- 스케줄러가 켜지자마자 Notion 동기화를 시작합니다 (약 45초). 그 뒤 http://localhost:3000 접속.
- 로그 보기: `docker compose --env-file .env.docker logs -f scheduler` (또는 `app`)
- 끄기:
  ```bash
  docker compose --env-file .env.docker down        # 컨테이너 종료 (DB 데이터는 유지)
  docker compose --env-file .env.docker down -v     # DB 데이터까지 삭제
  colima stop                                        # Docker 엔진 끄기 (메모리 확보)
  ```

> 방법 A 의 `npm run dev`/`start` 와 방법 B 는 둘 다 3000 포트를 씁니다. **동시에 켜지 마세요.**

### 1-4. 관리 페이지

http://localhost:3000/admin/sync — 아이디/비밀번호는 `.env.local`(방법 B 는 `.env.docker`)의 `ADMIN_USER`, `ADMIN_PASSWORD`.
동기화 상태, 최근 실행 기록, 오류, **수동 동기화 버튼**이 있습니다.

---

## 2. 콘텐츠 관리 (Notion)

사이트는 DIMIGO LUNA 의 'Notion API' 페이지에 있는 데이터베이스와 **같은 구조**를 읽습니다.
지금은 그 데이터베이스를 개인 워크스페이스 **`메모장` 아래로 복사한 것**에 연결되어 있습니다 (원래 노션으로 바꾸는 방법은 2-1).

| 데이터베이스 | 사이트 위치 | 사용하는 열 |
|---|---|---|
| Members (1) | 멤버 페이지 | name, lunaGeneration(탭), generation·class(소속 표시), position, description, image |
| Awards (1) | 업적 페이지 | name, year(연도 탭), prize, team, members, date, image |
| Projects (1) | 프로젝트 페이지 | name, year(연도 탭), description, image (awards 는 저장만 하고 화면에는 표시 안 함) |
| FAQ (1) | Q&A 페이지 | question, answer, order |
| LUNA 사이트 설정 | 홈의 숫자·태그, 업적 상단 문구, Q&A 영상 | 키, 값 (설명·순서·공개는 참고용) |

### 이렇게 하면 됩니다

| 하고 싶은 일 | Notion 에서 할 일 |
|---|---|
| 새 멤버/업적/프로젝트 추가 | 해당 데이터베이스에 새 행 추가 (기본적으로 바로 공개됨) |
| 내용 수정 | 해당 행을 그냥 수정 |
| 잠깐 숨기기 | 데이터베이스에 체크박스 열 `published` 를 만들고, 숨길 행만 체크 해제 (열이 없으면 전부 공개) |
| 완전히 삭제 | 행 삭제 (휴지통에서 복구하면 다시 나타남) |
| 순서 바꾸기 | 숫자 열 `order` 를 만들어 입력 (작은 숫자가 먼저). 없으면 멤버·프로젝트는 이름순, 업적은 최신 날짜순, Q&A 는 기존 `order` 순 |
| 사진 바꾸기 | image 칸에 파일 업로드 (첫 번째 파일만 사용, **JPG/PNG/WebP 권장**) |
| 새 기수 탭 추가 (예: LUNA 10기) | Members 의 `lunaGeneration` 에 "LUNA 10기" 선택지 추가 → 탭은 숫자가 큰 기수부터 자동 정렬, 명예 멤버는 맨 뒤 |
| 업적 날짜 | `date` 에 날짜 입력. 하루짜리는 "2025년 07월 18일 하루동안", 기간이면 "…부터 닷새동안" 처럼 자동 변환 |
| 홈의 "N개의 프로젝트" | 'LUNA 사이트 설정' 의 `stats.projects` 행의 **값** 수정 (예: 72) |
| 홈·업적의 "N개의 대회" | `stats.contests` 값 수정 (예: 114) |
| 홈·업적의 상금 총액 | `stats.prize` 값 수정 (예: 7,500만원 → 화면에는 "7,500만원 이상") |
| 홈의 흐르는 태그 3줄 | `home.tags.1`, `home.tags.2`, `home.tags.3` 값 수정 (쉼표로 구분) |
| Q&A 영상 | `qna.video_url` 값 수정 (유튜브 주소만 허용, 다른 주소는 무시되고 기본 영상 사용) |

### 주의할 점

- **열 이름을 바꾸거나 지우지 마세요.** (name, year, lunaGeneration 등) 이름이 바뀌면 동기화가 그 데이터를 읽지 못합니다.
- 필수값(name/question, 업적·프로젝트의 year, 멤버의 lunaGeneration)이 비어 있으면 그 행만 반영되지 않고 동기화 기록에 오류로 남습니다. **빈 행은 지워 주세요.**
- **아이폰 사진(HEIC)은 변환되지 않습니다.** JPG 나 PNG 로 다시 올려 주세요. (현재 '모두의 창업 경기 비즈쿨 중고등 창업캠프' 업적 사진이 HEIC 라 사진 없이 표시됨)
- 사진 파일은 64MB 까지 받을 수 있습니다. 사이트에는 작게 변환해서 저장하므로 원본 크기는 화면 속도에 영향이 없습니다.
- Notion 통합(new_site)과의 **공유를 끊으면** 동기화가 멈춥니다. 이때 사이트 데이터가 지워지지는 않습니다 (안전장치).
- **'LUNA 사이트 설정'** 은 `메모장` 아래에 있습니다. `키` 열의 이름(stats.projects 등)은 바꾸지 말고 **값** 만 고치세요. 값을 비우거나 행을 지우면 원본 기본값(72개 · 114개 · 7,500만원)을 씁니다.
- 사이트 설정 데이터베이스를 실수로 지웠다면: 노션 휴지통에서 복구하거나, `.env` 의 `NOTION_SETTINGS_DATA_SOURCE_ID` 를 비운 뒤 `npm run notion:create-settings -- --parent <부모 페이지 주소> --write-env` 로 다시 만드세요 (기본값이 채워진 상태로 생성).

### 2-1. 원래 루나 노션(DIMIGO LUNA)으로 연결 바꾸기

DIMIGO LUNA 관리자에게 'API 토큰' 방식 연결을 받았다면, **토큰만 바꾸면 되는 것이 아니라 데이터베이스 ID 도 바꿔야 합니다.** (복사본과 원본은 서로 다른 데이터베이스라 ID 가 다릅니다.) 열 구조는 같으므로 코드 수정은 필요 없습니다.

1. 관리자가 'Notion API' 페이지 → 점 세 개 → 연결 → 새 연결을 추가했는지 확인
2. `.env` 의 `NOTION_TOKEN` 을 새 토큰으로 교체
3. 데이터베이스 ID 찾기:
   ```bash
   npm run notion:discover
   ```
   출력된 `NOTION_MEMBERS_…`, `NOTION_AWARDS_…`, `NOTION_PROJECTS_…`, `NOTION_QNA_…` 4줄을 `.env` 에 반영
4. 사이트 설정: 새 토큰은 개인 워크스페이스의 'LUNA 사이트 설정' 을 볼 수 없습니다. `.env` 의 `NOTION_SETTINGS_DATA_SOURCE_ID` 를 비운 뒤, 루나 노션의 'Notion API' 페이지 아래에 새로 만드세요:
   ```bash
   npm run notion:create-settings -- --parent <'Notion API' 페이지 주소> --write-env
   ```
   (만들지 않고 비워 두면 원본 기본값을 씁니다)
5. 전체 동기화:
   ```bash
   npm run sync -- --full
   ```
   복사본에서 가져온 행은 자동으로 정리되고 원본 데이터로 교체됩니다.
6. 운영 서버를 쓰고 있다면 서버의 `.env` 도 똑같이 바꾸고 `docker compose up -d` (스케줄러가 다음 주기에 동기화)

---

## 3. 동기화 확인과 수동 실행

| 방법 | 명령/주소 |
|---|---|
| 상태 보기 (터미널) | `npm run sync:status` |
| 상태 보기 (브라우저) | `/admin/sync` |
| 바로 반영 (변경분만) | `npm run sync` 또는 관리 페이지 "증분 동기화 실행" |
| 전부 다시 가져오기 | `npm run sync -- --full` 또는 관리 페이지 "전체 동기화 실행" |
| Docker 에서 | `docker compose exec scheduler node dist/scripts/sync-notion.js` (`--full` 가능) |

결과 읽는 법:

- `success`: 정상 / `partial`: 일부 행 또는 일부 데이터베이스 실패 (나머지는 반영됨) / `failed`: 전부 실패 / `skipped`: 이미 다른 동기화가 실행 중이라 건너뜀 (정상)
- 실패한 내용은 상태 화면의 **오류** 칸에 어떤 행(pageId)이 왜 실패했는지 나옵니다.

> 로컬에서 `npm run sync` 를 실행하면 실행 중인 앱(`APP_URL`)에 캐시 갱신을 요청합니다. 앱이 꺼져 있으면 `sync.invalidate_failed` 경고가 나오는데, 앱을 다시 켜면 최신 데이터가 보이므로 무시해도 됩니다.

---

## 4. 테스트

코드를 수정했다면 **커밋 전에** 아래를 실행하세요.

```bash
npm run lint          # 코드 스타일 검사
npm run typecheck     # 타입 검사
npm test              # 단위 + 통합 테스트 38개 (DB/Notion 없이 자체적으로 실행, 약 10초)
npm run build         # 빌드 확인
```

**E2E(실제 브라우저) 테스트** — 사이트가 3000 포트에서 실행 중이어야 합니다 (1-2 의 `npm run start` 또는 1-3 Docker).

```bash
npm run test:e2e      # 데스크톱 + 모바일 38개
```

**화면이 원본과 똑같은지 비교** (UI 를 건드렸을 때만):

```bash
node --import tsx scripts/visual/capture-cli.ts http://localhost:3000 /tmp/shots-new
npm run visual:compare -- <기준 캡처 폴더> /tmp/shots-new /tmp/shots-diff
```

- 기준 캡처는 원본 사이트(`upstream-main` 브랜치)를 띄워 `--legacy` 옵션으로 찍어야 합니다. UI 를 바꾸기 전 버전을 기준으로 찍어 두는 것이 가장 쉽습니다.
- 캡처는 반드시 `node --import tsx ...` 로 직접 실행하세요 (`npx`/`npm run` 으로 실행하면 이 맥에서 브라우저가 중간에 꺼지는 현상이 있습니다).

---

## 5. 배포

### 5-1. 배포 전 확인

- [ ] 4 의 테스트 통과
- [ ] 로컬 Docker(1-3)로 실행해 화면 확인
- [ ] 운영용 비밀값 준비 (아래 5-2)
- [ ] 도메인 결정 — **`luna.codes` 는 해킹당한 도메인이므로 절대 사용하지 않습니다**

### 5-2. 운영 서버의 `.env`

서버의 프로젝트 폴더에 `.env` 를 만듭니다 (`.env.example` 참고). **이 파일은 git 에 올리지 마세요.**

| 변수 | 값 |
|---|---|
| `POSTGRES_PASSWORD` | 새로 생성 (`openssl rand -hex 16`) |
| `NOTION_TOKEN` | 로컬 `.env` 와 같은 값 |
| `NOTION_*_DATA_SOURCE_ID` (5개) | 로컬 `.env` 와 같은 값 |
| `SYNC_SECRET` | 새로 생성 (`openssl rand -hex 32`) — 로컬 값 재사용 금지 |
| `ADMIN_USER` / `ADMIN_PASSWORD` | 관리 페이지 계정 (비밀번호 12자 이상) |
| `SITE_URL` | 새 도메인 주소 (예: `https://새도메인`) |
| `SITE_HOST` | Traefik 사용 시 새 도메인 (예: `새도메인`) |

### 5-3. 처음 배포 (Docker 가 설치된 서버)

```bash
git clone https://github.com/jang-tang/luna-website.git
cd luna-website
# .env 작성 (5-2)
docker compose up -d --build
docker compose ps                                 # app 이 healthy, scheduler 가 running 이면 성공
docker compose logs scheduler | grep scheduler.tick   # 첫 동기화 결과 확인
```

- Traefik(리버스 프록시)이 있는 서버라면:
  `docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build`
- 그 외에는 앱이 **서버 내부(127.0.0.1)의 3000 포트**로만 열립니다 (보안상 기본값). 앞단에 Nginx/Caddy 등으로 HTTPS 를 붙여 공개하세요. 포트 변경은 `APP_PORT`, 외부에 직접 열어야 하면 `APP_BIND=0.0.0.0`.
- 확인: `https://새도메인/api/health` → `{"ok":true,"db":"up"}`

### 5-4. 업데이트 배포 (코드를 고친 뒤)

```bash
# 내 컴퓨터
git add -A && git commit -m "변경 내용" && git push origin main

# 서버
cd luna-website
git pull
docker compose up -d --build      # DB 변경이 있으면 migrate 가 자동으로 먼저 실행됨
```

- 콘텐츠만 바꾼 경우(Notion 수정)는 **배포할 필요가 없습니다.**
- DB 데이터는 `pgdata` 볼륨에 보존되므로 재배포해도 지워지지 않습니다. **`docker compose down -v` 는 운영 서버에서 절대 쓰지 마세요** (DB 삭제).

### 5-5. 되돌리기 (배포 후 문제가 생기면)

```bash
git log --oneline -5              # 되돌릴 커밋 확인
git checkout <이전 커밋>
docker compose up -d --build
# 원인 수정 후 다시 main 으로: git checkout main
```

### 5-6. DB 백업 (권장: 주기적으로)

```bash
docker compose exec db pg_dump -U luna luna > backup-$(date +%Y%m%d).sql      # 백업
cat backup-YYYYMMDD.sql | docker compose exec -T db psql -U luna luna          # 복원
```

> 콘텐츠의 원본은 Notion 이므로, DB 가 날아가도 `docker compose exec scheduler node dist/scripts/sync-notion.js --full` 로 다시 채울 수 있습니다. 백업은 동기화 기록 보존과 빠른 복구용입니다.

### 5-7. 다른 배포 방법

- **Vercel**: `vercel.json` 에 15분마다 동기화하는 Cron 이 설정되어 있습니다. 외부 PostgreSQL(Neon, Supabase 등)을 만들어 `DATABASE_URL`, `CRON_SECRET` 등을 Vercel 환경변수에 넣으면 됩니다. (유료 플랜/DB 비용 확인 필요)
- **자동 배포**: `.gitlab-ci.yml` 은 원본(GitLab) 환경용이라 **GitHub 에서는 동작하지 않습니다.** push 할 때마다 자동 배포하려면 GitHub Actions 설정이 별도로 필요합니다 (아직 없음).

---

## 6. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| Notion 을 고쳤는데 사이트에 안 나옴 | 15분 기다리거나 수동 동기화(3). 그래도 안 되면 `npm run sync:status` 의 오류 칸 확인 (필수값 누락, 속성 이름 변경 등) |
| 동기화가 계속 `failed` | Notion 통합(new_site)에 데이터베이스가 공유되어 있는지, `NOTION_TOKEN` 이 유효한지 확인 |
| `skipped` 만 계속 나옴 | 다른 동기화가 실행 중. 프로세스가 죽은 경우 15분 뒤 자동 해제 |
| 사이트가 "잠시 후 다시 시도해주세요" | DB 연결 문제. `/api/health` 확인 → `docker compose ps`, `docker compose logs db` |
| `npm run dev` 가 DB 연결 오류 | 터미널 1 에서 `npm run db:dev` 가 켜져 있는지 확인 |
| 로컬 화면이 이상한 데이터를 보여줌 | 개발 DB 의 오래된 캐시일 수 있음 → 서버 재시작, 그래도 같으면 `rm -rf .next` 후 다시 빌드 |
| `docker` 명령이 안 됨 | `colima start` 실행 (맥 재부팅 후 필요) |
| 3000 포트가 이미 사용 중 | `lsof -iTCP:3000 -sTCP:LISTEN` 으로 프로세스 확인 후 종료 |
| 관리 페이지가 404 | `ADMIN_PASSWORD` 가 설정되지 않음 (12자 이상) |

### 로그 보기

```bash
docker compose logs -f app         # 웹 서버
docker compose logs -f scheduler   # 동기화
```

---

## 7. 보안 규칙 (꼭 지키기)

1. `.env`, `.env.local`, `.env.docker`, `.notion-bootstrap.json` 은 **절대 커밋하지 않습니다** (이미 `.gitignore` 에 등록됨).
2. Notion 토큰이 유출됐다고 의심되면 Notion 통합 설정에서 **토큰을 재발급**하고 `.env` 들을 갱신합니다.
3. 운영의 `SYNC_SECRET`, `ADMIN_PASSWORD` 는 로컬과 **다른 값**을 씁니다.
4. Notion 통합은 지금 `메모장` 아래 개인 페이지까지 접근할 수 있습니다. 가능하면 **LUNA 데이터베이스 5개만 공유**하도록 좁히세요.
5. 도메인 `luna.codes` 는 해킹된 도메인입니다. 링크·설정 어디에도 쓰지 않습니다.
