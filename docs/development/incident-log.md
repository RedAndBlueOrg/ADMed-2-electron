# Incident Log — 반복 사고 회고 / 회피

> 이 파일은 SessionStart hook 으로 활성(⚠/🔴) 항목만 자동 주입된다. 사람이 매번 안 봐도 됨.
> ✅ (시스템 봉쇄) 항목은 자동 차단되므로 노이즈로 인식되어 주입에서 제외.

## 형식

| 날짜 | 증상 | 진단 | 해결 | 재발 방지 / 관련 가이드 | 반복 횟수 | 상태 |
|------|------|------|------|---------------------|---------|------|

## 봉쇄 상태 (status)

- ✅ — 시스템이 자동 차단 (hook / verifier / 문법 검사). 매 세션 주입 X (노이즈).
- ⚠ — 가이드만, 자동 차단 X. 매 세션 자동 주입.
- 🔴 — 반복 (3회+). 자동화 hook / skill 도입 시급. 사용자에게 자동화 검토 요청.

## 누적 운영 규칙

- 같은 사고 2번째 → 반복 횟수 +1, 상태 그대로 ⚠
- 3번째 → 🔴 로 격상 + 자동화 도입 검토
- 자동화 완료 → ✅ 로 격상 + 다음 세션부터 주입 제외
- 사고가 더 이상 의미 없으면 archive (별도 폴더로 이동)

## 항목 추가 트리거

- `/test` / `/verify` 실패 후 진단 매핑
- 현장 운영 사고 회고
- 사용자 발화 "이거 전에도 봤지" 인지

## 자주 후보가 될 영역 (이 프로젝트 특성상)

- IPC 채널 시그니처 변경 시 `preload.js` 브리지 또는 renderer 호출처 갱신 누락 → 계약 깨짐
- HLS / 비디오 재생 stall·반복 (한 .ts 에서 안 넘어감) — `media.js` stall 감지 / `cache-server.js` Range 응답 / hls-zip 추출 결과
- 타이머/리스너 중복 등록으로 장시간 운영 시 누수
- 자동 업데이트(`quitAndInstall`) 와 콘텐츠 동기화 경합
- 캐시 정리(`cleanupCache`) 가 현재 재생목록 자산 삭제

## 항목

| 2026-09-16 | 운영 중 새 템플릿(HLS-ZIP)이 재생목록 **뒤쪽**에 추가되면, 재생이 그 항목에 도달하는 순간 재생 루프가 **무증상 정지** — 에러 화면·로그·재시도 전부 없고 재부팅 전까지 복구 불가 (코드 리딩으로 발견, 현장 관측 보고는 없음) | `media.js` `playIndex()` 의 미준비 항목 skip 분기가 `state.currentIndex` 를 갱신하지 않는데 `renderer/playlist.js:54` `playNext()` 는 `state.currentIndex + 1` 로 다음을 정한다 → **같은 인덱스 동기 재귀**(`playNext` 가 `async` 여도 `playIndex` 앞에 `await` 없음) → 스택 오버플로. 터진 `RangeError` 를 `callPlayNext()` 의 `.catch(() => {})` 가 삼켜 무증상. **재현: `playIndex(4)` 1회 호출 → 1836회 재귀 후 RangeError** (메인·reviewer 독립 재현 동일 수치). 2.1.11 의 백그라운드 HLS-ZIP(`main/playlist.js:258`)이 미준비 항목을 만들므로 **간판 기능이 곧 트리거**. 6/30 검증이 "F 를 맨 앞(FABCDE)" 배치라 우연히 비껴갔고, 뒤에 추가하는 평범한 경우가 위험. 레이스가 아니라 **한 번 재생 성공 후 미준비 항목을 만나면 100% 결정적**. | skip 분기에 `state.currentIndex = idx` 선행 (`src/renderer/media.js`, 2.1.12) | impact-map 에 "`currentIndex` ↔ `playNext` 전진 ↔ main 의 미준비 push 3경로" 등재. `docs/features/playlist-hls.md` 의 "렌더러가 skip 한다" 서술은 2.1.11 에서 한 번도 사실이 아니었음 → 갱신. 후속(2.1.13): `callPlayNext` 마이크로태스크화로 버그 클래스 제거 + 재생 0건 사이클 레이트 리밋. | 1 | ⚠ |
| 2026-09-16 | 시나리오 API 조회가 **1회** 실패하면 로컬 캐시(이미지·영상·HLS 추출 디렉터리·zip) 전체가 삭제 → 서버 복구 후 수백 MB~GB 재다운로드 (코드 리딩으로 발견) | `preparePlaylist` 가 조건 없이 `cleanupCache(cacheRoot, keepPaths)` 를 호출(`main/playlist.js:344`). 조회 실패 시 `playlist = []` → 순회 0회 → `keepPaths` **빈 Set** → `cleanupCache` 가 `cacheRoot` 최상위에서 keepPaths 밖 엔트리를 `.part` 만 빼고 전부 `fs.rmSync`(`cache-server.js`). 과거 13.5GB → 321MB 사고와 같은 클래스. 서버 점검 후 한참 콘텐츠가 안 나오는 현상이 이걸로 설명됨. | `cleanupCache` 진입부에 빈 `keepPaths` early return 가드 (`src/main/cache-server.js`, 2.1.12) | **가드는 "완전히 빈" 응답만 막는다** — 부분 응답(10개 중 3개만 도착)이면 나머지 7개는 여전히 삭제된다. 근본 해결은 2.1.13(호출자 `scenarioOk` 플래그 + 유예 세대). 의도적으로 빈 재생목록이면 캐시가 안 지워지고 잔존하나 증가는 없으므로 수용. | 1 | ⚠ |
| 2026-06-30 | 운영 중 새 템플릿을 서버에 올린 뒤, 한 사이클이 끝나고 루프 재시작 시 "콘텐츠를 불러오지 못했습니다 / No playable content available" 에러로 영구 정지 → 수동 새로고침 전까지 새 콘텐츠 다운로드·진행 안 됨 (현장 사진 보고) | 루프 재시작은 `loadPlaylist({fromCycle})` → `preparePlaylist()` 재호출이라 시나리오 재fetch 자체는 정상. 그러나 갓 올린 콘텐츠(특히 `hls-zip`)가 그 한 번의 prepare 시점에 404(업로드 직후 미전파, `downloadFileWithHeaders` 는 5xx·네트워크만 재시도)/추출 일시 실패 → `streamUrl`·`localFile` 없는 항목만 남아 renderer `firstPlayable<0`. 이 "no playable" 분기가 에러만 띄우고 **재시도 타이머를 안 걸어**(예외 `catch` 분기에만 retry 존재) 영구 정지. 수동 새로고침이 듣는 건 그때 prepare 가 다시 돌아 (서버 준비 완료/잔존 zip 재추출로) 성공하기 때문. | 운영 중(`state.hasEverPlayed`) no-playable 시 빨간 에러 대신 직전 프레임 유지 + `NO_CONTENT_RETRY_MS`(5초) 간격 `attemptRecovery()` 자동 재시도 → 준비되면 자동 교체. 콜드 스타트만 에러(+재시도). 받는 동안 `#player` 우하단 코너 도넛 스피너(운영 중엔 큰 `#download-overlay` 대신). `catch`/no-serial 경로도 `state.downloadActive` 정리(도넛 영구 회전 방지). (renderer 5파일: `playlist.js`/`state.js`/`overlays.js`/`dom.js` + `index.html`) | 2026-06-30 코드 적용 + `node --check` 통과 + tester·reviewer PASS(P0 0) + Mac 라이브 시연(주입)으로 self-heal 확인. **2차 후속**: 새 템플릿이 맨 앞에 추가될 때 미캐시 HLS-ZIP 을 `await` 하면 prepare 가 막혀 freeze → 운영 중엔 백그라운드 다운로드(`allowBackground` IPC 인자 + `hlsZipInProgress` dedup)로 비차단화, 준비된 항목부터 재생·다음 사이클 합류. 콜드 스타트는 차단+n/m 유지. tester·reviewer·verifier PASS(P0 0). **트리거 미확정(재현 안 됨)**: 에러 = "재생 가능 항목 0개"(`firstPlayable<0`). 이미지/비디오는 항상 `streamUrl` 이 붙어 **단독으론 이 에러 불가**(404여도 깨진 이미지일 뿐) → 새 콘텐츠가 이미지였다면 원인은 콘텐츠 404 가 아니라 **시나리오 API 가 그 찰나 빈/불완전 응답**(서버 업데이트 중 → templates 필터링/`getScenario` 실패 → `playlist=[]`)일 가능성이 큼. HLS-ZIP 였다면 다운로드/추출 실패(404)도 가능. 어느 경로든 self-heal 이 덮음. **운영 중 새 템플릿 추가 실측 + Windows pre-release 수동 검증 대기**. | 1 | ⚠ |
| 2026-05-13 | HLS(`.m3u8`) 콘텐츠 재생 시 간혹 2~3초 분량이 무한 반복되며 진행 안 됨 (현장 보고, 재현 데이터 없음) | **2026-05-15 Mac 로컬 재현 (cache-server 의 첫 .ts 응답에 인공 5s delay)** 으로 진짜 원인 두 가지 확정: **(1) stall checker false-positive** — `manifest_loaded → play()` 직후 첫 segment 가 cold disk IO 로 늦게 오면 `currentTime` 이 0 에 머무는데, 3초 후 첫 검사에서 `lastTime=-1 → 0` 통과, 6초 후 `lastTime=0 vs ct=0` 차이 < 0.1 → stall #1 → `+5초 seek` → 5초 위치도 buffer 없음 → stall #2 → 10초 위치 → stall #3 → skip. **(2) currentTime 전염** — `+5초 seek` 으로 누적된 ct=10 이 `destroyHls`/`resetMedia` 의 `removeAttribute('src')` + `load()` 뒤에도 일부 경로에서 리셋되지 않아 다음 `hls.attachMedia()` 시 그대로 → 다음 영상이 ct=10 부터 시작 → 짧은 영상이면 즉시 `ended` → 다음도 ct=10 → 즉시 ended → cycle 끝 → loadPlaylist → 첫 영상부터 → cold disk 또 시작 → 무한 루프 (=현장 "2~3초 반복"). 2.1.5 fix (stale 타이머) 는 부분 원인만 잡았음. | **Fix A** — stall checker arm 을 첫 `playing` 이벤트 후로 미룸 (`AbortController` + `{once,signal}` 로 destroyHls 시 cleanup). manifest_loaded 직후 buffer 채우는 cold-disk 윈도우의 false-positive 원천 차단. **Fix B** — `resetMedia()` 에 `videoEl.currentTime = 0` 명시 + `hls.js` config 에 `startPosition: 0` 추가. yank 된 위치가 다음 항목으로 전염되지 않음. (`src/renderer/media.js`) | 2026-05-15 Fix A+B 코드 적용 + `node --check` 통과. **Windows pre-release 수동 검증 대기**. 재현 방법(인공 5s delay) 은 `docs/features/playlist-hls.md` 디버깅 포인트에 추가 필요. | 1 | ⚠ |
