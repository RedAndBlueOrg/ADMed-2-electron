# workflow/ — 멀티 역할 에이전트 운영 인덱스

> 이 폴더는 메인이 작업 위임 / 핸드오프 결정 / 병렬 vs 순차 / critic·verifier 호출 결정 시 본다. 정책 SSOT 는 [orchestration.md](orchestration.md).

## leaf 들

| 파일 | 역할 |
|------|------|
| [orchestration.md](orchestration.md) | **SSOT** — 메인 책임 / 직접 vs 위임 임계값 / 검증·비판 4개 위임 규칙 |
| [handoff-payload.md](handoff-payload.md) | 모든 핸드오프의 표준 페이로드 형식. decision drift 방지 |
| [parallel-conflict.md](parallel-conflict.md) | 병렬 vs 순차 결정 트리 / 충돌 복구 (이 프로젝트: backend=main process / frontend=renderer) |
| [critic-usage.md](critic-usage.md) | critic 호출 시점 가이드 |
| [role-handoff.md](role-handoff.md) | 표준 흐름 (planner → critic → architect → backend(main)+frontend(renderer) → tester → reviewer) |
| [independent-test.md](independent-test.md) | tester / verifier / reviewer / critic 가 별도인 이유 |

## 한 줄 요약

- 정책은 [orchestration.md](orchestration.md) 만 본다 — 다른 leaf 는 그 정책의 적용 가이드
- 핸드오프 시 페이로드 그대로 인용 (메인 재요약 X)
- "backend" = Electron main process(`src/main/`, `preload.js`), "frontend" = renderer(`src/renderer/`, `index.html`) — starter 의 역할 이름을 유지하되 의미만 치환
