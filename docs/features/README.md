# features/ — 기능별 동작 스펙 인덱스

> 이 폴더는 기능 구현 / 변경 / 디버깅 시 본다. planner / designer / frontend(renderer) / backend(main) 가 자주 read.

## leaf 들

| 파일 | 기능 |
|------|------|
| [playlist-hls.md](playlist-hls.md) | 시나리오 → 재생목록, 자산 다운로드/캐시, HLS(`.m3u8`) 및 HLS ZIP, 로컬 캐시 HTTP 서버, 재생 엔진(이미지/비디오/HLS), stall 처리 |
| [clinic.md](clinic.md) | 진료 대기현황 — REST 초기 대기열, STOMP WebSocket 실시간, 카드 회전·스크롤, 호출 팝업 + 음성(TTS) |
| [weather.md](weather.md) | 날씨 패널 — 좌표 결정(설정→Geolocation→IP), 기상청 격자 변환, 초단기예보 API, 시계 |
| [updater.md](updater.md) | 자동 업데이트(`electron-updater`) — GitHub Releases, 다운로드/설치, 콘텐츠 동기화 경합 |

## 작성 원칙

- 한 기능 = 한 leaf (≤60줄). 커지면 폴더로 분기 (`playlist-hls/{pipeline,cache-server,playback}.md`).
- 첫 줄 description 필수: `> 이 문서는 ~~ 구현 / 변경 / 디버깅 시 본다`
- 표준 섹션: 한 줄 정의 / 동작 흐름 / 관련 모듈·함수 / 환경변수 / 엣지·실패 / 관련 사고

## 다른 곳

- 레이아웃 모드(N/A/B/Y) ↔ 어떤 기능이 켜지나 → [../development/impact-map.md](../development/impact-map.md) "`waitingInfo` ↔ 레이아웃" + 각 feature leaf
- 공지 마퀴 / 랜딩 오버레이 / 창·트레이·컨텍스트 메뉴 — 별도 leaf 없음, [../architecture/module-structure.md](../architecture/module-structure.md) + 코드 참조
- 전체 동작 흐름(시간 순) → [../workflow.md](../workflow.md)
