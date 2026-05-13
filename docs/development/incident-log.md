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

| 2026-05-13 | HLS(`.m3u8`) 콘텐츠 재생 시 간혹 2~3초 분량이 무한 반복되며 진행 안 됨 (현장 보고, 재현 데이터 없음) | `src/renderer/media.js` 의 stall 감지 타이머·매니페스트 타임아웃 타이머가 `playIndex` 호출마다 만들어지는 클로저 지역변수라 `destroyHls()` 가 정리 못 함 → HLS 항목 교체/단일 항목 루프 시 stale 타이머 누적 → 새 항목의 `videoEl.currentTime` 을 stale `lastTime` 과 비교해 우연히 비슷하면 `+5초` seek → 짧은 클립이 끝으로 yank → `ended`→`playNext`→처음부터 반복. `videoEl.pause()` 창에서 stale 타이머가 죽는지가 타이밍 의존 = "간혹" | `hlsStallTimer`/`hlsManifestTimer` 를 모듈 레벨로 올리고 `destroyHls()` 가 둘 다 정리. 중복·버그성 `addEventListener('ended', clearStalledTimer, {once:true})` 제거. stall 감지/복구 로직 자체는 그대로 (회귀 없는 cleanup 추가). | 코드 수정 완료 — **현장 재발 여부 확인 필요**. 재발 시 콘솔 로그(`HLS stall #N` / `HLS error` / `Video playback start`) 확보 후 `docs/features/playlist-hls.md` "디버깅 포인트"의 ②③(짧은 클립+단일 항목 시나리오 / hls.js 에러 복구 루프) 검토 | 1 | ⚠ |
