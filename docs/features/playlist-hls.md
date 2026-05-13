# 재생목록 · 다운로드/캐시 · HLS · 재생 엔진

> 이 문서는 시나리오→재생목록 매핑, 자산 다운로드/캐시, HLS(`.m3u8`)·HLS ZIP, 로컬 캐시 HTTP 서버, 또는 미디어 재생 엔진(이미지/비디오/HLS, stall 처리) 구현·변경·디버깅 시 본다.

## 한 줄 정의
시나리오 API 가 내려준 템플릿 목록을 image/video/HLS 로 판별 → 로컬 캐시에 다운로드(HLS 스트림은 그대로, HLS ZIP 은 풀어 로컬 HTTP 로 서빙) → renderer 가 순회 재생. 한 항목 실패는 항상 다음 항목으로 넘어감.

## 파이프라인 (main: `src/main/playlist.js` `preparePlaylist()`)
1. `scenario-api.js` `getScenario()` → `SCENARIO_API_URL?id=<deviceSerial>` 호출 → `data.templates` 를 매핑:
   - `type` ∈ jpg/jpeg/png/gif/webp → `image` (`durationSeconds` = `time`)
   - `type` = m3u8 → `hls-zip`
   - `type` ∈ mp4/mov → `video`
   - URL = `TEMPLATE_BASE_URL?img=<img>&type=<type>`. `waitingInfo` 와 `mSeq.seq`(memberSeq) 도 추출.
   - `fetchNoticeList(apiUrl, memberSeq)` → `<origin>/dapi/clinic/notice/list?memberId=<memberSeq>`
2. `startCacheServer(cacheRoot)` (`cacheRoot` = `app.getPath('userData')/admed-cache`) → `cache-server.js` 가 `127.0.0.1:<random>/cache` 반환
3. 각 항목 처리:
   - **image / video**: 캐시 파일명 `<safeBase><ext>` (id 또는 `?img=` 또는 basename → `[^a-zA-Z0-9._-]→-`). 있으면 `localFile`(file:// URL) 로, 없으면 `streamUrl`(원격 URL) 로 즉시 prepared 에 넣고 **백그라운드 다운로드** (`download.js` `downloadFile`). 진행률은 `download:progress` IPC 로 push.
   - **hls** (`type==='hls'` 또는 URL 이 `.m3u8`): 다운로드 안 함 — `streamUrl: item.url` 그대로.
   - **hls-zip**: `<safeBase>.zip` 다운로드 → 파일 첫 64바이트가 `#EXT...` 면 m3u8 직접(rename), 아니면 `extract-zip` 으로 `<safeBase>/` 에 추출 → `findFirstManifest()` 로 `.m3u8` 찾음 → `streamUrl = <cacheBaseUrl>/<rel manifest path>`. 추출 실패해도 m3u8 가 추출됐으면 부분 성공. 잘린 zip 이면 1회 재다운로드. 캐시된 m3u8 첫 16바이트가 `#EXT` 아니면 (과거 잘못 저장) 삭제 후 재시도.
4. `cleanupCache(cacheRoot, keepPaths)` — keepPaths(현재 재생목록 자산) + `.part` 임시 파일 제외하고 삭제. (※ 코드상 "15분 미사용" 로직은 keepPaths 기반 — 매 prepare 마다 안 쓰는 건 즉시 정리)
5. 반환: `{playlist[], waitingInfo, noticeList[], memberSeq, deviceSerial, clinicApiOrigin, clinicWsOrigin, landingUrl}`. `deviceSerial` 비어있으면 renderer 가 랜딩 오버레이.

## 로컬 캐시 HTTP 서버 (`src/main/cache-server.js`)
- `127.0.0.1` 랜덤 포트, `/cache/` prefix 만, path traversal 체크(`targetPath.startsWith(cacheRoot)`).
- MIME 화이트리스트 (`.m3u8`→`application/vnd.apple.mpegurl`, `.ts`→`video/mp2t`, `.mp4`/`.mp3`/`.jpg`/`.jpeg`/`.png`), CORS `*`, `Accept-Ranges: bytes`, `Cache-Control: no-cache`.
- **Range 요청**: `bytes=start-end` 파싱 → 206 Partial. `.ts` 는 `fs.readFile` 후 `buf.subarray(start, end+1)` (전체 읽고 슬라이스), 그 외는 `fs.createReadStream({start,end})` 스트리밍. `416` 처리.

## 재생 엔진 (renderer: `src/renderer/media.js`)
- `playIndex(idx)`: `resetMedia(type)` (타이머/HLS/비디오 정리) → 항목 타입별 분기. `localFile||streamUrl` 없으면 `callPlayNext()`.
- **image**: `imageEl.src` 세팅, `setTimeout(callPlayNext, durationSeconds*1000 || 5000)`.
- **video**: `videoEl.src = localFile||streamUrl`, `autoplay`, `play()`. `ended` 이벤트 → `state.onPlayNext` (app.js 에 바인딩). `error` 이벤트 → 다음으로.
- **hls** (`item.type==='hls'`): `window.Hls.isSupported()` 면 `new Hls({...버퍼 설정, fragLoadingMaxRetry:6 등})` → `loadSource(streamUrl)` → `attachMedia(videoEl)`. `MANIFEST_PARSED` → `play()`. 15초 안에 manifest 안 오면 skip. **stall 감지**: 3초마다 `currentTime` 이 0.1초 미만 변화면 stallCount++; ≤2회면 `currentTime += 5` 로 seek + `play()`; 3회째면 skip. `ERROR` 이벤트: non-fatal → pause/play, NETWORK_ERROR → `startLoad()`, MEDIA_ERROR → `recoverMediaError()`, 그 외 fatal → skip. `videoEl.canPlayType('application/vnd.apple.mpegurl')` 면 native HLS, 아니면 skip.
- 비디오는 loop 아님 — `ended` 시 다음으로 (※ workflow.md 는 "video loop" 라 적혀있으나 코드는 `ended`→`playNext`. 단 한 항목만 있으면 `playNext` 가 사이클 끝→`loadPlaylist`로 다시 처음). HLS 도 ended 시 다음으로.
- `hls.js` 는 `index.html` 에서 `https://unpkg.com/hls.js@1.6.15/dist/hls.min.js` 로 로드 (CSP `script-src` 에 unpkg 허용).

## 환경변수
`SCENARIO_API_URL` (필수, `?id=<serial>` 붙음), `TEMPLATE_BASE_URL` (필수, `?img=&type=` 쿼리), `LANDING_URL` (기본 `https://www.admed.kr`).

## 엣지 / 실패 / 디버깅 포인트
- HLS 스트림이 한 `.ts` 에서 안 넘어가고 반복: 의심처 — (a) `media.js` stall 감지 seek 가 무한 반복 (currentTime 이 안 늘면 5초 seek → 또 안 늘면... ≤2회 후 skip 이지만 stallCount 가 리셋되는 조건 확인), (b) HLS manifest 가 VOD 가 아니라 1세그먼트 LIVE/EVENT 로 잘못 파싱, (c) `cache-server.js` 의 `.ts` Range 응답이 잘못돼서 hls.js 가 같은 fragment 재요청, (d) hls-zip 추출 결과 m3u8 가 손상/부분, (e) `maxBufferLength`/`lowLatencyMode:false` 설정과 짧은 m3u8 의 상호작용. → 콘솔의 `log()` 출력(`HLS stall #N`, `HLS error [type/details]`, `HLS manifest loaded`) 확인.
- 잘못된 URL/타입 → `prepared.push({...item, error})` 후 계속.
- 캐시된 zip 이 잘림 → 1회 재다운로드, 그래도 m3u8 없으면 `error: '패키지 내 m3u8 없음'`.
- `cleanupCache` 가 현재 재생 중인 자산 삭제하면 안 됨 — keepPaths 에 `destPath`/`destDir`/`zipPath` 다 들어가는지.

## 관련 사고
- 2026-05-13 — HLS 재생 시 간혹 2~3초 분량 무한 반복. 원인: stall/manifest 타이머가 `playIndex` 클로저 지역변수라 누적 → stale 타이머가 새 항목을 엉뚱하게 `+5초` seek. 수정: 두 타이머를 모듈 레벨로 올려 `destroyHls()` 에서 정리. 현장 재발 여부 확인 중. → [../development/incident-log.md](../development/incident-log.md)
