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

## `state.currentIndex` ↔ `playNext()` 의 전진 ↔ main 이 `streamUrl` 없이 push 하는 경로

- **연결**: `src/renderer/media.js` `playIndex()` 의 **모든 조기 반환 분기**(미준비 항목 skip) ↔ `src/renderer/playlist.js` `playNext()` 의 `state.currentIndex + 1` ↔ `src/main/playlist.js` 가 `streamUrl`/`localFile` 없이 `prepared` 에 push 하는 3경로(백그라운드 HLS-ZIP / hls-zip 다운로드 실패 / m3u8 못 찾음)
- **이유**: `currentIndex` 를 전진시키는 **유일한** 근거가 `playNext()` 의 `+1` 이다. `playIndex` 가 항목을 건너뛰면서 이 값을 갱신하지 않으면 `playNext` 가 같은 인덱스를 다시 호출하고, `playNext` 는 `async` 지만 `playIndex` 앞에 `await` 가 없어 **동기 재귀**라 스택이 터진다. 터진 `RangeError` 는 `callPlayNext()` 의 `.catch(() => {})` 가 삼키므로 **에러 화면도 로그도 재시도도 없이 재생 루프가 죽는다**(재부팅 전 복구 불가). main 쪽에서 "렌더러가 알아서 skip 하겠지" 하고 미준비 항목을 push 하는 순간 발동하는데, 두 파일 사이에 코드상 호출 관계가 없어 grep 으로 안 잡힌다. 2.1.11 에서 실제로 터졌다(2026-09-16 incident-log).
- **변경 시 검사**: `media.js` 에 조기 반환 분기 추가 → 반드시 `state.currentIndex = idx` 선행 / main 에 `streamUrl` 없이 push 하는 경로 추가 → 렌더러 skip 체인을 "목록 중간·마지막" 배치로 실제 확인 / `playNext()` 의 전진 방식 변경 → `media.js` 의 모든 분기 재점검.

## `callPlayNext` 의 `setTimeout(...,0)` ↔ `loadPlaylist` 의 `playlistLoading` 재진입 가드

- **연결**: `src/renderer/media.js` `callPlayNext()` 의 `setTimeout(..., 0)` ↔ `src/renderer/playlist.js` `loadPlaylist()` 의 `if (state.playlistLoading) return` ↔ 같은 함수가 `playIndex(firstPlayable)` 를 `try` 블록 안에서 **동기 호출**하는 구조
- **이유**: 성능·스타일 조정이 아니라 **데드락 수정**이다. 동기로 부르면 skip·재생실패가 연쇄될 때 사이클 전체가 `loadPlaylist` 의 실행 스택 안에서 끝나버리고, 끝에서 부르는 `loadPlaylist({fromCycle})` 이 **아직 `finally` 가 안 돌아 `playlistLoading === true` 인 바깥 호출**에 막혀 조용히 return 한다. `retryTimer` 도 안 걸려 루프가 무증상 사망한다(하네스 실증: 동기 `prepareCount=1` / 새 스택 `prepareCount=6`). `setTimeout` 이 `finally` 가 플래그를 내린 뒤 실행되게 만들어 이걸 구조적으로 제거한다. **`queueMicrotask`/`Promise.then` 으로 바꾸는 것도 안 된다** — 재진입은 풀리지만 전 항목 실패 시 한 턴 안에서 연쇄 드레인되어 페인트가 굶고, 매크로태스크의 중첩 타이머 클램프(5단계 후 4ms)가 주는 공짜 레이트리밋도 잃는다.
- **변경 시 검사**: "의미 없어 보이는 `setTimeout`" 이라고 되돌리지 말 것 / `loadPlaylist` 의 재진입 가드나 `playIndex` 동기 호출 구조를 바꾸면 이 결합을 함께 재검토 / 검증은 "전 항목 미준비 상태에서 사이클마다 prepare 가 재호출되는가".

## `index.html` 의 hls.js script ↔ `package.json` dependencies ↔ electron-builder `files`/`asar`

- **연결**: `index.html` `<script src="./node_modules/hls.js/dist/hls.min.js">` ↔ `package.json` `dependencies["hls.js"]` ↔ `package.json` `build.files` 글롭 + `asar: true`
- **이유**: 셋 중 하나만 어긋나도(의존성 제거·버전 변경, `files` 에서 node_modules 배제, vendor 로 이전) `window.Hls` 가 undefined 가 되고, Chromium 은 네이티브 HLS 를 지원하지 않아 **HLS 콘텐츠가 통째로 재생 불가**가 된다. 게다가 **로컬 `npm start` 로는 절대 안 잡힌다** — dev 모드는 node_modules 를 그대로 읽으므로 항상 성공하고, 실패는 패키징 산출물에서만 드러난다. 2.1.13 이전엔 unpkg CDN 이라 오프라인 부팅에서 같은 증상이 났다(incident-log 2026-09-16).
- **변경 시 검사**: 위 3곳 중 하나라도 건드리면 **배포 전 `npm run dist:local` → `npx asar list release/win-unpacked/resources/app.asar | grep hls.min.js`** 로 번들 포함을 확인할 것. `files` 에 용량 트림 글롭을 추가할 때도 `hls.min.js` 가 살아남았는지 같은 방법으로 확인.
