아키텍처 개요
=============

구성 요소
--------
- **Main(Process)**  
  - `.env`/`device_config.ini`/`window-state.ini` 로드, 자동 실행 설정, 트레이 및 컨텍스트 메뉴 관리.  
  - 시나리오/공지/클리닉 API 호출, 템플릿 URL 생성, ZIP(HLS) 다운로드·압축 해제.  
  - 캐시 디렉터리(`%TEMP%/admed-cache`)를 관리하고 내장 HTTP 서버로 파일/HLS 세그먼트 서빙.  
  - IPC 핸들러를 통해 렌더러에 플레이리스트/공지/클리닉/날씨 설정 전달.

- **Renderer(Process)**  
  - 비디오/이미지/HLS 플레이어, 공지 롤링, 대기열·날씨 패널 렌더링.  
  - 네트워크 오류 시 재시도 및 온라인 이벤트 기반 복구.  
  - 클리닉 REST+WS 데이터를 UI에 반영하고 실시간 알림/효과음/음성 안내 처리.

- **Preload**  
  - `mediaAPI`(playlist 준비, 공지 조회, 컨텍스트 메뉴, 날씨 설정), `clinicWS`(WS start/stop, onMessage) 브릿지 제공.

데이터 흐름
---------
1. 메인 프로세스가 환경 설정(.env, ini)과 창 상태를 로드한 뒤 렌더러를 기동.  
2. 렌더러가 `mediaAPI.preparePlaylist()` 요청 → 메인은 시나리오 API(`SCENARIO_API_URL?id=<device_serial>`) 호출.  
3. 응답 `templates[]`를 타입별로 매핑하고, `TEMPLATE_BASE_URL?img=<name>&type=<ext>` 형태로 다운로드 URL 생성.  
4. 로컬 캐시에 존재하는 파일은 즉시 사용, 없으면 백그라운드로 다운로드하고 현재는 스트림 URL로 재생.  
5. `type: m3u8` ZIP 패키지는 내려받아 압축 해제 후 `.m3u8`을 찾아 내장 서버(`http://127.0.0.1:<port>/cache/...`)로 서빙.  
6. 렌더러는 전달받은 목록을 순회 재생(이미지는 durationSeconds, 영상은 ended 이벤트 기준). HLS는 `hls.js`가 가능하면 사용, 지원 안 되면 비디오 태그 네이티브 재생 시도.  
7. 공지·대기열·날씨 정보는 추가 IPC 호출(공지: `notice:fetch`, 날씨: `weather:config`) 및 REST/WS(클리닉)로 주기 갱신.  
8. 메인은 사용하지 않는 캐시 파일을 15분 단위로 정리하여 디스크 사용량을 제한.

파일/저장소 구조
---------------
- 소스: `main.js`(메인), `renderer.js`(UI), `preload.js`, `index.html`(레이아웃/스타일).  
- 캐시: `%TEMP%/admed-cache/<asset or package>/` + 내장 HTTP 서버.  
- 설정: `%APPDATA%/ADMed/device_config.ini`(device_serial), `%APPDATA%/ADMed/window-state.ini`(창 상태), 루트 `.env`(API 베이스).  
- 자산: `images/icon.ico`, `modalAudio.wav`(알림 음원).

외부 연동
--------
- 시나리오 API: `SCENARIO_API_URL` (필수) — 템플릿 목록/대기열 모드/멤버 seq 반환.  
- 템플릿 파일: `TEMPLATE_BASE_URL?img=<name>&type=<ext>` — 영상/이미지/HLS 패키지 다운로드.  
- 공지 API: 시나리오 호스트 기준 `/dapi/clinic/notice/list?memberId=<mSeq>`.  
- 클리닉 REST/WS: `CLINIC_API_ORIGIN/dapi/clinic/list`, `CLINIC_WS_ORIGIN/clinic/topic/<memberSeq>/<clinicSeq?>`.  
- 날씨: 기상청 초단기예보 OpenAPI(필드 T1H/REH/WSD/PTY/SKY 사용), 좌표 미설정 시 위치 권한/IP Fallback.
