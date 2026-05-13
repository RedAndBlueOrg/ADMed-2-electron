# critic 호출 시점 — 가이드

> 이 문서는 critic 서브에이전트를 언제 부를지·결과를 어떻게 처리할지 결정 시 본다. critic 의 책임 / 보고 형식은 [.claude/agents/critic.md](../../.claude/agents/critic.md), 큰 정책은 [orchestration.md](orchestration.md).

## 핵심 구분 (헷갈리지 말 것)

- critic 은 **매 작업마다 호출 X** (planner / tester 처럼 항상 호출되지 않음)
- critic 을 **호출하기로 했으면** 메인 직접 X, 항상 서브에이전트 위임 (자기 결정 자기 비판 편향 회피)

## 호출 시점

| 상황 | critic 호출 |
|------|------------|
| planner 가 새 기능 MVP 범위 보고 | 권장 — 전제 / 가정(현장 운영 조건) 검증 |
| architect 가 모듈 배치 / IPC 계약 / 캐시 파이프라인 설계 보고 | 권장 — 대안 / 실패 시나리오 |
| 캐시·다운로드·HLS 파이프라인 큰 변경, 자동 업데이트 흐름 변경 | 강한 권장 (무인 운영·장시간·네트워크 단절 실패 모드) |
| Electron 보안 표면 변경 (`webPreferences`, CSP, `app.commandLine` 플래그) | 강한 권장 |
| 단순 버그 픽스 / 작은 기능 / 오타 / 한 모듈 내 리팩토링 | 생략 |
| 디자인 폴리싱 | 생략 (designer 자체가 비판 역할) |
| 코드 리뷰 단계 | 생략 (reviewer 가 그 단계의 비판자) |

## 메인의 처리

critic 보고 받으면:
- ✅ 진행 OK → 원안 그대로 다음 단계
- ⚠ 수정 권고 → 사용자에게 요약 + 원안/수정안 선택 요청
- ❌ 재설계 필요 → 상위 에이전트(planner/architect) 재호출, critic 의 약점을 prompt 에 명시 인용

## 안티 패턴

- ❌ 모든 planner / architect 보고 직후 critic 자동 호출 → 단순 작업까지 비싼 oversight
- ❌ critic 보고 무시하고 진행 → 비판 의의 상실
- ❌ 메인이 critic 역할을 자기가 함 → 자기 결정 자기 비판 편향
