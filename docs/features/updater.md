# 자동 업데이트 — electron-updater + GitHub Releases

> 이 문서는 자동 업데이트 동작, 콘텐츠 동기화 경합, 업데이트 이벤트 처리 구현·변경·디버깅 시 본다. 빌드/배포 쪽은 [../development/build-deploy.md](../development/build-deploy.md).

## 한 줄 정의
패키지 모드(`app.isPackaged`)에서만 `electron-updater` 가 GitHub Releases(`RedAndBlueOrg/ADMed-2-electron`)의 latest 와 `package.json` 버전을 비교 → 새 버전 자동 다운로드 → 1초 뒤 즉시 `quitAndInstall` (콘텐츠 동기화 중이어도).

## 모듈
main: `src/main/updater.js` `initAutoUpdater()` — `main.js` 의 `whenReady` 에서 호출. `electron-updater` 는 함수 내부 lazy `require`.

## 동작 (`initAutoUpdater()`)
1. `if (!app.isPackaged) return;` — 개발 모드는 아무것도 안 함
2. `GH_TOKEN`/`GITHUB_TOKEN` 있으면 `autoUpdater.requestHeaders = { Authorization: 'token <...>' }` (비공개 릴리스)
3. `autoDownload = true`, `autoInstallOnAppQuit = true`
4. 이벤트 → renderer 로 broadcast (`update:error`/`update:available`/`update:ready`/`update:progress`) — **단 preload 가 이 채널들을 노출 안 함 → renderer 가 못 받음** (현재 의도된 상태인 듯; 진행률 UI 가 필요하면 preload 브리지 추가 필요)
5. `update-downloaded` → `pendingUpdateInstall` 가드 후 1초 `setTimeout` 으로 `autoUpdater.quitAndInstall(false, true)` (`isSilent=false`, `isForceRunAfter=true`). 실패 시 `pendingUpdateInstall=false` 복원 + `update:error` broadcast
6. `checkForUpdatesAndNotify()` 호출 (실패 시 경고만)

## 콘텐츠 동기화 경합 (현재 정책: 업데이트 우선)
- `src/main/playlist.js` `preparePlaylist()` 시작 시 `state.contentSyncing = true`, 끝/에러 시 `false`
- updater 는 `contentSyncing` 을 **무시하고 즉시 설치** ("재시작 후 동기화 재개" — `updater.js` 주석)
- 만약 "동기화 끝날 때까지 대기" 로 바꾸려면: `update-downloaded` 핸들러에서 `contentSyncing` 체크 → true 면 폴링/이벤트 대기 후 설치. `state.pendingUpdateInstall` 와 함께 검토. → [../development/impact-map.md](../development/impact-map.md) "자동 업데이트 ↔ 콘텐츠 동기화"

## 환경변수
`GH_TOKEN` / `GITHUB_TOKEN` (비공개 릴리스 다운로드 인증 — 공개 릴리스면 불필요).

## 엣지 / 실패
- `quitAndInstall` 실패 (다운로드 파일 손상, 권한) → `pendingUpdateInstall` 복원, `update:error` (단 renderer 가 못 받으므로 콘솔/main 로그만)
- 네트워크 단절 → `checkForUpdatesAndNotify` 실패 → 경고, 다음 실행 때 재시도
- 버전 비교는 `package.json` 의 `version` — bump 안 하면 업데이트 안 잡힘

## 관련 사고
(없음)
