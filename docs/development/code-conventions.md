# 코드 컨벤션 — main / renderer

> 이 문서는 `src/main/` 또는 `src/renderer/` 코드 작성·수정 시 본다. (보안 규칙은 [electron-security.md](electron-security.md), IPC 계약은 [../architecture/ipc-contracts.md](../architecture/ipc-contracts.md).)

## 공통
- 자동 포맷터·린터 미설정 — 의미 있는 일관성만 (기존 파일 스타일 따름: 2-space indent, single quote, semicolon, `'use strict'` (main 모듈)).
- 주석은 기본 안 씀. WHY 가 비자명할 때만 한 줄 (예: "lazy: `app.getPath` 는 `whenReady` 전 미가용", "ZIP 추출 실패해도 m3u8 있으면 부분 성공").
- 모듈은 작게. `main.js` 는 오케스트레이터(lifecycle + IPC 핸들러 등록)만 — 기능은 `src/main/<모듈>.js` 로 위임.
- 미디어 재생/네트워크 실패는 항상 다음 항목으로 진행 가능해야 함 — 한 항목이 전체를 멈추면 안 됨 (현장 무인 운영).

## main process (`src/main/`, CommonJS)
- `require()` 자유. `'use strict'` 상단.
- 공유 상태는 `src/main/state.js` 단일 mutable 객체 — 모듈 캐싱으로 공유. 새 전역 상태는 여기에 필드 추가.
- **lazy 초기화**: `electron.app.getPath()` / `screen` 등은 `app.whenReady()` 전 호출 금지 → `config.js` 의 `appPaths()` 처럼 lazy getter. `electron-updater` 는 `updater.js` 안에서 함수 내부 `require` (모듈 로드 시점 회피).
- `.env` 는 `config.loadEnvFiles()` 가 앱 디렉토리 / `process.cwd()` / `process.resourcesPath` 순으로 로드 — 패키지 모드에서도 동작. 새 설정값은 `process.env` 로 읽고 기본값 명시.
- 순수 함수 우선 (`download.js` 처럼). side-effect (파일 쓰기, 네트워크) 는 명시.
- Windows 전용 코드(`reg`, `schtasks`, `%APPDATA%` 경로, `auto-launch`)는 다른 OS 에서 깨질 수 있음 — `execFile` 콜백 에러는 삼키되(`() => resolve()`) 앱은 계속.

## renderer process (`src/renderer/`, ES Modules)
- `import` / `export` 사용 (`<script type="module">` 로 로드). `require()` / Node API **직접 호출 금지** → preload 브리지(`window.mediaAPI` / `window.clinicWS` / `window.appInfo` / `window.weatherConfig`)만.
- 공유 상태는 `src/renderer/state.js` mutable 객체. 모듈 로컬 상태는 모듈 안에.
- **순환 의존**은 콜백 슬롯으로 끊음 — `media.js` ↔ `playlist.js` 는 `state.onPlayNext` 슬롯 경유 (`playlist.js` 가 등록, `media.js` 가 호출).
- DOM 참조는 `dom.js` 의 export 상수 통해 (모듈 스크립트는 deferred 라 DOM ready).
- 타이머/리스너/HLS 인스턴스/WebSocket 정리 필수 — 재로딩 시 중복 등록 안 되게 (`resetMedia()` / `destroyHls()` / `clearXxxTimer()` 패턴). 4시간+ 무인 운영 누수 방지.
- `index.html` 의 UI 크기는 `--ui-scale` CSS 변수(1280×720 기준) — `clamp(min, calc(x * var(--ui-scale)), max)` 패턴.

## preload (`preload.js`)
- `contextBridge.exposeInMainWorld` 로 **최소 API** 만 노출. 새 IPC 채널 추가 시 여기 브리지 메서드도 같은 작업 단위에서 추가.
- 이벤트 구독형 브리지는 unsubscribe 함수 반환 (`onDownloadProgress` / `clinicWS.onMessage` 패턴).
