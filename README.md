ADMed (Windows Electron 플레이어)
===============================

개요
----
- 시나리오 API에서 내려주는 템플릿 목록을 받아 로컬 캐시에 저장하고, 영상/이미지/HLS를 풀스크린으로 재생하는 Electron 앱입니다.
- 대기 안내(공지/대기열/날씨/클리닉 호출)와 재생목록 상태를 한 화면에 표시합니다.
- 캐시 서버를 내장해 ZIP으로 전달된 HLS 패키지를 풀어 로컬에서 서빙하며, 자동 실행/트레이 아이콘/창 위치 기억 등 운영 편의 기능을 제공합니다.

필요 환경
--------
- Node.js 18 이상, npm 동봉
- Windows (Electron 39.x 기준), GPU 사용 가능한 환경 권장
- 필수 환경 변수: `SCENARIO_API_URL`, `TEMPLATE_BASE_URL`

설치 & 실행
-----------
```bash
npm install
npm start   # Electron 실행
```
- `.env`에 API 주소를 넣어둡니다. 예시는 저장소 루트의 `.env` 참고.
- 첫 실행 시 `device_config.ini`에 기기 시리얼을 설정하지 않으면 `SCENARIO_API_URL` 기본 쿼리(`?id=`)만 사용합니다.

구성요소
-------
- `main.js`: 메인 프로세스. 시나리오/공지/클리닉 API 호출, 캐시 서버, ZIP 풀기, 트레이·컨텍스트 메뉴, 창 상태 저장, 자동 실행 관리, 관리자 설정 창 제공.
- `renderer.js`: 렌더러 UI. 재생목록 플레이어(영상/이미지/HLS), 공지 롤링, 대기열 패널, 실시간 클리닉 호출, 날씨 패널, 네트워크 복구/재시도 처리.
- `preload.js`: IPC 브릿지(`mediaAPI`, `clinicWS` 노출).
- `index.html`: 플레이어/패널/공지 영역 레이아웃과 스타일.

환경 변수
--------
| 이름 | 설명 |
| --- | --- |
| `SCENARIO_API_URL` | 시나리오 JSON을 반환하는 엔드포인트. `?id=<device_serial>`이 자동 추가됨. |
| `TEMPLATE_BASE_URL` | 템플릿 파일 다운로드용 베이스 URL. `?img=<name>&type=<ext>` 형태로 호출. |
| `CLINIC_API_ORIGIN` | 클리닉 대기열 REST API 오리진 (`/dapi/clinic/list?memberId=` 사용). |
| `CLINIC_WS_ORIGIN` | 실시간 클리닉 WebSocket 오리진 (`/clinic/topic/<memberSeq>/<clinicSeq?>`). |
| `WEATHER_LAT`, `WEATHER_LON` | 설정 시 고정 좌표로 기상 정보를 조회. 없으면 위치 권한/ IP 기반 Fallback. |
| `LANDING_URL` | 시리얼 미설정 시 표시할 랜딩 페이지 URL(기본 `https://www.admed.kr`). |

다운로드 동기화 표기
----------------
- 시나리오 템플릿이 캐시에 없어 새로 받아야 할 때 전체 화면 팝업으로 진행률(완료/총 다운로드 건수)을 안내합니다.
- 캐시에 이미 있으면 팝업이 뜨지 않고, 관리자가 영상을 교체한 뒤 다음 사이클에서 필요한 파일만 한 번 다운로드하면 자동으로 닫힙니다.

자동 업데이트
-----------
- GitHub Releases를 배포 서버로 사용하며, `electron-updater`가 실행 시 업데이트를 확인합니다(배포 설정은 `build.publish`에 `github` 지정).
- 빌드/배포 시 `GH_TOKEN`(GitHub Personal Access Token, Contents RW, Metadata R)을 환경 변수로 설정해야 릴리스 업로드가 가능합니다.
- 앱은 패키징된(production) 상태에서만 업데이트 체크를 수행하며, 다운로드 후 재시작 시 새 버전이 적용됩니다.
- GitHub Actions 워크플로(`.github/workflows/release.yml`)는 태그 `v*` 푸시 시 `npm run dist -- --publish always`로 빌드/릴리스를 올립니다. 워크플로 시크릿에 `GH_TOKEN`을 등록해야 합니다.

로컬 설정/저장 위치
------------------
- `%APPDATA%/ADMed/device_config.ini`: 기기 시리얼 저장(`ADMed.device_serial`). 컨텍스트 메뉴 → “관리자 설정”에서 수정, 기본 비밀번호 `rnb61196119`.
- `%APPDATA%/ADMed/window-state.ini`: 창 크기/위치/전체화면/항상 위 유지.
- `%TEMP%/admed-cache/`: 다운로드 캐시 및 HLS ZIP 해제 위치. 사용 중인 파일을 제외하고 15분 이상 지난 항목은 정리합니다.

재생목록/콘텐츠 처리
-------------------
- 시나리오 응답 `templates[]`를 정렬(`sort` 값, 없으면 index) 후 다음과 같이 매핑:
  - `type: jpg/jpeg/png/gif/webp` → 이미지 (`durationSeconds`는 `time` 값)
  - `type: mp4/mov` → 비디오
  - `type: m3u8` → HLS 원격 스트림
  - `type: m3u8`이 ZIP 패키지로 내려오면 `hls-zip`으로 처리해 로컬에 풀고 내장 HTTP 서버로 제공
- `TEMPLATE_BASE_URL`과 `img`/`type`으로 최종 URL을 만들고, 존재하는 캐시가 없으면 백그라운드 다운로드 후 다음 구동부터 로컬 파일 사용.
- HLS ZIP은 `admed-cache/<name>.zip`을 풀어 `.m3u8`을 찾아 내장 서버(`http://127.0.0.1:<port>/cache/...`)에서 서빙해 CORS 문제를 피합니다.

대기/공지/패널
--------------
- 시나리오의 `waitingInfo` 값으로 레이아웃을 제어:
  - `N`: 공지·패널 숨김
  - `A`: 공지바만 표시
  - `B`: 공지 + 날씨 패널
  - `Y`: 공지 + 대기열(클리닉) 패널
- 공지 리스트는 시나리오 API 호스트 기준 `dapi/clinic/notice/list?memberId=`에서 받아 좌->우 롤링합니다.
- 날씨 패널은 기상청 초단기예보 API를 호출하며, 좌표가 없으면 위치 권한 또는 IP 기반 좌표로 시도합니다.

클리닉 실시간 대기열
-------------------
- 시나리오 응답의 `memberSeq`가 있을 때 활성화. REST(`CLINIC_API_ORIGIN`)로 초기 대기열을 불러오고, WebSocket(`CLINIC_WS_ORIGIN/clinic/topic/<memberSeq>/<clinicSeq?>`)으로 갱신을 수신합니다.
- 클리닉별 카드/대기자 목록을 순차 회전 표시, 신규 호출 시 풍선 알림 + 효과음/음성 안내.

창/운영 기능
-----------
- 트레이 아이콘 더블클릭으로 창 표시, 컨텍스트 메뉴에서 창 크기 프리셋/전체화면/항상 위/자동 실행 토글.
- 우클릭(컨텍스트 메뉴) → “관리자 설정”에서 기기 시리얼 수정 후 새 시나리오 로드.
- 네트워크 오류 시 상태 오버레이와 함께 재시도/온라인 감지 후 자동 복구.
- 기기 시리얼이 비어 있으면 랜딩 페이지(`LANDING_URL`, 기본 ADMed 홈페이지)를 전체 화면으로 띄우고, 시리얼 설정 후 재생을 시작합니다.

자주 쓰는 명령
-------------
- 설치: `npm install`
- 실행: `npm start`
- 캐시 위치 확인: `%TEMP%/admed-cache`
