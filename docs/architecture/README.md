# architecture/ — 모듈 구조 / IPC / 데이터 흐름 인덱스

> 이 폴더는 모듈 배치 / IPC 계약 / 데이터 흐름 설계·변경 시 본다. architect 에이전트의 read 영역.

## leaf 들 (신규)

| 파일 | 내용 |
|------|------|
| [module-structure.md](module-structure.md) | main/renderer/preload 모듈 책임 / 공유 상태 / lazy 초기화 / 로컬 파일·캐시 경로 |
| [ipc-contracts.md](ipc-contracts.md) | 모든 IPC 채널 목록 (채널명 / invoke·send / 인자·반환 / preload 브리지 / renderer 호출처) — IPC 변경 시 함께 갱신 |

## 이미 있던 상세 문서 (그대로 참조)

| 파일 | 내용 |
|------|------|
| [../architecture.md](../architecture.md) | 프로젝트 구조 / 컴포넌트 (Main·Renderer·Preload) / 모듈 설계 원칙 / 데이터 흐름 / 저장소·네트워크 — 가장 상세 |
| [../workflow.md](../workflow.md) | 앱 시작 → 재생목록 준비 → 플레이어 렌더링 → 클리닉/날씨/업데이트 동작 흐름 (시간 순) |

## 작성 원칙

- 각 leaf ≤60줄. `ipc-contracts.md` 가 길어지면 채널 그룹별 폴더로 분기.
- IPC 채널 / `preload.js` 브리지 / 공유 상태 변경 시 같은 작업 단위에서 `module-structure.md` / `ipc-contracts.md` 갱신.
- 도메인 다이어그램이 필요하면 Mermaid 로 인라인.

## 갱신 트리거

- 새 `src/main/` 또는 `src/renderer/` 모듈 추가 / 책임 이동
- IPC 채널 신규·시그니처 변경
- 공유 상태(`state.js`) 필드 추가, 캐시 디렉토리 레이아웃 변경
- `.env` 새 설정값 추가
