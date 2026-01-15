동작 워크플로 (v2.0.3)
=====================

앱 시작
-------
1. `.env` → `device_config.ini`(`device_serial`) → `window-state.ini`를 로드해 환경/창 상태를 초기화합니다.
2. 자동 실행(`auto-launch`)과 트레이 아이콘을 설정하고, geolocation 권한을 자동 승인하도록 세션 핸들러를 등록합니다.
3. 패키지 모드일 경우 자동 업데이트(`electron-updater`)를 시작합니다.

재생 목록 준비
-------------
1. 렌더러가 `mediaAPI.preparePlaylist()` IPC를 호출합니다.
2. Main은 `SCENARIO_API_URL?id=<device_serial>`을 호출해 `templates[]`, `waitingInfo`, `memberSeq`를 가져옵니다.
3. 각 템플릿에 대해 `TEMPLATE_BASE_URL?img=<name>&type=<ext>`로 최종 URL을 만들고 타입을 판별합니다.  
   - 이미지(jpg/png/gif/webp): 지정된 `time`(초)만큼 표시  
   - 비디오(mp4/mov): loop 재생  
   - HLS(`.m3u8`): 스트리밍 URL 그대로 사용  
   - HLS ZIP: ZIP을 캐시에 풀어 `.m3u8`을 찾아 로컬 HTTP 서버 URL로 교체
4. 새로 다운로드한 자산만 백그라운드로 가져오고 진행률을 렌더러에 브로드캐스트합니다.
5. 15분 이상 쓰지 않은 캐시 파일·폴더를 정리합니다.
6. 공지(`…/dapi/clinic/notice/list?memberId=<memberSeq>`)를 병렬로 조회해 함께 반환합니다.

플레이어 렌더링
--------------
- 렌더러는 전달받은 재생 목록을 순회하며 이미지 타이머/비디오 loop/HLS(`hls.js`)를 처리합니다. 실패 시 다음 항목으로 넘어갑니다.
- `waitingInfo` 값으로 공지/날씨/대기 패널 노출을 결정하고, 하단 공지 배너는 리스트를 순환하며 스크롤합니다.
- 랜딩: 재생 목록이 비었거나 모두 실패하면 `LANDING_URL`을 iframe으로 보여줍니다.

대기/클리닉 연동
---------------
1. `waitingInfo === 'Y'` 또는 시나리오에서 멤버 seq가 내려오면 REST(`CLINIC_API_ORIGIN/dapi/clinic/list`)로 초기 대기열을 불러옵니다.  
2. 대기열 카드에 현재/다음 환자, 호출 상태, 우측/좌측 배치를 반영합니다.  
3. WebSocket(`CLINIC_WS_ORIGIN/clinic/topic/<memberSeq>/<clinicSeq?>`)을 열어 실시간 이벤트를 수신하고, 리스트/카드/스크롤을 갱신합니다.  
4. 호출 이벤트는 팝업+음성(`modalAudio.wav` TTS)을 큐잉해 순차적으로 재생합니다.

날씨 패널
--------
- `waitingInfo === 'B'`일 때만 표시합니다.
- `WEATHER_LAT/LON`이 있으면 고정 좌표를 사용하고, 없으면 Geolocation 권한을 요청합니다. 실패 시 IP 기반 위치(`ipapi.co`)로 Fallback 합니다.
- 기상청 초단기예보 API(`WEATHER_SERVICE_URL`, `WEATHER_SERVICE_KEY`)에서 최근 시각 예보를 선택해 아이콘/기온/습도/풍속을 표시하고 시계는 분 단위로 동기화합니다.

오류 및 복구
-----------
- 시나리오/자산 다운로드 실패 시 다음 항목으로 건너뛰고, 모든 항목 실패 시 랜딩 화면으로 전환합니다.
- 네트워크 오류가 해소되면 재시도하며, 창 컨텍스트 메뉴의 “새로고침”으로 수동 리로드 가능합니다.

업데이트 및 종료
--------------
- 자동 업데이트 다운로드가 완료되면 종료 시 자동 설치되며, 업데이트 이벤트는 렌더러에 전달돼 오버레이로 표시됩니다.
- 창 닫기 시 기본적으로 숨기기 동작을 하고, 트레이 메뉴나 컨텍스트 메뉴의 “종료”로 완전 종료할 수 있습니다.
