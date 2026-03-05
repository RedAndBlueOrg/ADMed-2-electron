아키텍처 개요 (v2.0.6)
=====================

프로젝트 구조
------------
```
main.js                    오케스트레이터 (~105줄): app lifecycle, IPC 핸들러 등록
preload.js                 contextBridge: mediaAPI, clinicWS, appInfo, weatherConfig
index.html                 UI 마크업 + <script type="module"> 진입점
extract-worker.js          ZIP 추출 워커 (child_process.fork)

src/main/                  Main Process 모듈 (CommonJS)
├── state.js               공유 상태 객체
├── config.js              상수, env 로딩, INI 설정 관리 (lazy getter)
├── window-state.js        윈도우 위치/크기 DPI 보정 저장/복원
├── auto-launch.js         자동시작 레지스트리, 레거시 정리
├── download.js            HTTP 다운로드 유틸 (순수 함수)
├── scenario-api.js        시나리오/공지 API 호출
├── cache-server.js        로컬 캐시 HTTP 서버, ZIP 추출, 캐시 정리
├── playlist.js            preparePlaylist, 다운로드 진행률 브로드캐스트
├── clinic-ws.js           STOMP WebSocket 클라이언트
├── updater.js             electron-updater 자동 업데이트 (콘텐츠 동기화 대기)
├── window.js              BrowserWindow 생성, 지오로케이션 권한
├── tray.js                시스템 트레이
├── context-menu.js        우클릭 메뉴, 윈도우 크기 변경
└── dialogs.js             promptInput, promptAdminSettings, promptError

src/renderer/              Renderer Process 모듈 (ES Modules)
├── state.js               공유 상태 + 콜백 슬롯
├── dom.js                 DOM 요소 참조 + log 유틸
├── layout.js              레이아웃 모드(N/A/B/Y), 스케일링, 랜딩 오버레이
├── overlays.js            버전 토스트, 다운로드 진행률, 에러 오버레이
├── notice.js              공지 마퀴 스크롤 + loadNotices
├── media.js               Video/Image/HLS 재생 엔진
├── weather.js             날씨 패널, 기상청 API, 격자 변환, 시계
├── clinic.js              환자 대기열, WebSocket, 호출 알림, TTS
├── playlist.js            loadPlaylist, playNext, 에러/복구, 온라인 감지
├── move-handle.js         윈도우 드래그 핸들 + 전체화면 감지
└── app.js                 진입점: DOMContentLoaded, 이벤트 바인딩
```

컴포넌트
--------
- **Main Process** (`main.js` + `src/main/`)
  - `main.js`는 오케스트레이터로 ~105줄. 모든 기능은 `src/main/` 모듈에 위임.
  - `config.js`의 lazy getter로 `app.getPath()` 지연 평가, `electron-updater`는 함수 내부에서 lazy require.
  - `state.js`에 모든 전역 변수를 단일 mutable 객체로 모아 CommonJS 모듈 캐싱으로 공유.
  - `updater.js`는 콘텐츠 동기화 중이면 `quitAndInstall`을 지연(`contentSyncing` 플래그).
  - `.env`/`device_config.ini`/`window-state.ini`를 로드해 런타임 설정을 준비합니다.
  - 시나리오 API 호출 → 자산 캐시 관리 → 로컬 HTTP 서버로 HLS 제공.
  - IPC 핸들러: 재생 목록 준비, 공지 조회, 날씨/클리닉 설정 전달, 컨텍스트 메뉴 호출.
  - 자동 실행(`auto-launch`), 트레이 아이콘, 창 상태 저장/복원, 자동 업데이트.

- **Renderer Process** (`src/renderer/app.js` + `src/renderer/`)
  - ES Modules로 구성. `<script type="module" src="./src/renderer/app.js">`로 로드.
  - `state.js`에 공유 상태, 각 모듈에 로컬 상태 분리.
  - `media.js` ↔ `playlist.js` 순환 의존성은 `state.onPlayNext` 콜백 슬롯으로 해결.
  - 재생 목록을 받아 이미지/동영상/HLS 스트림을 플레이어로 표시합니다.
  - 공지 배너 스크롤, `waitingInfo` 모드에 따른 레이아웃 적용.
  - 날씨 패널: Geolocation/IP/설정 좌표 → 기상청 초단기예보 호출 → 시계/아이콘 렌더링.
  - 대기 현황: REST 초기 대기열, WebSocket 실시간 이벤트 → 카드/스크롤/호출 팝업(TTS).
  - 다운로드/업데이트 진행 상황, 버전 토스트, 에러 오버레이 표시.

- **Preload** (`preload.js`)
  - `mediaAPI`, `clinicWS`, `appInfo`, `weatherConfig` 브리지 노출.
  - 렌더러가 직접 환경 변수에 접근하지 않아도 필요한 최소 설정을 전달합니다.

모듈 설계 원칙
-------------
- **Main**: CommonJS, `state.js` 단일 객체로 상태 공유, lazy getter/require로 초기화 시점 제어.
- **Renderer**: ES Modules, 공유 상태(`state.js`) + 모듈 로컬 상태 분리, 콜백 슬롯으로 순환 의존 방지.
- 두 프로세스 모두 의존성 그래프에 순환이 없도록 설계.

데이터 흐름
-----------
1. **초기화**: Main이 환경 변수/INI를 읽어 창 상태와 디바이스 시리얼을 복원, 자동 실행·트레이·업데이트를 설정합니다.
2. **재생 목록 준비**: 렌더러가 `playlist:prepare` IPC를 호출 → Main이 시나리오 API/공지 API를 호출하고 자산을 캐시한 뒤 URL/로컬 경로/대기정보/멤버 seq 등을 반환합니다.
3. **플레이어 렌더링**: 렌더러는 반환된 재생 목록을 순회하며 이미지 타이머·동영상 loop·HLS(`hls.js`)를 처리하고, 공지/레이아웃/랜딩 화면을 동적으로 토글합니다.
4. **업데이트 동기화**: 콘텐츠 다운로드 중 업데이트가 준비되면 `contentSyncing` 플래그가 해제될 때까지 `quitAndInstall`을 지연합니다.
5. **대기/클리닉 연동**: `waitingInfo === 'Y'` 시 REST로 초기 대기열 → WebSocket으로 실시간 이벤트 수신 → 카드/스크롤/호출 팝업/음성 반영.
6. **날씨 갱신**: `waitingInfo === 'B'`일 때 좌표 결정(설정 → Geolocation → IP Fallback) → 기상청 API 호출 → 패널 표시.
7. **상태 유지**: 창 이동/크기/전체화면/항상위 상태를 실시간 저장, 컨텍스트 메뉴에서 프리셋/중앙정렬/리로드/자동 실행/관리자 설정을 제공합니다.

저장소·네트워크
---------------
- 로컬 저장: `%APPDATA%/ADMed/device_config.ini`, `%APPDATA%/ADMed/window-state.ini`, `%TEMP%/admed-cache/`.
- 네트워크: 시나리오 API, 템플릿 파일 CDN, 공지 API, 클리닉 REST/WS, 기상청 초단기예보, IP 위치(`https://ipapi.co/json/`).
- 배포/업데이트: GitHub Releases(`RedAndBlueOrg/ADMed-2-electron`)를 기본 소스로 사용하며, 토큰 제공 시 비공개 릴리스도 지원.
