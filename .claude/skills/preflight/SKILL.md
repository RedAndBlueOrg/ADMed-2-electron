---
name: preflight
description: |
  Use proactively before starting any code work on the ADMed Electron player. Detects work type from the user prompt or recent context, and routes to the matching docs/ leaf so Claude reads only the relevant subset of the tree (encyclopedia index → entry → sub-entry), then has main decide direct-vs-delegate.
  Triggers: "main 프로세스", "renderer", "IPC", "playlist", "HLS", "캐시", "clinic", "날씨", "updater", "auto-launch", "tray", "preload", "빌드", "배포", "보안 점검", "레이아웃", "공지", "오버레이".
---

# /preflight — 작업 종류 → 트리 leaf 라우팅

## 목적
Claude 가 전체 docs/ 트리를 다 읽지 않도록, 작업 종류만 보고 **필요한 leaf 만** read 하게 한다.

## 라우팅 표

| 작업 종류 | 자동 read 대상 leaf |
|---------|------------------|
| main 프로세스 모듈 구현 (config / state / window / tray / context-menu / dialogs) | `docs/development/code-conventions.md`, `docs/development/electron-security.md`, `docs/architecture/module-structure.md` |
| IPC 채널 추가·변경 / preload 브리지 | `docs/architecture/ipc-contracts.md` + `docs/development/electron-security.md` (계약 + 권한 경계) |
| renderer 구현 (media / layout / notice / overlays / move-handle) | `docs/development/code-conventions.md` + 해당 `docs/features/<name>.md` |
| 재생목록 / 다운로드 / 캐시 / HLS (ZIP) / 로컬 HTTP 서버 | `docs/features/playlist-hls.md` + `docs/architecture/module-structure.md` + `incident-log.md` (HLS 관련) |
| 클리닉 대기현황 / STOMP WS / 호출 팝업·TTS | `docs/features/clinic.md` + `incident-log.md` |
| 날씨 패널 / 기상청 API / 격자 변환 / Geolocation·IP fallback | `docs/features/weather.md` |
| 자동 업데이트 (`electron-updater`) / 콘텐츠 동기화 경합 | `docs/features/updater.md` + `incident-log.md` (업데이트 경합) |
| auto-launch / Windows 시작프로그램 / 레지스트리 | `docs/development/code-conventions.md` (Windows 전용 코드 주의) |
| 빌드 / NSIS / `electron-builder` / GitHub Releases / CI | `docs/development/build-deploy.md` |
| Electron 보안 점검 (contextIsolation / CSP / commandLine 플래그) | `docs/development/electron-security.md` + `incident-log.md` |
| 장시간 운영 / 메모리·타이머 누수 의심 | `incident-log.md` + `impact-map.md` |
| 코드 리뷰 / PR | `docs/development/pr-checklist.md`, `docs/development/code-review-checklist.md` |
| 검증 / 테스트 | `docs/development/testing.md`, `docs/testing-plan.md` |

## 봉쇄 상태별 incident 노출
- `✅ 자동 차단` → preflight 단계에서 read 대상에 포함하지 않음 (시스템이 막으니 노이즈)
- `⚠ 가이드만` → 관련 작업 종류일 때 read 강제
- `🔴 반복` → 항상 read 강제 + 사용자에게 자동화 검토 요청

## 메인이 호출하는 흐름
1. 사용자 발화 / 작업 인지
2. preflight 가 작업 종류 판단 → 위 표의 leaf 들만 read
3. 메인이 임계값 판정 ([orchestration.md](../../../docs/workflow/orchestration.md)):
   - 직접 처리 가능하면 메인이 leaf 규칙 따라 구현
   - 임계값 초과면 적절한 역할 에이전트로 위임 + 핸드오프 페이로드
4. 작업 끝 → `/test` (+ PR 직전엔 `/verify`), 둘 다 별도 에이전트 (항상 위임)

## (옵션) 발화 측정
skill 자체는 코드를 자동 실행 못 함. 측정이 필요하면 메인이 한 줄:
```bash
bash -c 'source .claude/hooks/_lib.sh && log_metric preflight routed "<작업 종류> → <leaf 경로>"'
```

## 자동 호출
description 의 trigger 키워드 매칭으로 코드 작업 시작 시 자동 호출.
