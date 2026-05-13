# 역할 핸드오프 흐름

> 이 문서는 메인이 새 기능 / 버그 수정 / 리팩토링 시 어떤 순서로 에이전트들을 호출할지 결정 시 본다. 정책은 [orchestration.md](orchestration.md), 페이로드 형식은 [handoff-payload.md](handoff-payload.md), critic 시점은 [critic-usage.md](critic-usage.md).

## 표준 흐름 (신규 기능, 큰 변경)

```
1. planner            — 요구사항 분해 / MVP 범위 / 검증 지표 (수동 스모크 절차 포함)
   ↓
2. critic             — (큰 결정 시) 기획 비판
   ↓
3. architect          — 모듈 배치 / IPC 계약 / 데이터 흐름 / 캐시·업데이트 경합 검토
   ↓
4. critic             — (큰 결정 시) 설계 비판
   ↓
5. backend(main) / frontend(renderer) / designer — 병렬 또는 순차 → parallel-conflict.md
   ↓
6. tester             — 시나리오 발굴 + node --check + IPC 동기화 grep + 스모크 체크리스트
   ↓ (FAIL → 메인 수정 → 다시 6)
7. verifier           — (PR 직전 선택) 4 도메인 정적 검증 (electron-security / ipc / secrets / cache-path)
   ↓
8. reviewer           — 독립 코드 리뷰 / PR 체크리스트
   ↓
9. 메인               — 사용자 GUI 스모크 요청 → 확인 / commit / PR / progress.md 갱신
```

## 흐름 변형

- **버그 수정 (작음, IPC 안 건드림)**: 메인이 직접 → tester → reviewer (planner / architect / critic 생략)
- **버그 수정 (도메인 깊음)**: backend(main) or frontend(renderer) → tester → reviewer
- **HLS / 캐시 / 파이프라인 변경**: architect (흐름·경합 검토) → critic → backend(main) → tester → reviewer
- **리팩토링**: architect → critic → 구현 → tester → (verifier) → reviewer
- **디자인 폴리싱**: designer → 메인(사용자 옵션 선택) → frontend(renderer) → tester (시각 회귀 + 누수 확인)

## 임계값 판정 후 직접 처리

[orchestration.md §임계값](orchestration.md) 충족 시 메인 직접:
- 직접 처리하더라도 **검증은 항상 tester / reviewer 위임** (자기 평가 편향)
- 메인 직접 변경의 progress.md 갱신 책임도 메인

## 핸드오프 형식

각 에이전트 보고 끝에 **반드시** [handoff-payload.md](handoff-payload.md) 표준 페이로드. 메인은 페이로드를 다음 에이전트 prompt 에 **그대로 인용**.

## 사용자 결정 지점

- 기획 단계 MVP 범위 확정
- critic ⚠ / ❌ → 사용자가 진행 / 수정 / 재설계 선택
- 디자인 옵션 선택 (designer 가 2~3안 제시 시)
- Electron 보안 표면·자동 업데이트 동작 변경 승인
- `npm start` GUI 스모크 (tester 가 헤드리스로 못 함 → 사용자가 실제 확인)
- PR 머지 / `npm run dist` 배포 시점
