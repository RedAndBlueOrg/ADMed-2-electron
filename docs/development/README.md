# development/ — 엔지니어링 작업 인덱스

> 이 폴더는 코드 작업 시 본다. 작업 종류 → 해당 leaf 만 read.

## 라우팅 테이블

| 작업 종류 | leaf |
|---------|------|
| 코드 스타일 / 모듈 패턴 / Windows 전용 코드 / lazy 초기화 | [code-conventions.md](code-conventions.md) |
| Electron 보안 (contextIsolation / preload 경계 / CSP / `app.commandLine` / path 안전) | [electron-security.md](electron-security.md) |
| 검증·테스트 워크플로 (자동 스위트 없음 → `/test` 정의) | [testing.md](testing.md) |
| PR 체크리스트 (자동 강제 / 환기 / 사람 확인) | [pr-checklist.md](pr-checklist.md) |
| 코드 리뷰 항목 (reviewer 가 본다) | [code-review-checklist.md](code-review-checklist.md) |
| 빌드 / NSIS / `electron-builder` / GitHub Releases / CI | [build-deploy.md](build-deploy.md) |
| Hook / Skill / Agent 운영 표 | [claude-workflow.md](claude-workflow.md) |
| 반복 사고 (SessionStart 자동 주입됨) | [incident-log.md](incident-log.md) |
| 의미 의존 (자동 grep 못 잡음) | [impact-map.md](impact-map.md) |

## 카테고리 공통 원칙

1. 어떤 leaf 든 60줄 넘으면 즉시 폴더로 분기 (예: `electron-security/{preload,csp,path-safety}.md`).
2. 모든 leaf 는 `> 이 문서는 ~~ 작업 시 본다` 첫 줄 description 필수.
3. 코드 변경 시 관련 leaf 의 규칙 위반 여부를 `verifier` 서브에이전트가 검사.
4. 모듈 구조·IPC 계약·동작 흐름은 [../architecture/README.md](../architecture/README.md) 와 기존 [../architecture.md](../architecture.md) / [../workflow.md](../workflow.md) 참조.
