# 진료 대기현황 — REST + STOMP WebSocket + 호출 알림

> 이 문서는 진료실 대기열 표시, 실시간 갱신(STOMP), 호출 팝업·음성(TTS) 구현·변경·디버깅 시 본다.

## 한 줄 정의
`waitingInfo === 'Y'` 일 때만 활성. REST 로 초기 대기열을 받고, STOMP WebSocket(`/topic/clinic/<memberSeq>`)으로 실시간 변동·호출을 수신해 진료실 카드(회전·스크롤)와 호출 팝업+음성을 갱신.

## 활성 조건 (renderer: `src/renderer/clinic.js` `setupClinicRealtime()`)
`config.waitingInfo === 'Y'` && `memberSeq` && `clinicApiOrigin` && `clinicWsOrigin` 모두 있어야 활성. 하나라도 없으면 `stopClinicSocketInternal()` + `resetClinicUi()`. 같은 config 면 재셋업 안 함(`clinicConfigKey` 비교).

## 흐름
1. `loadPlaylist` 가 `preparePlaylist` 응답에서 `memberSeq`/`clinicApiOrigin`/`clinicWsOrigin`/`waitingInfo` 받아 `setupClinicRealtime()` 호출
2. **REST 초기 대기열** (`fetchClinicList()`): `<clinicApiOrigin>/dapi/clinic/list?memberId=<memberSeq>&serial=<deviceSerial>` → 진료실별 `applyClinicSnapshot(seq, {content, currentPatient, name, screenDirection})` → `clinicQueues` Map 채움 → `renderClinicList()`
3. **STOMP** (main: `src/main/clinic-ws.js`): `clinicWS.start({memberSeq, clinicWsOrigin, clinicSeqList})` → main 이 `brokerURL = clinicWsOrigin.replace(/^http/,'ws') + '/ws/websocket'` 로 `@stomp/stompjs` Client(`webSocketFactory: ws`) 활성화 → `onConnect` 시 `/topic/clinic/<memberSeq>` 구독 → 메시지 JSON 파싱해 renderer 로 `clinic:ws:event` ({type:'data', data}) push. `onStompError`/`onWebSocketClose` 도 status 이벤트.
4. **메시지 처리** (`handleClinicMessagePayload`): `seq`(또는 clinicSeq/id/clinicId), `content`(배열 또는 `.list`/`.queue`) 추출 → `applyClinicSnapshot` → `msg.kind === 'add'` 면 호출 알림 큐잉(`enqueueClinicAlert`)
5. **호출 알림** (`processClinicAlertQueue`, 순차): 풀스크린 버블(`#clinic-alert` "이름님,<br>'진료실'로<br>들어오세요.") + `modalAudio.wav` 재생 + Web Speech `SpeechSynthesisUtterance`(ko-KR, rate 0.9) 동시. 비디오 재생 중이면 알림 동안 mute(`state.videoMutedByAlert`). 이름은 `maskName`(가운데 글자 'O' 치환), TTS 는 글자 사이 콤마(`commaByChar`)·숫자 한글화(`numberToKorean`/`clinicLabelForTts`).

## 카드 회전·스크롤 (`renderClinicList()`)
- `clinicQueues` 의 진료실들을 `seq` 순 정렬 → `clinicRotationIndex` 로 한 번에 한 진료실 카드 표시
- 진료실 > 1 → `baseDelay`(4초) 후 다음 진료실로 회전. 진료실 = 1 → 대기열이 viewport 넘치면 `startAutoScroll()`(8~18초 스크롤 애니메이션 `requestAnimationFrame`) 후 맨 위로
- `clinic.screenDirection` ('L'/'R') → `applyClinicPanelSide()` 가 `#waiting-panel`/`#player`/`#weather-panel` 의 CSS `order` 조정 (대기 패널을 좌/우 배치)
- 마우스 wheel → 자동 스크롤 중단(`scrolling='manual'`)

## 환경변수
`CLINIC_API_ORIGIN` (REST 루트), `CLINIC_WS_ORIGIN` (WS 루트 — `http`→`ws` 치환 후 `/ws/websocket`). 둘 다 없으면 `playlist.js` 가 `[clinic] API/WS origin env is missing` 경고.

## 엣지 / 실패
- WS 연결 실패 → `reconnectDelay: 3000` 자동 재연결 (무한 누적 안 되는지 — `stopClinicSocket()` 이 `deactivate()` 호출)
- 오프라인 → renderer 가 `stopClinicSocket()`, online 복귀 → `restartClinicRealtime()` (REST 재fetch → WS 재시작)
- 메시지 JSON 파싱 실패 → `[clinic] invalid ws message` 경고, 무시
- 호출 알림 연속 도착 → 큐 순차 처리 (`clinicAlertProcessing` 플래그)
- TTS 미지원 환경(`!('speechSynthesis' in window)`) → 사운드만, 15초 타임아웃

## 관련 사고
(없음)
