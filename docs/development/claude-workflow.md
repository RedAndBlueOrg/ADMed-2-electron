# Claude 워크플로 운영 표 (이 프로젝트 셋업 기준)

> 이 문서는 hook / skill / agent 동작 / Claude 워크플로 점검 시 본다. starter 의 Spring Boot/React 전제 항목은 이 프로젝트에 맞게 치환됨.

## Hook 표 (4종)

| 시점 | hook | 동작 | 결과 |
|------|------|------|------|
| SessionStart | `session-start.sh` | incident-log 활성(⚠/🔴) + recent 5 commits + `docs/progress.md` 끝 30줄 자동 주입 (worktree 포트 섹션은 이 프로젝트에 없어 제거) | injected |
| PreToolUse(Bash) | `block-dangerous-commands.sh` | `settings.json` deny prefix 가 못 잡는 정규식 우회 패턴만 (fork bomb / `dd if=...of=/dev/` / `mkfs.` / `chmod 777 /` / `> /dev/sdX` / `rm -r --force` 변종) | deny |
| Stop | `notify-test-needed.sh` | `.js`/`.html` 변경 + 30분 윈도우 내 `/test`·`/verify` 호출 흔적 없으면 환기 | notify |
| Stop | `notify-progress-stale.sh` | `docs/progress.md` 가 N일(기본 7)+ 갱신 안 됐고 그 사이 커밋 2건+ 이면 환기 | notify |

**미적용 (starter 에 있었으나 이 프로젝트엔 부적합):** `post-format.sh`(eslint/prettier/spotless 미설정), `block-migration-conflict.sh`(DB 마이그레이션 없음). 필요해지면 추가.

## Skill 표 (3종)

| 명령 | 자동 호출 트리거 | 담당 에이전트 | 영역 |
|------|--------------|------------|------|
| `/test` | 코드 변경 후, "테스트 돌려줘", "동작 확인" | tester | node --check + IPC 동기화 grep + npm ls 무결성 + 수동 스모크 체크리스트 |
| `/verify` | PR 전, "규칙 위반 검사", "보안 점검" | verifier | 4 도메인 정적 검증 (electron-security / ipc-contract / secrets / cache-path) |
| `preflight` | "main 프로세스", "renderer", "IPC", "HLS", "캐시", "clinic", "날씨", "updater" 등 작업 종류 인지 | (메인이 호출) | 트리 leaf 라우팅 |

**미적용:** `dev-port`(backend/frontend 분리 dev 서버 없음).

## Agent 표 (9종)

| 에이전트 | 트리거 | read 영역 | 호출 빈도 |
|---------|--------|----------|---------|
| planner | 기획 / 요구사항 / MVP / 스펙 | docs/features/, progress.md, testing-plan.md | 큰 결정 작업 |
| critic | 약점 / 대안 / 리스크 / planner·architect 직후 | 상위 페이로드 + 관련 docs | **선택** (큰 결정 시) |
| architect | 모듈 구조 / IPC 계약 / 데이터 흐름 / 캐시 파이프라인 | docs/architecture/, code-conventions.md, electron-security.md, impact-map.md | 큰 결정 작업 |
| backend | **= Electron main process** — `src/main/`, `main.js`, `preload.js`, IPC 핸들러, 캐시·다운로드·HLS, updater, tray | docs/development/{code-conventions,electron-security,build-deploy}.md, docs/architecture/ | 임계값 초과 시 |
| frontend | **= renderer process** — `src/renderer/`, `index.html`, 미디어 재생, 레이아웃, clinic UI, 날씨, 오버레이 | docs/development/code-conventions.md, docs/architecture/ipc-contracts.md, docs/features/ | 임계값 초과 시 |
| designer | UI / UX / 레이아웃 / 색상 / 가독성 (대기실 사이니지) | index.html, docs/features/<해당>.md | UI 결정 시 |
| tester | 테스트 / /test / 검증 | git diff, testing-plan.md, incident-log.md, impact-map.md | **매 작업** |
| verifier | /verify / 정적 검증 / 보안 점검 | docs/development/{electron-security,code-conventions}.md, docs/architecture/ipc-contracts.md | **선택** (PR 직전) |
| reviewer | 코드 리뷰 / PR / /review | code-review-checklist.md, pr-checklist.md, incident-log.md | **매 작업** |

자세한 호출 규칙·임계값 → [../workflow/orchestration.md](../workflow/orchestration.md) (SSOT)

## 메트릭 점검

- `tail -50 .claude/hooks/.metrics.log` — hook 발화 내역 (시간 / hook / 결과 / 디테일)
- 신호: `session-start | injected` 매 세션 = 정상 / `silent` 다수 = incident-log·progress 비어있거나 jq 미설치 / `notify-test-needed | notify` 후에도 메인이 검증 안 위임 = 습관 점검 / `block-dangerous-commands | deny` 자주 = 위험 패턴 시도 확인
