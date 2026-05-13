# 검증·비판 에이전트 분리 — 왜 + 어떻게

> 이 문서는 tester / verifier / reviewer / critic 4개가 왜 별도 서브에이전트인지 / 어느 시점에 호출되는지 설계 의도가 헷갈릴 때 본다. 위임 규칙·호출 시점은 [orchestration.md](orchestration.md), critic 시점은 [critic-usage.md](critic-usage.md).

## 왜 별도인가

코드·설계를 만든 세션은 자기 시각에 갇힌다. 시점별로 분리한 비판자 4개:

| 시점 | 에이전트 | 무엇을 잡나 |
|------|--------|-----------|
| 기획·설계 직후 (구현 전) | `critic` | 전제 약점 / 누락 시나리오 / 대안 |
| 코드 변경 직후 | `tester` | 빠진 edge case / 회귀 / 영향 범위 + node --check + IPC 동기화 + 스모크 체크리스트 |
| PR 직전 (선택) | `verifier` | 정적 규칙 위반 (electron-security / ipc-contract / secrets / cache-path) |
| PR 직전 | `reviewer` | 클린코드 / 보안 / 누수 / 재사용 누락 / PR 체크리스트 |

## 위임 규칙

[orchestration.md §검증·비판 4개의 위임 규칙](orchestration.md) 참조. 핵심 구분:
- tester / reviewer: **매 작업** + 호출 시 항상 위임
- verifier / critic: **선택 호출** + 호출했으면 항상 위임

## 각 에이전트의 책임 / 보고 형식

`.claude/agents/` 의 각 정의 참조:
- [tester.md](../../.claude/agents/tester.md) — 이 프로젝트는 자동 테스트 스위트 없음 → 정적·무결성 + 수동 스모크 체크리스트
- [verifier.md](../../.claude/agents/verifier.md)
- [reviewer.md](../../.claude/agents/reviewer.md)
- [critic.md](../../.claude/agents/critic.md)

## 메인이 따르는 패턴

```
코드 변경 (메인 직접 또는 위임 결과)
  ↓
tester (Agent tool, subagent_type=tester) → PASS / FAIL 페이로드 + 스모크 체크리스트
  ↓
FAIL → 메인 수정 → 다시 tester
PASS + PR 직전 → verifier (선택) → reviewer
PASS + 일상 변경 → reviewer 직접
  ↓
reviewer PASS → 메인이 사용자에게 GUI 스모크(`npm start`) 요청 → 확인 → commit / PR
```

> tester 는 GUI Electron 앱을 헤드리스로 끝까지 못 돌린다. "PASS" = 정적/무결성 통과 + 스모크 체크리스트 정리. 실제 화면 확인은 메인이 사용자에게.

## 금지

- 메인 직접 `/test` / `/verify` / 코드 리뷰 / 비판 (서브에이전트 안에서만) — 단 메인이 변경 파일 한두 개 `node --check` 하는 건 OK
- 4개 에이전트가 코드 수정 (보고만, 메인이 수정)
- 4개 에이전트가 메인에 풀 로그 전달 (요약 페이로드만)
