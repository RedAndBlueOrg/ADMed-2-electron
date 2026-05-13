# 코드 리뷰 체크리스트

> 이 문서는 reviewer 서브에이전트가 read. 사람 리뷰 시도 동일 항목.

## 회귀 위험
- [ ] IPC 계약 비동기화 — main(`ipcMain.handle`/`webContents.send`) ↔ `preload.js` 브리지 ↔ renderer 호출처 셋 중 하나만 바뀜
- [ ] `playNext` 경로 끊김 — 미디어/네트워크 실패 시 다음 항목으로 못 넘어가 전체 멈춤
- [ ] `waitingInfo` 모드 전환 시 레이아웃/클리닉/날씨/공지 활성화 (4곳) 중 일부만 반영
- [ ] 캐시 정리(`cleanupCache`) 의 keepPaths 가 현재 재생목록 자산을 삭제
- [ ] 자동 업데이트(`quitAndInstall`) 와 콘텐츠 동기화(`contentSyncing`) 경합 깨짐

## Electron 보안
- [ ] `webPreferences` 에 `nodeIntegration: true` / `contextIsolation: false` (메인 창 — `dialogs.js` 로컬 data: URL 모달만 예외)
- [ ] `index.html` CSP `<meta>` 약화 (외부 origin / `unsafe-eval` 추가)
- [ ] `app.commandLine.appendSwitch` 신규·확대 (특히 `ignore-certificate-errors` 확대)
- [ ] renderer 에서 `require('electron')` / Node API 직접 사용 (preload 우회)
- [ ] `cache-server.js` 의 `targetPath.startsWith(cacheRoot)` 체크 제거·우회

## 장시간 운영 누수
- [ ] 타이머(`imageTimer`/`retryTimer`/`onlineCheckTimer`/`clinicRotationTimer`/`weatherClockTimer` 등) 재로딩 시 중복 등록
- [ ] HLS 인스턴스 `destroy()` 누락, stall 감지 타이머 정리 누락
- [ ] STOMP `reconnectDelay` 재연결 무한 누적, `addEventListener` cleanup 누락
- [ ] `requestAnimationFrame` 루프(clinic 스크롤) cancel 누락

## 시크릿
- [ ] 하드코딩 키·엔드포인트·비밀번호 (`process.env` 경유해야)
- [ ] 콘솔 로그에 시크릿 (weather `queryUrl` 의 `serviceKey`, `GH_TOKEN`)
- [ ] `.env` 가 커밋에 포함

## 클린코드
- [ ] 함수/메서드 길이 (긴 함수 분리 검토 — `playlist.js`/`clinic.js` 는 이미 길지만 새 코드는 절제)
- [ ] 중복 코드 (재사용 가능한 helper 누락 — `download.js`/`cache-server.js`/`dom.js` 의 기존 유틸)
- [ ] 네이밍 (의도 표현, 약어 최소화), 매직 넘버/스트링 → 상수

## 주석 품질
- [ ] 코드와 불일치하는 stale 주석
- [ ] 자명한 주석 (제거)
- [ ] 비자명한 워크어라운드 / 제약 → WHY 주석 (예: lazy 초기화 이유, ZIP 부분 성공 허용 이유)

## 영향 범위 / docs
- [ ] `docs/architecture/ipc-contracts.md` / `module-structure.md` 갱신 (구조·계약 변경 시)
- [ ] `docs/features/<name>.md` 갱신 (기능 동작 변경 시)
- [ ] `docs/development/impact-map.md` 후보 (의미 의존)
- [ ] `docs/progress.md` 한 항목
