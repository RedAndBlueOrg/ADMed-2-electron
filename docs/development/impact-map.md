# Impact Map — 의미 의존 추적

> 이 문서는 자동 grep / 정적 분석이 못 잡는 **의미상 묶여 있지만 코드상 (이름이 달라서) 분리된** 의존 chain 만 한 줄씩 누적한다.

## 무엇을 적는가
- IPC 채널 ↔ preload 브리지 메서드 ↔ renderer 호출처처럼 **한 채널이 3곳에 흩어진** 것 (이름이 달라 grep 으로 한 번에 안 잡힘)
- 시나리오 API 응답 필드 ↔ 그걸 소비하는 renderer 동작 (예: `waitingInfo` 값 ↔ 레이아웃 모드 ↔ 클리닉/날씨 활성화)
- 캐시 디렉토리 레이아웃 ↔ 캐시 서버 URL 생성 ↔ 정리 로직의 keepPaths
- 운영상 묶여 있지만 코드상 명시 의존 없는 것 (예: 자동 업데이트 `quitAndInstall` ↔ 콘텐츠 다운로드 `contentSyncing`)

## 무엇을 적지 않는가
- 자동 grep 으로 잡히는 의존 (import / 함수 호출 / 같은 이름의 채널 문자열)
- 단일 모듈 내부 의존
- 일회성 사고 (그건 incident-log 가 담당)

## 형식
```
## <도메인 또는 규칙 이름>
- **연결**: A (위치) ↔ B (위치) ↔ C (위치)
- **이유**: 의미상 동기화되어야 하는 이유
- **변경 시 검사**: 어떤 코드를 함께 봐야 하는가
- **사고 이력**: incident-log 의 어느 항목 (있으면)
```

## 갱신 규칙
- tester / verifier / architect 서브에이전트가 "impact-map 갱신 후보" 발견 시 메인에 보고 (핸드오프 페이로드 `[갱신된 영속 자산]`)
- 메인이 사용자 승인 후 추가
- 자동 grep 이 강해져 잡을 수 있게 되면 해당 항목 삭제

---

## IPC 채널 3곳 동기화

- **연결**: `src/main/` (`ipcMain.handle('<ch>')` 또는 `webContents.send('<ch>')`) ↔ `preload.js` (`contextBridge.exposeInMainWorld` 의 메서드) ↔ `src/renderer/` (`ipcRenderer.invoke/.on('<ch>')` 를 감싼 `window.<api>.<method>`)
- **이유**: renderer 는 preload 브리지 메서드 이름으로 호출하므로, 채널 문자열 grep 만으론 renderer 호출처가 안 잡힌다. 브리지 메서드 이름까지 따라가야 함.
- **변경 시 검사**: 채널 추가/시그니처 변경 시 → main 등록부 + `preload.js` 해당 객체 + renderer 의 `window.mediaAPI/clinicWS/appInfo/weatherConfig` 호출처. 현재 채널 목록: [../architecture/ipc-contracts.md](../architecture/ipc-contracts.md).
- **사고 이력**: (없음 — 발생 시 incident-log 에)

## `waitingInfo` ↔ 레이아웃 / 클리닉 / 날씨 활성화

- **연결**: 시나리오 API 응답 `waitingInfo` ↔ `src/renderer/layout.js` `applyLayout()` (모드 N/A/B/Y) ↔ `src/renderer/clinic.js` `setupClinicRealtime()` (`'Y'` 일 때만 활성) ↔ `src/renderer/weather.js` `updateWeatherPanel()` (`'B'` 일 때만 표시) ↔ `src/renderer/notice.js` (`'N'` 이면 공지 숨김)
- **이유**: 한 값이 4개 모듈의 표시/활성 여부를 동시에 결정. 새 모드 추가 시 4곳 모두 손봐야 함.
- **변경 시 검사**: `waitingInfo` 값 추가/의미 변경 → 위 4개 모듈 + `docs/features/playlist-hls.md`(레이아웃 매핑) + `docs/features/clinic.md` / `weather.md`.

## 자동 업데이트 ↔ 콘텐츠 동기화

- **연결**: `src/main/updater.js` `quitAndInstall` ↔ `src/main/state.js` `contentSyncing` / `pendingUpdateInstall` ↔ `src/main/playlist.js` `preparePlaylist()` (시작 시 `contentSyncing = true`, 끝/에러 시 `false`)
- **이유**: 현재 정책은 "업데이트 우선 — 동기화 중이어도 즉시 설치, 재시작 후 동기화 재개". 정책을 "동기화 끝날 때까지 대기" 로 바꾸려면 두 모듈을 함께 봐야 함. 코드상 직접 호출 관계 없이 플래그로만 연결됨.
- **변경 시 검사**: `updater.js` 의 `update-downloaded` 핸들러 ↔ `playlist.js` 의 `state.contentSyncing` 토글 ↔ `docs/features/updater.md`.
