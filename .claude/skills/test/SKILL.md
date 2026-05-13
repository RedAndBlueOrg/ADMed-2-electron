---
name: test
description: |
  Run the verification pipeline for this Electron app — there is NO automated test suite, so it is: `node --check` syntax on changed JS + IPC-contract sync grep + `npm install`/`npm ls` integrity + a manual-smoke checklist (`npm start`, DevTools console, the changed feature path).
  Use when user invokes /test, finishes a code change, or asks to verify it works.
  This skill must run inside the `tester` sub-agent — never in the main session, to keep the main context free of logs and to surface scenarios the author missed.
---

# /test — 검증 파이프라인 (별도 `tester` 서브에이전트가 실행)

## 왜 별도 에이전트인가
코드를 작성한 세션은 자기 시각에 갇혀 빠진 시나리오를 못 잡는다. 검증은 반드시 **독립된 `tester` 서브에이전트** 가 git diff 만 받고 시나리오 발굴부터 새로 시작. 메인 세션은 결과(PASS/FAIL + 진단)만 받고 수정.

## 자동 테스트 스위트가 없다 — 이 프로젝트의 "테스트"
`package.json` 에 `test`/`typecheck`/`lint`/`build` 스크립트가 없음 (있는 건 `start`/`dist`/`dist:local`/`pack:dir`/`rebuild`). 따라서 5단계 대신 다음 4단계:

| 순서 | 무엇 | 명령 / 방법 | 실패 시 |
|------|------|------------|---------|
| 1 | **문법** | `node --check <변경된 .js>` (renderer 의 ESM 은 `node --check --input-type=module <file>` 시도; 안 되면 import 구조 육안 확인) | 즉시 stop, 파일:line 보고 |
| 2 | **IPC 계약 동기화** | 변경에 `preload.js` 또는 IPC 채널명 있으면 → main `ipcMain.handle('<채널>')`/`webContents.send('<채널>')` ↔ `preload.js` contextBridge ↔ renderer `ipcRenderer.invoke/.on('<채널>')` 3곳 grep 일치 확인 | 누락 지점 보고 |
| 3 | **설치 무결성** | `npm ls --depth=0` 에러 없음 / (의존성 바꿨으면) `npm install` 클린 | 깨진 패키지 보고 |
| 4 | **수동 스모크 체크리스트 작성** | `npm start` → DevTools 콘솔 에러 없음 → 변경된 기능 경로 동작 → 회귀 의심 기능 1~2개. 항목을 메인에 넘겨 메인/사용자가 실제 GUI 에서 확인. 상세 시나리오는 `docs/testing-plan.md` 참조·보강 | — |

> **`scope` 인자**: `all`(기본) / `changed`(변경 파일만) / `smoke-checklist`(체크리스트만 작성). 무거운 `npm run dist` 는 이 스킬 범위 밖.

## 영향 범위 자동 추적
`tester` 는 다음을 자동 수행:
1. `git diff --name-only` 로 변경 파일 추출
2. 각 파일의 export 심볼 / IPC 채널명 grep (사용처)
3. 변경에 IPC/preload 있으면 → main↔preload↔renderer 3곳 동기화 검사
4. renderer 변경 시 → 타이머/리스너/HLS 인스턴스 정리 경로가 재로딩에 안전한지 (장시간 누수)
5. 자동 grep 못 잡는 의미 의존 → `docs/development/impact-map.md` 갱신 후보 제시

## 보고 형식 (메인에 반환)
```
✅ PASS — 1~3단계 통과 + 스모크 체크리스트 정리됨
또는
❌ FAIL @ 단계 <N>: <짧은 진단>
  - 영향 범위: <자동 추적 결과 요약>
  - 권장 수정: <메인이 적용할 변경 한 줄>
  - 수동 스모크 체크리스트: <메인/사용자가 npm start 후 확인할 항목>
  - impact-map 갱신 후보: <있으면 한 줄, 없으면 생략>
```

## 메인의 책임
- 직접 `node --check` 한두 개는 OK지만 풀 검증/스모크 정리는 `tester` 위임 (메인 컨텍스트 오염 방지)
- `tester` 보고 받고 수정만. PASS 후 사용자에게 GUI 스모크 요청 → 그다음 commit / PR

## /verify 와의 관계
`/test` = 문법·무결성·스모크 / `/verify` = Electron 보안·IPC·시크릿 정적 규칙. PR 풀 패스 = `/verify` → `/test` 순차.

## 자동 호출 트리거
코드 수정 후 `/test`, "테스트 돌려줘", "동작 확인", "잘 되나" 등의 발화에 자동 호출.
