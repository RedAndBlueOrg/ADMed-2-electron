아키텍처 개요 (v2.0.3)
=====================

컴포넌트
--------
- **Main(Process)**  
  - `.env`/`device_config.ini`/`window-state.ini`를 로드해 런타임 설정을 준비합니다.  
  - 시나리오 API(`SCENARIO_API_URL?id=<device_serial>`) 호출 → 템플릿 URL 생성(`TEMPLATE_BASE_URL`).  
  - 자산 캐시(`%TEMP%/admed-cache`) 관리, HLS ZIP 다운로드·압축 해제 후 로컬 HTTP 서버로 제공.  
  - IPC 핸들러 제공: 재생 목록 준비, 공지 조회, 날씨/클리닉 설정 전달, 컨텍스트 메뉴 호출.  
  - 자동 실행(`auto-launch`), 트레이 아이콘, 창 상태 저장/복원, 자동 업데이트(`electron-updater`).  
  - 관리자 설정(비밀번호 검증 후 `device_serial` 변경) UI를 모달로 렌더링.

- **Renderer(Process)**  
  - 재생 목록을 받아 이미지(지정 시간), 동영상, HLS 스트림을 플레이어로 표시합니다.  
  - 공지 배너 스크롤, `waitingInfo` 모드에 따른 레이아웃(공지/날씨/대기 현황) 적용.  
  - 날씨 패널: Geolocation/IP 또는 설정 좌표로 기상청 초단기예보 호출 → 시계/아이콘 렌더링.  
  - 대기 현황: REST로 초기 대기열, WebSocket으로 실시간 이벤트 수신 → 카드/스크롤/호출 팝업(TTS 오디오) 반영.  
  - 랜딩 프레임: 재생 목록이 없거나 오류 시 `LANDING_URL`을 iframe으로 노출.  
  - 다운로드/업데이트 진행 상황, 버전 토스트 등을 오버레이로 표시.

- **Preload**  
  - `mediaAPI`(재생 목록 준비, 공지 조회, 날씨 설정, 다운로드 이벤트), `clinicWS`(WS start/stop/listen), `appInfo`(버전) 브리지 노출.  
  - 렌더러가 직접 환경 변수에 접근하지 않아도 필요한 최소 설정을 전달합니다.

데이터 흐름
-----------
1. **초기화**: Main이 환경 변수/INI를 읽어 창 상태와 디바이스 시리얼을 복원, 자동 실행·트레이·업데이트를 설정합니다.  
2. **재생 목록 준비**: 렌더러가 `playlist:prepare` IPC를 호출 → Main이 시나리오 API/공지 API를 호출하고 자산을 캐시한 뒤 URL/로컬 경로/대기정보/멤버 seq 등을 반환합니다.  
3. **플레이어 렌더링**: 렌더러는 반환된 재생 목록을 순회하며 이미지 타이머·동영상 loop·HLS(`hls.js`)를 처리하고, 공지/레이아웃/랜딩 화면을 동적으로 토글합니다.  
4. **대기/클리닉 연동**: `waitingInfo === 'Y'` 또는 API 제공 시 REST로 초기 대기열을 받아 카드 렌더링 → WebSocket으로 수신한 이벤트를 큐에 반영하고 호출 팝업/음성을 실행합니다.  
5. **날씨 갱신**: 대기 모드 `B`일 때 좌표를 결정(설정 → Geolocation → IP Fallback)하고 기상청 API를 호출, 시간 정렬된 예보를 선택해 패널에 표시합니다.  
6. **상태 유지**: 창 이동/크기/전체화면/항상위 상태를 실시간 저장, 컨텍스트 메뉴에서 프리셋/중앙정렬/리로드/자동 실행/관리자 설정을 제공합니다.

저장소·네트워크
---------------
- 로컬 저장: `%APPDATA%/ADMed/device_config.ini`, `%APPDATA%/ADMed/window-state.ini`, `%TEMP%/admed-cache/`.  
- 네트워크: 시나리오 API, 템플릿 파일 CDN, 공지 API, 클리닉 REST/WS, 기상청 초단기예보, IP 위치(`https://ipapi.co/json/`).  
- 배포/업데이트: GitHub Releases(`RedAndBlueOrg/ADMed-2-electron`)를 기본 소스로 사용하며, 토큰 제공 시 비공개 릴리스도 지원.
