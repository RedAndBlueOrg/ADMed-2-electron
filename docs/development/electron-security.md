# Electron 보안 — 경계 / CSP / path 안전

> 이 문서는 `webPreferences` / `preload.js` / `index.html` CSP / `app.commandLine` / `cache-server.js` / 시크릿 처리 변경 시 본다. `verifier` 서브에이전트의 검사 기준.

## 1. process 경계 (절대 약화 금지)
- 메인 `BrowserWindow` (`src/main/window.js`): `contextIsolation: true`, `nodeIntegration: false` 유지. preload 브리지 경유로만 renderer ↔ main.
- **유일한 예외**: `src/main/dialogs.js` 의 모달 창들(`promptInput` / `promptAdminSettings` / `promptAdminMenu` / `promptError`) — `nodeIntegration: true, contextIsolation: false`. 단 로드 대상이 **로컬 `data:text/html` URL** 이고 외부 콘텐츠를 안 받음. 새 모달도 이 제약(로컬 data: URL 한정) 지켜야 함. 외부/원격 콘텐츠를 그 창에 띄우면 안 됨.
- renderer 에서 `require('electron')` / `process` / `fs` 직접 사용 금지.

## 2. CSP (`index.html` `<meta http-equiv="Content-Security-Policy">`)
현재:
```
default-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' file: blob: https: http: data:;
img-src 'self' file: blob: data: https: http:; script-src 'self' https://unpkg.com;
connect-src 'self' http: https: ws: wss: data: blob:; worker-src 'self' blob:; frame-src 'self' https: http: data:;
```
- `script-src` 는 `'self'` + `https://unpkg.com`(hls.js) 만. **외부 origin 추가 / `'unsafe-eval'` / `'unsafe-inline'`(script) 금지** — 추가가 필요하면 보안 검토 + 사용자 승인.
- `connect-src` / `media-src` 가 `http:`/`https:`/`ws:`/`wss:` 광범위 — 시나리오/공지/클리닉/날씨/캐시 서버 호출 때문. 좁히기는 가능하지만 회귀 위험 (현장마다 엔드포인트 다름).
- `frame-src` 가 넓은 건 랜딩 페이지(`LANDING_URL`, 기본 `https://www.admed.kr`) iframe 때문.

## 3. `app.commandLine` 플래그 (`main.js` 상단)
현재: `ignore-certificate-errors` (사설 인증서 환경), `enable-features=WinrtGeolocationImplementation` (Windows geolocation).
- **신규 플래그 추가·기존 확대 금지** without 보안 검토. 특히 `ignore-certificate-errors` 는 HTTPS 검증을 전역 무력화 — 확대(예: `allow-running-insecure-content`) 절대 금지.
- geolocation 권한은 `window.js` 의 `setPermissionRequestHandler` 가 `geolocation` 만 `true`, 나머지 `false` — 이 화이트리스트 유지.

## 4. 로컬 캐시 HTTP 서버 (`src/main/cache-server.js`)
- `127.0.0.1` 의 랜덤 포트, `/cache/` prefix 만 처리.
- **path traversal 방어**: `targetPath.startsWith(cacheRoot)` 체크 — 제거·우회 금지. `decodeURIComponent` 후 `path.join` 한 결과가 cacheRoot 밖이면 400.
- MIME 은 화이트리스트 맵 (`.m3u8`/`.ts`/`.mp4`/`.mp3`/`.jpg`/`.jpeg`/`.png`) + fallback `application/octet-stream`. CORS `*` 는 로컬 서버라 OK.
- ZIP 추출(`extract-zip`)은 시나리오 API 가 내려준 ZIP — zip-slip 가능성 있으니 추출 대상이 캐시 디렉토리 안에 머무는지 라이브러리 동작 신뢰 + 새 추출 로직 추가 시 검증.

## 5. 시크릿 / 설정
- 모든 엔드포인트·키·비밀번호는 `.env` → `process.env` 경유. 하드코딩 금지: `SCENARIO_API_URL`, `TEMPLATE_BASE_URL`, `CLINIC_API_ORIGIN`, `CLINIC_WS_ORIGIN`, `WEATHER_LAT/LON`, `WEATHER_SERVICE_URL`, `WEATHER_SERVICE_KEY`, `LANDING_URL`, `ADMIN_PASSWORD`, `GH_TOKEN`/`GITHUB_TOKEN`.
- `.env` 는 `.gitignore` 에 있어야 함 (커밋 금지). `electron-builder` `extraResources` 가 `.env` 를 패키지에 포함 — 배포 빌드엔 들어가지만 git 엔 안 들어감.
- 콘솔 로그에 시크릿(특히 `serviceKey` 가 들어간 weather query URL, `GH_TOKEN`) 출력 주의. `weather.js` 의 `queryUrl` 은 `serviceKey` 포함 — 디버그 로그 추가 시 마스킹.
