# IPC 계약 — 채널 목록

> 이 문서는 IPC 채널 추가·시그니처 변경, `preload.js` 브리지 수정 시 본다. 채널은 main(`ipcMain.handle`/`webContents.send`) ↔ `preload.js`(contextBridge) ↔ renderer(`window.<api>.<method>`) **3곳이 항상 일치**해야 함. → [../development/impact-map.md](../development/impact-map.md) "IPC 채널 3곳 동기화"

## renderer → main (invoke / handle)

| 채널 | main 등록 | preload 브리지 | renderer 호출 | 인자 → 반환 |
|------|----------|---------------|--------------|------------|
| `playlist:prepare` | `main.js` → `preparePlaylist()` (`src/main/playlist.js`) | `mediaAPI.preparePlaylist()` | `playlist.js` `loadPlaylist()` | () → `{playlist[], waitingInfo, noticeList[], memberSeq, deviceSerial, clinicApiOrigin, clinicWsOrigin, landingUrl}` (에러 시 throw) |
| `notice:fetch` | `main.js` → `fetchNoticesFast()` (`src/main/scenario-api.js`) | `mediaAPI.fetchNotices()` | `notice.js` `loadNotices()` | () → `{noticeList[], waitingInfo}` 또는 `{noticeList:[], waitingInfo:null, error}` |
| `weather:config` | `main.js` (인라인) | `mediaAPI.getWeatherConfig()` | `weather.js` `useConfigWeather()` | () → `{lat, lon, weatherServiceUrl, weatherServiceKey}` |
| `app:version` | `main.js` → `app.getVersion()` | `appInfo.getVersion()` | `overlays.js` `renderVersionToast()` | () → `string` |
| `clinic:ws:start` | `main.js` → `startClinicSocket(cfg)` (`src/main/clinic-ws.js`) | `clinicWS.start(config)` | `clinic.js` `startClinicSocketInternal()` | `{memberSeq, clinicWsOrigin, clinicSeqList[]}` → `true` |
| `clinic:ws:stop` | `main.js` → `stopClinicSocket()` | `clinicWS.stop()` | `clinic.js` `stopClinicSocketInternal()` | () → `true` |
| `context:menu` | `main.js` → `buildContextMenu().popup()` (`src/main/context-menu.js`) | `mediaAPI.showContextMenu()` | `app.js` (contextmenu 이벤트) | () → (메뉴 팝업) |

## main → renderer (webContents.send / on)

| 채널 | main 발신 | preload 브리지 | renderer 수신 | 페이로드 |
|------|----------|---------------|--------------|---------|
| `download:progress` | `src/main/playlist.js` `sendDownloadProgress()` | `mediaAPI.onDownloadProgress(handler)` → unsub 반환 | `overlays.js` `setupDownloadProgressListener()` | `{total, finished, active, currentTitle}` |
| `clinic:ws:event` | `src/main/clinic-ws.js` `sendClinicWsEvent()` | `clinicWS.onMessage(handler)` → unsub 반환 | `clinic.js` `startClinicSocketInternal()` | `{type:'status', status:'open'|'closed'|'error', error?, clinicSeq}` 또는 `{type:'data', data, raw, clinicSeq}` |
| `update:error` / `update:available` / `update:ready` / `update:progress` | `src/main/updater.js` `broadcastUpdateEvent()` | **(없음 — preload 에 미노출)** | (없음) | message / info / info / progress |

> ⚠ `update:*` 4개는 main 이 broadcast 하지만 `preload.js` 가 노출 안 함 → renderer 가 못 받음. renderer 가 업데이트 진행률을 보여주려면 preload 브리지 추가 필요 (현재 `overlays.js` 의 진행 오버레이는 `download:progress` = 콘텐츠 다운로드만 표시). 의도된 상태인지 확인하고 손댈 것.

## preload 가 IPC 없이 직접 읽는 것

| 브리지 | 동작 |
|--------|------|
| `weatherConfig.get()` (`preload.js`) | preload 컨텍스트에서 `process.env.WEATHER_LAT/LON/WEATHER_SERVICE_URL/WEATHER_SERVICE_KEY` 직접 읽어 반환. `mediaAPI.getWeatherConfig()`(IPC) 와 사실상 중복 — `weather.js` 는 모듈 로드 시 `weatherConfig.get()` 으로 seed, fallback 으로 `mediaAPI.getWeatherConfig()` 호출. |

## 모달 내부 IPC (renderer↔main 아님 — `src/main/dialogs.js` 의 `data:` URL 모달 ↔ main)

`prompt:response` / `prompt:admin:response` / `prompt:admin-menu:response` / `prompt:error:response` — 각 모달 창의 인라인 스크립트가 `ipcRenderer.send`, main 이 `ipcMain.once` 로 1회 수신. 이 모달들은 `nodeIntegration:true, contextIsolation:false` (로컬 data: URL 한정 예외 — [../development/electron-security.md](../development/electron-security.md)).

## 추가/변경 시 체크리스트
1. main: `ipcMain.handle('<ch>')` 는 `whenReady` 안, **윈도우 생성 전** 등록 (또는 `webContents.send` 발신부)
2. `preload.js`: 해당 `exposeInMainWorld` 객체에 메서드 추가 (구독형이면 unsub 반환)
3. renderer: `window.<api>.<method>` 호출처 / 리스너 추가
4. 이 문서 표 갱신 + (해당 시) `docs/development/impact-map.md`
5. `/test` 의 tester 가 3곳 일치 grep 으로 검증
