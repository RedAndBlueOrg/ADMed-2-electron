# 모듈 구조 — main / renderer / preload

> 이 문서는 새 모듈 추가 / 책임 이동 / 공유 상태 변경 / 로컬 파일·캐시 경로 변경 시 본다. 더 상세한 컴포넌트 설명은 [../architecture.md](../architecture.md).

## main process (`main.js` + `src/main/`, CommonJS)

`main.js` (~108줄) = 오케스트레이터: env 로드 → `app.commandLine` 플래그 → `state.configIni` 세팅 → `whenReady` 안에서 IPC 핸들러 등록 (윈도우 생성 **전**) → 윈도우/트레이/auto-launch/updater 초기화.

| 모듈 | 책임 |
|------|------|
| `state.js` | 모든 main 전역 상태를 단일 mutable 객체로. 모듈 캐싱으로 공유 |
| `config.js` | `.env` 로딩(`loadEnvFiles`), `device_config.ini` 읽기/쓰기, lazy path getter(`appPaths()`), 상수(`CACHE_ROOT_NAME`, `AUTO_LAUNCH_NAME`, `TRAY_ICON_CANDIDATES`, `ADMIN_PASSWORD` getter) |
| `window-state.js` | 창 위치/크기 DPI 보정 저장/복원 (`window-state.ini`), 500ms debounce 저장 |
| `window.js` | `BrowserWindow` 생성 (frameless, `contextIsolation:true`/`nodeIntegration:false`), geolocation 권한 핸들러, 창 이벤트 → 상태 저장 |
| `auto-launch.js` | Windows 시작프로그램 등록(`auto-launch`) + 레거시(바로가기/작업스케줄러) 정리 + `StartupApproved` 레지스트리 |
| `tray.js` | 시스템 트레이 아이콘 + 컨텍스트 메뉴 |
| `context-menu.js` | 우클릭 메뉴 (창 크기 프리셋 / 위치 / 전체화면 / 항상 위 / 관리자 설정 / 자동 실행 토글) |
| `dialogs.js` | `promptInput` / `promptAdminSettings` / `promptAdminMenu` / `promptError` — 로컬 `data:text/html` 모달 (이 모달들만 `nodeIntegration:true` 예외) |
| `download.js` | `fetch` 기반 HTTP 다운로드 + 네트워크 에러 재시도(최대 5회). 순수 함수 |
| `scenario-api.js` | 시나리오 API(`SCENARIO_API_URL?id=<serial>`) → 템플릿을 image/video/hls-zip 으로 매핑, 공지 목록 fetch (`/dapi/clinic/notice/list?memberId=`) |
| `cache-server.js` | `127.0.0.1` 로컬 HTTP 서버 (HLS `.m3u8`/`.ts` 서빙, Range 지원, path 체크), `extract-zip` ZIP 추출, 15분 미사용 캐시 정리 |
| `playlist.js` | `preparePlaylist()` — 시나리오 호출 → 자산 다운로드/캐시 → HLS ZIP 추출 → URL/로컬 경로/대기정보/멤버 seq 반환. 다운로드 진행률 broadcast (`download:progress`) |
| `clinic-ws.js` | `@stomp/stompjs` + `ws` STOMP 클라이언트 (`/topic/clinic/<memberSeq>`), 이벤트 renderer 로 broadcast (`clinic:ws:event`) |
| `updater.js` | `electron-updater` (패키지 모드만), `update-downloaded` → 즉시 `quitAndInstall` |

**lazy 초기화**: `electron.app.getPath()`·`screen` 은 `whenReady` 전 미가용 → `config.js` `appPaths()` lazy getter. `electron-updater` 는 `updater.js` 안에서 함수 내부 `require`.

## renderer process (`src/renderer/`, ES Modules — `index.html` 의 `<script type="module" src="./src/renderer/app.js">`)

| 모듈 | 책임 |
|------|------|
| `state.js` | 공유 mutable 상태 + 콜백 슬롯(`onPlayNext`) |
| `dom.js` | DOM 요소 export 상수 + `log()` 유틸 |
| `app.js` | 진입점 — `DOMContentLoaded` 에서 다운로드 리스너/버전 토스트/공지/재생목록/드래그핸들/날씨시계 초기화, 비디오 이벤트, 입력 차단, 컨텍스트 메뉴 |
| `layout.js` | `waitingInfo` 모드(N/A/B/Y) → `--notice-h`/`--panel-w` CSS 변수, `--ui-scale` 스케일, 랜딩 오버레이 |
| `overlays.js` | 버전 토스트, 다운로드 진행 오버레이, 에러 오버레이 |
| `notice.js` | 하단 공지 마퀴 스크롤 + `loadNotices` |
| `media.js` | 이미지(타이머)/비디오(loop)/HLS(`hls.js`) 재생 엔진, stall 감지·seek·skip |
| `weather.js` | 좌표(설정→Geolocation→ipapi.co) → 기상청 격자 변환 → 초단기예보 API → 아이콘/기온/습도/풍속 + 분 단위 시계 |
| `clinic.js` | 진료실 대기열 카드 회전·스크롤, STOMP 메시지 처리, 호출 팝업 + `modalAudio.wav` + Web Speech TTS (이름 마스킹·숫자 한글화) |
| `playlist.js` | `loadPlaylist` → `preparePlaylist` IPC 호출, `playNext`, 에러/복구, 온/오프라인 감지 |
| `move-handle.js` | 프레임리스 창 드래그 핸들 (전체화면 아닐 때만 표시) |

**순환 의존**: `media.js` ↔ `playlist.js` 는 `state.onPlayNext` 콜백 슬롯으로 끊음.

## preload (`preload.js`)
`contextBridge.exposeInMainWorld` 로 4개 브리지: `mediaAPI`, `appInfo`, `weatherConfig`, `clinicWS`. 상세 → [ipc-contracts.md](ipc-contracts.md).

## 로컬 파일 / 캐시 경로 (Windows 기준)
- `%APPDATA%/ADMed/device_config.ini` — `device_serial` (`config.loadConfigIni`/`saveConfigIni`)
- `%APPDATA%/ADMed/window-state.ini` — 창 크기/위치/전체화면/항상위 (DPI px 값 포함)
- `%APPDATA%/ADMed/admed-cache/` — 다운로드 자산, HLS ZIP 해제본, 로컬 캐시 HTTP 서빙 루트 (`.part` 임시 파일 제외하고 keepPaths 외 정리). ※ README.md 본문엔 `%TEMP%/admed-cache` 로 적혀 있으나 코드는 `app.getPath('userData')` (= `%APPDATA%/ADMed`) 하위 사용 — 코드 기준.
- `images/icon.ico`, `modalAudio.wav` — 앱 리소스 (패키지 시 `extraResources` 로 `process.resourcesPath` 에도 복사)
