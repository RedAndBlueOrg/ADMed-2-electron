# ADMed (Windows Electron) — CLAUDE.md

> 이 문서는 모든 작업 시작 시 본다 (진입점). 디테일은 `docs/<카테고리>/README.md` 가 받아 leaf 까지 라우팅. 본체 ≤70줄 유지.

## 프로젝트
- **한 줄 정의**: 의료기관 현장의 디지털 사이니지 — 시나리오 API가 내려준 재생목록(이미지/비디오/HLS)을 로컬 캐시로 재생하고 공지·날씨·진료 대기현황·호출 알림까지 표시하는 Windows용 Electron 플레이어.
- **언어 정책**: 모든 응답·문서·커밋 메시지는 한글. 코드 식별자는 영어.

## Tech Stack
- **Runtime**: Electron 39 (main = Node CommonJS `src/main/`, renderer = ES Modules `src/renderer/`, `preload.js` 브리지)
- **주요 의존성**: `electron-updater`(자동 업데이트), `@stomp/stompjs`+`ws`(클리닉 WS), `extract-zip`/`adm-zip`(HLS ZIP), `auto-launch`, `ini`, `keytar`. 렌더러는 `hls.js`(unpkg CDN).
- **빌드**: `electron-builder`(NSIS, win), GitHub Releases 배포 (`.github/workflows/release.yml`, `v*` 태그)
- **테스트**: 자동 테스트 스위트 없음 — `node --check` 문법 검사 + `npm start` 수동 스모크 + DevTools 콘솔. 시나리오는 [docs/testing-plan.md](docs/testing-plan.md).

## 빌드 / 실행

```bash
npm install              # 의존성 (postinstall: electron-builder install-app-deps)
npm start                # 개발 실행 (electron .)
npm run dist:local       # 로컬 NSIS 빌드 (publish 안 함)
npm run dist             # NSIS 빌드 + GitHub Releases 배포 (GH_TOKEN 필요)
```

> 실행 전제: `.env` 에 최소 `SCENARIO_API_URL`, `TEMPLATE_BASE_URL`. 기기 시리얼은 `%APPDATA%/ADMed/device_config.ini` 또는 우클릭 → 관리자 설정.

## 상황별 라우팅 (1단계)

| 작업 종류 | 카테고리 인덱스 |
|---------|---------------|
| main/renderer 구현 / IPC / 코드 컨벤션 / Electron 보안 / 빌드·배포 / PR | [docs/development/](docs/development/README.md) |
| 모듈 구조 / IPC 계약 / 데이터 흐름 / 동작 워크플로 | [docs/architecture/](docs/architecture/README.md) |
| 기능별 동작 (재생목록·HLS / 클리닉 / 날씨 / 업데이터 / 캐시) | [docs/features/](docs/features/README.md) |
| 메인 직접/위임 임계값 / 핸드오프 / critic 호출 | [docs/workflow/](docs/workflow/README.md) |
| 반복 사고 회피 (SessionStart 자동 주입) | [docs/development/incident-log.md](docs/development/incident-log.md) |
| 의미 의존 (자동 grep 못 잡음) | [docs/development/impact-map.md](docs/development/impact-map.md) |
| 진행 상태 / 버전 / 날짜 | [docs/progress.md](docs/progress.md) |

## 핵심 금지 (절대)
- 렌더러에 `nodeIntegration: true` / `contextIsolation: false` (메인 BrowserWindow) — preload 브리지 경유. `dialogs.js` 모달은 예외(로컬 data: URL 한정).
- 하드코딩 시크릿 / API 키 / 엔드포인트 → `.env` 환경변수 (`config.loadEnvFiles()`)
- `cache-server.js` 경로 검증 우회 — `targetPath.startsWith(cacheRoot)` 체크 유지 (path traversal)
- IPC 채널 시그니처 변경 시 `preload.js` 브리지 + 렌더러 호출처 동시 갱신 안 함 (계약 깨짐)
- `app.commandLine` 플래그 추가 시 보안 영향 검토 없이 — `ignore-certificate-errors` 이미 있음 (사설 인증서용), 확대 금지
- 테스트 / 검증 / 코드리뷰 / 비판은 메인 직접 X — 호출 시 `tester` / `verifier` / `reviewer` / `critic` 서브에이전트 위임

## 워크플로
- **검증**: `/test` (문법·설치·스모크) + `/verify` (Electron 보안·IPC·시크릿 정적 검사). 둘 다 별도 에이전트. → [docs/development/testing.md](docs/development/testing.md)
- **PR 체크리스트**: → [docs/development/pr-checklist.md](docs/development/pr-checklist.md)
- **사고 발생** → incident-log 한 줄 + 봉쇄 상태 (✅/⚠/🔴)
- **의미 의존 발견** → impact-map 한 줄

## 메인 = 오케스트레이터 (실용 모드)
- **임계값 충족 시 메인 직접** — 1~2 파일 / 영향 범위 명백 / 새 도메인 지식 read 불필요
- **벗어나면 9개 역할 에이전트로 위임:** 구현팀 (5): `planner`/`architect`/`backend`(=main process)/`frontend`(=renderer)/`designer` · 비판팀 (4): `critic`/`tester`/`verifier`/`reviewer`
- **비판팀 4개 호출 시 항상 위임** (자기 평가 편향). 호출 빈도: tester·reviewer = 매 작업 / critic·verifier = 선택
- 위임 시 표준 핸드오프 페이로드 — [docs/workflow/handoff-payload.md](docs/workflow/handoff-payload.md). 임계값 / 병렬 충돌 / critic 호출 시점 → [docs/workflow/orchestration.md](docs/workflow/orchestration.md) (SSOT)
