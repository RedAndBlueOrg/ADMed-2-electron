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

| 2026-06-30 | 운영 중 새 템플릿을 서버에 올린 뒤, 한 사이클이 끝나고 루프 재시작 시 "콘텐츠를 불러오지 못했습니다 / No playable content available" 에러로 영구 정지 → 수동 새로고침 전까지 새 콘텐츠 다운로드·진행 안 됨 (현장 사진 보고) | 루프 재시작은 `loadPlaylist({fromCycle})` → `preparePlaylist()` 재호출이라 시나리오 재fetch 자체는 정상. 그러나 갓 올린 콘텐츠(특히 `hls-zip`)가 그 한 번의 prepare 시점에 404(업로드 직후 미전파, `downloadFileWithHeaders` 는 5xx·네트워크만 재시도)/추출 일시 실패 → `streamUrl`·`localFile` 없는 항목만 남아 renderer `firstPlayable<0`. 이 "no playable" 분기가 에러만 띄우고 **재시도 타이머를 안 걸어**(예외 `catch` 분기에만 retry 존재) 영구 정지. 수동 새로고침이 듣는 건 그때 prepare 가 다시 돌아 (서버 준비 완료/잔존 zip 재추출로) 성공하기 때문. | 운영 중(`state.hasEverPlayed`) no-playable 시 빨간 에러 대신 직전 프레임 유지 + `NO_CONTENT_RETRY_MS`(5초) 간격 `attemptRecovery()` 자동 재시도 → 준비되면 자동 교체. 콜드 스타트만 에러(+재시도). 받는 동안 `#player` 우하단 코너 도넛 스피너(운영 중엔 큰 `#download-overlay` 대신). `catch`/no-serial 경로도 `state.downloadActive` 정리(도넛 영구 회전 방지). (renderer 5파일: `playlist.js`/`state.js`/`overlays.js`/`dom.js` + `index.html`) | 2026-06-30 코드 적용 + `node --check` 통과 + tester·reviewer PASS(P0 0) + Mac 라이브 시연(주입)으로 self-heal 확인. **2차 후속**: 새 템플릿이 맨 앞에 추가될 때 미캐시 HLS-ZIP 을 `await` 하면 prepare 가 막혀 freeze → 운영 중엔 백그라운드 다운로드(`allowBackground` IPC 인자 + `hlsZipInProgress` dedup)로 비차단화, 준비된 항목부터 재생·다음 사이클 합류. 콜드 스타트는 차단+n/m 유지. tester·reviewer·verifier PASS(P0 0). **운영 중 새 템플릿 추가 실측 + Windows pre-release 수동 검증 대기**. | 1 | ⚠ |
| 2026-05-13 | HLS(`.m3u8`) 콘텐츠 재생 시 간혹 2~3초 분량이 무한 반복되며 진행 안 됨 (현장 보고, 재현 데이터 없음) | **2026-05-15 Mac 로컬 재현 (cache-server 의 첫 .ts 응답에 인공 5s delay)** 으로 진짜 원인 두 가지 확정: **(1) stall checker false-positive** — `manifest_loaded → play()` 직후 첫 segment 가 cold disk IO 로 늦게 오면 `currentTime` 이 0 에 머무는데, 3초 후 첫 검사에서 `lastTime=-1 → 0` 통과, 6초 후 `lastTime=0 vs ct=0` 차이 < 0.1 → stall #1 → `+5초 seek` → 5초 위치도 buffer 없음 → stall #2 → 10초 위치 → stall #3 → skip. **(2) currentTime 전염** — `+5초 seek` 으로 누적된 ct=10 이 `destroyHls`/`resetMedia` 의 `removeAttribute('src')` + `load()` 뒤에도 일부 경로에서 리셋되지 않아 다음 `hls.attachMedia()` 시 그대로 → 다음 영상이 ct=10 부터 시작 → 짧은 영상이면 즉시 `ended` → 다음도 ct=10 → 즉시 ended → cycle 끝 → loadPlaylist → 첫 영상부터 → cold disk 또 시작 → 무한 루프 (=현장 "2~3초 반복"). 2.1.5 fix (stale 타이머) 는 부분 원인만 잡았음. | **Fix A** — stall checker arm 을 첫 `playing` 이벤트 후로 미룸 (`AbortController` + `{once,signal}` 로 destroyHls 시 cleanup). manifest_loaded 직후 buffer 채우는 cold-disk 윈도우의 false-positive 원천 차단. **Fix B** — `resetMedia()` 에 `videoEl.currentTime = 0` 명시 + `hls.js` config 에 `startPosition: 0` 추가. yank 된 위치가 다음 항목으로 전염되지 않음. (`src/renderer/media.js`) | 2026-05-15 Fix A+B 코드 적용 + `node --check` 통과. **Windows pre-release 수동 검증 대기**. 재현 방법(인공 5s delay) 은 `docs/features/playlist-hls.md` 디버깅 포인트에 추가 필요. | 1 | ⚠ |
