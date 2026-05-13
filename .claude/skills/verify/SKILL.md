---
name: verify
description: |
  Run static verification across 4 domains for this Electron app — electron-security, ipc-contract sync, secrets/config, cache-server path safety — without executing anything.
  Use when user invokes /verify, before opening a PR, or to spot-check rule compliance.
  Must run inside the `verifier` sub-agent — never in the main session.
---

# /verify — 정적 규칙 검증 (별도 `verifier` 서브에이전트가 실행)

## 4 도메인 순차 검증

| 도메인 | 검사 항목 |
|--------|----------|
| **electron-security** | `BrowserWindow` `webPreferences`: `nodeIntegration: true` / `contextIsolation: false` (main `src/main/window.js` 의 메인 창 — `src/main/dialogs.js` 의 로컬 `data:` URL 모달만 허용된 예외) · `index.html` CSP `<meta>` 약화 (외부 origin/`unsafe-eval` 추가) · `app.commandLine.appendSwitch` 신규·확대 · `webSecurity: false` · 신뢰 못 할 URL `loadURL`/`loadFile` |
| **ipc-contract** | 신규/변경 IPC 채널이 3곳 일관 — main (`ipcMain.handle`/`webContents.send`) ↔ `preload.js` (contextBridge `exposeInMainWorld`) ↔ renderer (`ipcRenderer.invoke`/`.on`) · renderer 코드에서 `require('electron')`/Node API 직접 사용 (preload 우회) |
| **secrets/config** | 하드코딩된 시크릿·API 키·엔드포인트 (`SCENARIO_API_URL`/`TEMPLATE_BASE_URL`/`WEATHER_SERVICE_KEY`/`WEATHER_SERVICE_URL`/`ADMIN_PASSWORD`/`GH_TOKEN`/`GITHUB_TOKEN`/`CLINIC_API_ORIGIN`/`CLINIC_WS_ORIGIN`/`LANDING_URL` — 모두 `process.env` 경유) · `.env` 가 git 추적 대상인지 (`.gitignore` 에 있는지) · 콘솔/에러에 시크릿 노출 |
| **cache/path safety** | `src/main/cache-server.js` 의 `targetPath.startsWith(cacheRoot)` 검증 제거·우회 · 네트워크/시나리오 입력으로 만든 파일명·경로를 `fs` 에 검증 없이 전달 (`playlist.js` 의 `safeBase` sanitize 우회 포함) · `extract-zip` 추출 대상 디렉토리 밖 쓰기 (zip-slip) |

## 실행 방식
- 코드 변경 없이 **읽기만** (grep + 패턴 매칭)
- 메인 컨텍스트가 위반 사항 / 풀 grep 결과로 오염되지 않도록 별도 에이전트
- 보고만, 수정은 메인이

## 보고 형식
```
✅ 4 도메인 모두 통과
또는
⚠ <도메인>: <위반 항목 N건>
  - <파일:line> — <위반 내용 한 줄>
  권장 수정: <메인이 적용할 패턴 한 줄>
```

## /test 와의 구분

| | /test | /verify |
|---|-------|---------|
| 실행 | `node --check` + 무결성 + 수동 스모크 체크리스트 | 정적 grep + 패턴 매칭 |
| 시간 | 30초~수 분 (수동 스모크는 사용자) | 5~30초 |
| 용도 | 동작 확인 | 규칙 준수 |
| PR 풀 패스 | `/verify` → `/test` 순차 |

## 자동 호출 트리거
"PR 전 검증", "규칙 위반 검사", "보안 점검", "/verify" 발화에 자동 호출.
