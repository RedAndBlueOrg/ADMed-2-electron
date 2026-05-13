# docs/ — 트리 라우팅 인덱스

> 이 파일은 트리의 루트 인덱스다. CLAUDE.md 본체에서 카테고리만 먼저 찍고, 여기서 카테고리 → 세부로 라우팅한다.

## 카테고리

| 카테고리 | 무엇이 있는가 | 인덱스 |
|---------|-------------|--------|
| `development/` | 코드 컨벤션 / Electron 보안 / 검증·테스트 / PR / 빌드·배포 / 사고기록 / 의미의존 / Claude 워크플로 | [development/README.md](development/README.md) |
| `architecture/` | 모듈 구조 / IPC 계약 / 데이터 흐름 / 동작 워크플로 | [architecture/README.md](architecture/README.md) |
| `features/` | 기능별 동작 스펙 (재생목록·HLS / 클리닉 / 날씨 / 업데이터) | [features/README.md](features/README.md) |
| `workflow/` | 멀티 에이전트 오케스트레이션 / 핸드오프 / critic 호출 | [workflow/README.md](workflow/README.md) |
| `progress.md` | 진행 상태 / 버전 / 날짜 (CLAUDE.md 본체 X) | [progress.md](progress.md) |

## 이미 있던 플랫 문서 (그대로 유지, 신규 트리가 이쪽을 참조)

| 파일 | 내용 |
|------|------|
| [architecture.md](architecture.md) | 프로젝트 구조 / 컴포넌트 / 데이터 흐름 (상세) |
| [workflow.md](workflow.md) | 앱 시작 → 재생목록 준비 → 렌더링 → 클리닉/날씨/업데이트 동작 흐름 |
| [testing-plan.md](testing-plan.md) | 수동 스모크 테스트 시나리오 (자동 테스트 스위트 없음) |

## 트리 작성 규칙

- 모든 leaf 첫 줄에 `> 이 문서는 X 작업 시 본다` description 명시 (자동 라우팅용)
- leaf 1개당 ≤60줄. 길어지면 즉시 폴더로 분기 (서브카테고리 README + 새 leaf 들).
- 카테고리 인덱스 README ≤50줄, 라우팅 테이블만.
- 이 프로젝트엔 starter 의 `infra/`(worktree 포트·CORS·Vite proxy) 가 없음 — backend/frontend 분리 dev 서버가 없어서. worktree 는 `git worktree` 로 그냥 쓰면 됨.
