ADMed (Windows Electron)
========================

개요
----
- 의료기관 현장에서 시나리오 API가 내려주는 재생 목록(이미지/동영상/HLS)을 받아 로컬 캐시로 재생하는 Windows용 Electron 플레이어입니다.
- 재생 목록 외에도 공지사항, 대기 현황, 날씨 정보를 표시하며, 진료실 호출 알림과 랜딩 페이지(대기 화면)까지 포함합니다.
- 2.0.3이 최신 버전이며, 자동 업데이트를 통해 배포된 릴리스를 받아 설치합니다.

요구사항
--------
- Node.js 18 이상, npm
- Windows 10/11, GPU 사용 가능 환경 권장
- 필수 환경 변수: `SCENARIO_API_URL`, `TEMPLATE_BASE_URL` (재생 목록과 템플릿 URL에 사용)
- 선택 환경 변수: `CLINIC_API_ORIGIN`, `CLINIC_WS_ORIGIN`, `WEATHER_*`, `LANDING_URL`, `ADMIN_PASSWORD`, `GH_TOKEN`/`GITHUB_TOKEN`

설치 및 실행
------------
```bash
npm install
npm start   # 개발/동작 확인
# 또는
npm run dist   # 배포용 설치 파일 생성(NSIS)
```
- `.env` 파일에 API/서비스 주소를 설정한 뒤 실행하세요. 런타임에도 `.env`는 패키지 리소스 경로에서 자동 로드됩니다.
- 디바이스 일련번호는 `%APPDATA%/ADMed/device_config.ini`의 `device_serial`을 사용하며, 관리자 메뉴(컨텍스트 메뉴 → 관리자 설정)에서 수정할 수 있습니다. `ADMIN_PASSWORD`가 설정된 경우 비밀번호 검증 후 변경됩니다.

주요 기능
---------
- **재생 목록 준비**: `SCENARIO_API_URL?id=<device_serial>`로 시나리오를 불러와 이미지/비디오/HLS/HLS ZIP을 판별합니다. `TEMPLATE_BASE_URL?img=<name>&type=<ext>`로 실재 URL을 구성합니다.
- **로컬 캐시**: `%TEMP%/admed-cache`에 미디어를 저장하고, ZIP(HLS 패키지)은 풀어 로컬 HTTP 서버에서 `http://127.0.0.1:<port>/cache/...` 형태로 제공합니다. 15분 이상 미사용 자산은 정리합니다.
- **레이아웃 제어**: 시나리오의 `waitingInfo` 값으로 공지/날씨/대기 패널 노출을 결정합니다. `N`(숨김), `A`(공지), `B`(공지+날씨), `Y`(공지+대기 현황).
- **공지/랜딩**: `…/dapi/clinic/notice/list?memberId=`로 공지 목록을 받아 하단 배너에 표시합니다. 재생 목록이 비거나 오류 시 `LANDING_URL`(기본 `https://www.admed.kr`)을 임베드해 대체 화면을 노출합니다.
- **대기/클리닉 연동**: REST(`CLINIC_API_ORIGIN/dapi/clinic/list`)로 초기 대기열을 받고, WebSocket(`CLINIC_WS_ORIGIN/clinic/topic/<memberSeq>/<clinicSeq?>`)으로 실시간 변동·호출 알림을 수신합니다. 팝업+음성(`modalAudio.wav`)으로 호출 안내를 제공합니다.
- **날씨 패널**: `WEATHER_LAT/LON`이 있으면 해당 좌표로, 없으면 위치 권한/GeoIP(IP)로 좌표를 얻어 기상청 초단기예보(`WEATHER_SERVICE_URL/WEATHER_SERVICE_KEY`)를 조회합니다. 대기 모드 `B`일 때만 표시합니다.
- **윈도우/트레이 제어**: 창 크기·위치·전체화면/항상위 설정을 저장(`%APPDATA%/ADMed/window-state.ini`)하고 컨텍스트 메뉴에서 프리셋·중앙정렬·리로드·자동 실행 토글 등을 제공합니다. 트레이 아이콘으로 최소화/종료를 지원합니다.
- **자동 실행 & 업데이트**: Startup folder shortcut로 Windows 시작 시 자동 실행되며, `electron-updater`가 GitHub Releases(리포지토리 `RedAndBlueOrg/ADMed-2-electron`)를 주기적으로 확인해 다운로드 후 자동 설치합니다. 개인 토큰(`GH_TOKEN`/`GITHUB_TOKEN`) 제공 시 비공개 릴리스도 처리합니다.

환경 변수
--------
| 이름 | 설명 |
| --- | --- |
| `SCENARIO_API_URL` | 재생 목록·대기 정보·회원 seq를 내려주는 시나리오 API 주소. `?id=<device_serial>`이 추가됩니다. |
| `TEMPLATE_BASE_URL` | 템플릿 파일 베이스 URL. `?img=<name>&type=<ext>` 쿼리로 최종 자산 URL 생성. |
| `CLINIC_API_ORIGIN` | 진료 대기 REST API 루트(`…/dapi/clinic/list`). |
| `CLINIC_WS_ORIGIN` | 진료 대기 WebSocket 루트(`…/clinic/topic/<memberSeq>/<clinicSeq?>`). |
| `WEATHER_LAT`, `WEATHER_LON` | 좌표 고정 시 사용. 없으면 Geolocation/IP로 좌표 획득. |
| `WEATHER_SERVICE_URL`, `WEATHER_SERVICE_KEY` | 기상청 초단기예보 API URL/키. 키가 없으면 날씨 패널은 표시만 하고 데이터는 비움. |
| `LANDING_URL` | 재생 목록이 없을 때 띄울 랜딩 페이지 URL(기본 `https://www.admed.kr`). |
| `ADMIN_PASSWORD` | 관리자 설정(디바이스 일련번호 변경) 비밀번호. 미설정 시 바로 수정 가능. |
| `GH_TOKEN` / `GITHUB_TOKEN` | GitHub 릴리스 다운로드/배포 시 인증용 토큰. |

로컬 파일·캐시 경로
-------------------
- `%APPDATA%/ADMed/device_config.ini` : 디바이스 일련번호 저장.
- `%APPDATA%/ADMed/window-state.ini` : 창 크기/위치/전체화면/항상 위 상태.
- `%TEMP%/admed-cache/` : 다운로드된 자산, HLS ZIP 해제본, 로컬 캐시 HTTP 서빙 루트.
- `images/icon.ico`, `modalAudio.wav` : 앱 아이콘, 호출 알림 사운드 리소스.

배포/업데이트
------------
- `npm run dist`로 NSIS 설치 파일을 생성하고 GitHub Releases에 업로드합니다(`electron-builder` 설정 참고).
- CI(GitHub Actions, `.github/workflows/release.yml`)는 `v*` 태그 푸시 시 `npm run dist -- --publish always`를 실행합니다. CI나 로컬에서 비공개 릴리스를 올릴 때는 `GH_TOKEN` 등록이 필요합니다.
- 런타임 자동 업데이트는 패키지 모드에서만 동작하며, 다운로드 완료 후 자동 종료/재시작으로 설치됩니다.

자주 쓰는 명령
-------------
- 설치: `npm install`
- 실행: `npm start`
- 배포 패키지 생성: `npm run dist`
- 캐시 폴더 바로 열기: `%TEMP%/admed-cache`
