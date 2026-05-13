# 날씨 패널 — 좌표 결정 + 기상청 초단기예보

> 이 문서는 날씨 패널, 좌표 결정(설정/Geolocation/IP), 기상청 격자 변환, 초단기예보 API, 시계 구현·변경·디버깅 시 본다.

## 한 줄 정의
`waitingInfo === 'B'` 일 때만 표시 (`#weather-panel`). 좌표 → 기상청 격자(nx,ny) 변환 → 초단기예보 API 조회 → 아이콘/기온/습도/풍속 렌더 + 분 단위 시계.

## 모듈
renderer: `src/renderer/weather.js`. main: `weather:config` IPC 핸들러(`main.js` 인라인) — `{lat, lon, weatherServiceUrl, weatherServiceKey}` 반환. preload: `weatherConfig.get()` 가 preload 컨텍스트에서 `process.env` 직접 읽음 (모듈 로드 시 seed) + fallback 으로 `mediaAPI.getWeatherConfig()`(IPC).

## 좌표 결정 순서 (`startWeather()`)
1. `cachedWeatherConfig.lat/lon` (= `WEATHER_LAT`/`WEATHER_LON` 환경변수) 있으면 그걸로 `fetchWeather()`
2. 없으면 `navigator.geolocation.getCurrentPosition` (권한은 main `window.js` 가 `geolocation` 자동 승인, `enableHighAccuracy:true, timeout:5000`)
3. geolocation 실패 → `useConfigWeather('위치 접근 불가: ...')` + `fallbackIpLocation()` → `https://ipapi.co/json/` 의 `latitude/longitude`
4. 다 실패 → "위치 정보를 설정하거나 허용해 주세요." 메시지

## 기상청 호출 (`fetchWeather(lat, lon)`)
- `mapToGrid(lat, lon)` — 기상청 LCC DFS 격자 변환 (RE 6371.00877, GRID 5.0, SLAT1/2 30/60, OLON/OLAT 126/38) → `{nx, ny}`
- `base_date`/`base_time` 계산: 현재 분 < 31 이면 한 시간 전 `HH30`, 아니면 `HH00` (자정 경계 처리 — 0시 직전이면 전날로)
- URL: `<weatherServiceUrl>?serviceKey=<key>&pageNo=1&numOfRows=60&dataType=json&base_date=&base_time=&nx=&ny=` (기본 URL `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst`)
- 응답 `response.body.items.item[]` 에서 현재 시각 이상의 가장 가까운 `fcstTime` 선택 → `T1H`(기온)/`REH`(습도)/`WSD`(풍속)/`SKY`/`PTY` 추출 → `renderWeather()`
- `serviceKey` 없으면 "날씨 정보를 불러올 수 없습니다." (호출 안 함)
- 아이콘: PTY 1/5 → 🌧️, 3/7 → ❄️, SKY 3 → 🌥️, 4 → ☁️, else ☀️

## 시계 (`startWeatherClock()`)
`app.js` 가 항상 시작 (날씨 패널 표시 여부와 무관) — `#weather-title`(월/일), `#weather-meta`(HH:MM) 갱신. 다음 분 경계에 맞춰 `setTimeout` (분당 1회). `renderWeather()` 도 호출 시 시간 갱신.

## 갱신 빈도
`updateWeatherPanel()` 이 `waitingInfo==='B'` 일 때 호출 — `shouldFetchWeatherNow()` (시(hour)나 날(date) 바뀌었으면 true) 면 `startWeather()`. 즉 사실상 시간당 1회 + 모드 진입 시.

## 환경변수
`WEATHER_LAT`, `WEATHER_LON` (있으면 고정 좌표), `WEATHER_SERVICE_URL` (기본 기상청 초단기예보 URL), `WEATHER_SERVICE_KEY` (없으면 패널은 뜨되 데이터 비움).

## 엣지 / 실패 / 보안
- `queryUrl` 에 `serviceKey` 평문 포함 → 디버그 로그 추가 시 마스킹 ([../development/electron-security.md](../development/electron-security.md))
- API 응답이 JSON 아님(에러 XML 등) → `JSON.parse` 실패 → "API 응답을 해석할 수 없습니다"
- `items` 비어있음 → "날씨 정보를 불러오지 못했습니다."
- ipapi.co 실패 → 조용히 무시 (catch 빈 함수)

## 관련 사고
(없음)
