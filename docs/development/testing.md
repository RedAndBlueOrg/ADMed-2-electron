# 검증·테스트 워크플로

> 이 문서는 코드 변경 후 검증할 때, `/test` 호출 시 본다. tester 서브에이전트도 read.

## 자동 테스트 스위트가 없다

`package.json` 에 `test`/`typecheck`/`lint`/`build` 스크립트가 없음. 그래서 "테스트" = 다음 조합:

1. **`/test` 스킬** (tester 서브에이전트가 실행): `node --check` 문법 + IPC 계약 동기화 grep + `npm ls`/`npm install` 무결성 + 수동 스모크 체크리스트 작성. → [.claude/skills/test/SKILL.md](../../.claude/skills/test/SKILL.md)
2. **`/verify` 스킬** (verifier 서브에이전트): Electron 보안 / IPC / 시크릿 / cache-path 정적 규칙. → [.claude/skills/verify/SKILL.md](../../.claude/skills/verify/SKILL.md)
3. **수동 스모크**: `npm start` 후 실제 GUI 확인 — 상세 시나리오는 [../testing-plan.md](../testing-plan.md) (모듈 로딩 / 재생목록 / HLS ZIP / 캐시 / 다운로드 진행률 / 공지·레이아웃 / 날씨 / 클리닉 / 호출 알림 / 랜딩 / 창·트레이 / 자동 업데이트 / 회복·성능).

## 흐름

```
코드 변경 → tester (Agent, subagent_type=tester) → /test
  ├─ FAIL → 메인 수정 → 다시 tester
  └─ PASS (정적/무결성 통과 + 스모크 체크리스트 정리됨)
       → PR 직전이면 verifier (선택) → reviewer
       → 일상 변경이면 reviewer 직접
       → reviewer PASS → 메인이 사용자에게 `npm start` GUI 스모크 요청 → 확인 → commit / PR
```

## tester 가 자동으로 하는 것 (헤드리스 가능 범위)
- `git diff --name-only` → 변경 `.js` 에 `node --check` (renderer ESM 은 `--input-type=module` 시도)
- export 심볼 / IPC 채널명 grep 으로 사용처 추적
- 변경에 `preload.js` 또는 IPC 채널 있으면 → main(`ipcMain.handle`/`webContents.send`) ↔ preload(contextBridge) ↔ renderer(`ipcRenderer.invoke`/`.on`) 3곳 일치 확인
- renderer 변경 시 타이머/리스너/HLS/WS 정리 경로가 재로딩에 안전한지
- `npm ls --depth=0` 에러 없는지

## tester 가 못 하는 것 (메인 → 사용자)
- 실제 Electron GUI 동작 (재생, 레이아웃, 호출 팝업, 자동 업데이트 플로우) — GUI 앱이라 헤드리스 불가
- `npm run dist` / `dist:local` 무거운 빌드 — 필요하면 메인/사용자가 별도 판단 ([build-deploy.md](build-deploy.md))

## 장시간 운영 / 누수 특별 주의
HLS `destroy()` 경로, `imageTimer`/`retryTimer`/`onlineCheckTimer`/`clinicRotationTimer`/`weatherClockTimer` 중복 등록, STOMP `reconnectDelay` 무한 누적, `cleanupCache` keepPaths 가 현재 재생목록 자산 안 지우는지. (incident-log 에 패턴 누적 → SessionStart 자동 주입)
