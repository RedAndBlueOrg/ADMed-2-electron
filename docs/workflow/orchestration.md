# 메인 = 오케스트레이터 (실용 모드) — SSOT

> 이 문서는 메인의 책임 / 직접 vs 위임 임계값 / 검증·비판 4개 위임 규칙을 정의하는 **단일 출처(SSOT)**. 메인이 작업 종류 인지 후 어떤 액션 취할지 결정 시 본다.

## 메인의 책임

1. **작업 종류 인지** — 사용자 발화 / 컨텍스트에서 어떤 영역 작업인지 (main process / renderer / IPC / 빌드 등)
2. **임계값 판정 → 직접 처리 또는 위임** — 아래 §임계값
3. **핸드오프 페이로드 표준 준수** — 위임 시 [handoff-payload.md](handoff-payload.md)
4. **결과 종합 / 다음 단계 결정** — 핸드오프 페이로드 prompt 에 그대로 인용 (재요약 X)
5. **사용자 결정 지점 식별** — MVP 범위 / 디자인 선택 / 운영(현장 무인 운영) 영향 / 배포 시점
6. **작업 단위 종료 시 progress.md 1~3줄 갱신** — 후보 종합

## 직접 vs 위임 임계값 ★

**원칙: 메인이 능력되고 위임 오버헤드가 작업보다 크면 직접 한다.**

### 메인 직접 처리 OK (모두 충족)
- 1~2 파일 한정 / 영향 범위 명백 (cross-cutting 아님 — 특히 IPC 채널·`preload.js` 안 건드림)
- 새 도메인 지식 read 불필요 (이미 컨텍스트에 있음)
- 변경량이 한 turn 안에 파악·수정 가능 (~30줄 안팎)

### 위임이 필요 (하나라도 해당)
- 여러 파일 / main↔renderer cross-cutting
- IPC 채널 신규·시그니처 변경 (`preload.js` 브리지 + 양쪽 호출처 동시 갱신)
- 캐시·다운로드·HLS 파이프라인 / 자동 업데이트 경합 같은 흐름 변경
- Electron 보안 표면 변경 (`webPreferences`, CSP, `app.commandLine`)
- 기획 / MVP / 디자인 결정 필요
- 코드 변경 후 검증 (tester / reviewer — 항상)

### 모호하면 → 위임 쪽으로
한 번 더 비싼 게 잘못된 결과보다 싸다.

## 검증·비판 4개의 위임 규칙 ★

| 에이전트 | 호출 시점 | 호출 시 위임 |
|---------|---------|------------|
| `tester` | 모든 코드 변경 직후 | 항상 (자기 코드 자기 테스트 편향) |
| `reviewer` | PR 직전 | 항상 (자기 코드 자기 리뷰 편향) |
| `verifier` | PR 직전 (선택) | 호출 시 항상 |
| `critic` | **큰 결정 직후만** (단순 작업은 생략) | 호출 시 항상 (자기 결정 자기 비판 편향) |

핵심 구분: **tester / reviewer** = 매 작업 + 호출 시 항상 위임 / **verifier / critic** = 선택 호출 + 호출하기로 했으면 항상 위임. critic 시점 → [critic-usage.md](critic-usage.md).

## 병렬 vs 순차
같은 파일 수정 가능성 있으면 순차, 명백히 분리되면 병렬. 의심스러우면 순차. 특히 backend(main)·frontend(renderer) 가 같은 IPC 채널을 만지면 순차 (backend 가 채널·preload 먼저 → frontend 호출처). 상세 → [parallel-conflict.md](parallel-conflict.md).

## 호출 흐름

```
사용자 발화 → preflight (트리 leaf 라우팅) → 임계값 판정
  ├─ 직접 → 메인 처리 → tester (검증은 항상 위임) → reviewer
  └─ 위임 → 적절한 에이전트 (planner / architect / backend(main) / frontend(renderer) / designer)
       → 큰 결정이면 critic
       → 핸드오프 페이로드 보고 → 메인이 페이로드 인용해 다음 에이전트 호출
       → 완료 시 tester → (verifier 선택) → reviewer → 메인 (commit / PR / progress.md 갱신)
```

## 컨텍스트 격리
각 에이전트의 풀 로그는 에이전트 안에 남고 메인에는 페이로드 요약만. 메인 토큰 효율.
