# Progress Log

> 이 파일은 매 작업 단위 갱신. 진행 상태 / 버전 / 날짜 정보의 단일 소스. CLAUDE.md 본체에는 적지 않는다.
> SessionStart hook 으로 끝 30줄이 자동 주입되어 메인·서브에이전트가 동일 출발점에서 시작.

## 갱신 책임

- **각 서브에이전트** — 보고 페이로드의 `[갱신된 영속 자산]` 에 "progress.md 추가 후보" 한 줄 제시
- **메인** — 작업 단위(=PR / 의미 있는 변경 단위) 종료 시 후보들을 종합해 1~3줄로 압축해 추가
- 메인이 누락하면 다음 세션 컨텍스트가 stale → 작업 종료 직전 자체 점검

## 형식

```
## YYYY-MM-DD <짧은 작업명>
- 변경: <한 줄>
- 영향 범위: <main / renderer / IPC / 빌드 등>
- PR: #<N> (있으면)
- 다음 단계: <후속 작업>
```

가장 최근 항목이 위에 (역순). 끝 30줄이 SessionStart 주입 대상이므로 큰 항목은 핵심만.

---

## 2026-05-13 Claude Code Starter 적용 (.claude / docs 트리)

- 변경: `_claude-starter` 템플릿을 이 Electron 프로젝트에 맞게 적응 — `CLAUDE.md`(진입점), `.claude/`(settings.json, hooks 4종: session-start / block-dangerous-commands / notify-test-needed / notify-progress-stale, agents 9종, skills 3종: preflight / test / verify), `docs/` 3단 트리. starter 의 Spring Boot/React 전제(JPA·Flyway·CORS·worktree 포트)는 제거하고 main process / renderer process 구조로 치환. `post-format`·`block-migration-conflict` hook 과 `dev-port` skill 은 미적용(포맷터·DB 마이그레이션·분리 dev 서버 없음).
- 영향 범위: 전체 (개발 워크플로 인프라). 앱 코드(`main.js`, `src/`)는 변경 없음.
- 현재 앱 버전: 2.1.4 (`package.json`)

## 2026-05-13 HLS 재생 stall/manifest 타이머 누수 수정 (`src/renderer/media.js`)

- 변경: HLS stall 감지 타이머·매니페스트 로딩 타임아웃 타이머가 `playIndex` 호출마다 만들어지는 클로저 지역변수라 `destroyHls()` 가 정리 못 하던 것을 모듈 레벨(`hlsStallTimer`/`hlsManifestTimer`) + `clearHlsStallTimer()`/`clearHlsManifestTimer()` 헬퍼로 바꾸고 `destroyHls()` 가 둘 다 정리하게 함. 중복·버그성 `addEventListener('ended', clearStalledTimer, {once:true})` 제거. stall 감지/복구 로직 자체(+5초 seek, 3회 skip)는 그대로.
- 동기: 현장에서 간혹 HLS 콘텐츠 2~3초 분량이 무한 반복되는 증상 (재현 데이터 없음). stale 타이머 누적이 새 항목을 엉뚱하게 seek → 짧은 클립 yank → 반복. 회귀 없는 cleanup 추가가 목표 (운영 중이라 회귀 절대 금지가 요구사항). → `docs/development/incident-log.md` 2026-05-13 항목 (⚠, 현장 재발 확인 중)
- 검증: `node --input-type=module --check < src/renderer/media.js` OK, 옛 식별자(`clearStalledTimer`/`stalledTimer`/`manifestTimeout`) 외부 참조 없음, `destroyHls` 호출처 4곳(resetMedia / manifest timeout cb / stall 3회 skip / fatal error) 전부 타이머 정리 커버 확인. **사용자 macOS 환경에서 `npm start` GUI 스모크 완료** — 시리얼 `AD2524001` 시나리오(HLS ZIP ~48개, 캐시 ~13.5GB)로 HLS 클립 다수 연속 전환 정상.
- 영향 범위: renderer `media.js` 1파일. IPC·preload·main 변경 없음. ⚠ `.claude/` 커스텀 에이전트는 이 세션에서 미활성 → tester 위임 대신 직접 검증함 (다음 세션부터 `tester`/`reviewer` 등 사용 가능).
- 다음 단계: 현장(Windows) 자동 업데이트 배포 후 재발 여부 모니터링 — 재발 시 콘솔 로그 확보해 ②(stall seek 보수화) / ③(hls.js 에러 복구 루프 / ENDLIST) 검토.

## 2026-05-13 공지 마퀴 속도 클램프 제거 (`src/renderer/notice.js`)

- 변경: `renderNotice()` 의 `duration = Math.min(40, Math.max(8, duration))` 에서 위쪽 캡(40초) 제거 → `duration = Math.max(8, duration)`. 흐르는 속도(140 px/sec) 고정, 글자 길이에 비례해서 더 오래 흐르도록.
- 동기: 사용자 보고 — 긴 공지가 화면을 너무 빨리 지나가서 못 읽음. 원인: 위쪽 40초 캡 때문에 긴 공지(`(barWidth+textWidth)/140 > 40s`)가 40초 안에 압축돼 빨라짐 (예: 200자면 약 88초 걸려야 할 게 40초 안에 → 2배+).
- 트레이드오프: 진짜 긴 공지(수백 자)는 그만큼 오래 화면에 남아 다음 공지로 늦게 넘어감 — 현장 공지는 보통 그렇게 길지 않다는 전제. 문제 시 캡을 아주 높게(예: 3분) 다시 두는 식으로 후속 조정 가능.
- 영향 범위: renderer `notice.js` 1파일, 1줄 변경. 다른 흐름 영향 없음.

## 2026-05-13 2.1.5 릴리스

- 변경: 위 두 수정(HLS 타이머 누수 / 공지 마퀴 속도) 묶어 patch 릴리스. `package.json` 2.1.4 → 2.1.5.
- 배포: `v2.1.5` 태그 푸시 → GitHub Actions(`.github/workflows/release.yml`) → windows-latest 러너 → `npm run dist -- --publish always` → GitHub Releases (`ADMed-2.1.5-Setup.exe` + `latest.yml`) → 현장 `electron-updater` 자동 다운로드/설치.
- 운영 안전망: 태그 푸시 후 CI 빌드 끝나면 Release 를 **일단 pre-release 로 마크** → Windows 한 대 수동 설치 검증 → OK 면 pre-release 해제(이때부터 현장 auto-update 잡힘). 문제 시 Release 삭제 → 현장 그대로 2.1.4 유지.
- 다음 단계: 현장 배포 후 1~2주 모니터링. 재발 없으면 incident-log 2026-05-13 항목을 ✅(해결) 로 격상.

## 2026-05-14 2.1.8: SCDream 폰트 적용 + 날씨 패널 날짜·시간 표시 개선

- 변경:
  - `assets/fonts/` 신규: SCDream 4~8 (5종, .otf). `index.html` 에 `@font-face` 5개(font-weight 400/500/600/700/800) 등록 + 기존 `font-family: "Segoe UI"` 5곳을 `"SCDream", "Segoe UI", sans-serif` 로 교체 (fallback Segoe UI 유지).
  - `src/renderer/weather.js`: 날짜 표시에 요일 추가(`5월 14일 목요일`), 시간 12시간제 + 오전/오후 (`오후 2:05`). `Intl.DateTimeFormat.formatToParts()` 로 요일만 `<span class="weekday">`, 오전/오후를 `<span class="ampm">` 으로 분리.
  - `index.html` CSS: `.title .weekday` font-weight 600 (본체 700 보다 한 단계 가벼움), `.meta .ampm` 0.6em + opacity 0.75 (시간 숫자 대비 보조 표시), `.title` margin top 8px / bottom 14px (가독성).
- 동기: 사용자 요청 — 폰트 통일 (다른 프로젝트 `admed_v2.0/device-front` 에서 SCDream 가져옴) + 날씨 패널 위쪽 시계 영역 가독성/디자인 개선 (24시간제 → 12시간제, 요일 표시 추가).
- 영향 범위: renderer 정적 자산(폰트 5개), `index.html` CSS + 마크업, `src/renderer/weather.js`. main 프로세스/IPC 변경 없음. `build.files: ["**/*"]` 라 `assets/` 자동 포함, electron-builder 설정 수정 불필요.
- 검증: `node --input-type=module --check < src/renderer/weather.js` OK. macOS 에서 `npm start` 로 화면 확인 — 폰트 적용/요일 출력/12시간제 시간/오전·오후 보조 표시/여백 모두 정상.
- 사고 (별개): 이번 작업 도중 `.env` 없이 첫 실행했더니 `playlist.js:70-73` 의 시나리오 fetch 실패 폴백 (`playlist = []`) → `cleanupCache(cacheRoot, [])` 가 캐시를 통째로 삭제 (~13.5GB → 321MB). 워크트리에 `.env` 심볼릭 링크로 복구 후 재다운로드 정상. 후속 안전망 개선 후보: API 실패 시 cleanupCache 스킵.

## 2026-05-14 2.1.8 릴리스

- 변경: 위 SCDream 폰트 + 날씨 패널 날짜·시간 표시 개선 묶어 patch 릴리스. `package.json` 2.1.7 → 2.1.8.
- 배포: `v2.1.8` 태그 푸시 → GitHub Actions → GitHub Releases (`ADMed-2.1.8-Setup.exe` + `latest.yml`) → 현장 `electron-updater` 자동 다운로드/설치.
- 운영 안전망: 태그 푸시 후 CI 빌드 끝나면 Release 를 **일단 pre-release 로 마크** → Windows 한 대 수동 설치 검증 (폰트 로딩, 시계 표시 확인) → OK 면 pre-release 해제. 문제 시 Release 삭제 → 현장 그대로 2.1.7 유지.

## 2026-05-14 2.1.8 CI 빌드 실패 + 2.1.9 hotfix

- 사고: v2.1.8 태그 푸시 후 GitHub Actions 빌드 실패. 원인 2가지가 겹침:
  1. `keytar` 7.9 의 `prebuild-install` 이 Request timeout → fallback 으로 `node-gyp rebuild`
  2. `windows-latest` runner 의 Python 이 3.12 로 올라가 있는데 stdlib `distutils` 가 3.12 부터 제거됨 → node-gyp(9.4.1) 가 `ModuleNotFoundError: No module named 'distutils'` 로 실패
- 영향: v2.1.8 Release publish 실패 → v2.1.7 이 Latest 그대로 유지, **현장 자동 업데이트 영향 없음**.
- 수정: `.github/workflows/release.yml` 에 `actions/setup-python@v5` (Python 3.11) 스텝 추가. node-gyp fallback 경로에서 distutils 살아있음. prebuild 가 정상 다운로드되면 애초에 fallback 안 가지만, 안전망으로 두 경로 다 통과하도록.
- 버전 처리: v2.1.8 태그는 GitHub 에 남아있지만 Release 없음. 태그 force-push 대신 안전하게 2.1.9 로 한 단계 bump (force-push 회피).

## 2026-05-14 2.1.9 릴리스

- 변경: 2.1.8 의 코드 변경(SCDream 폰트 + 날씨 패널 날짜·시간) + CI workflow Python 3.11 명시. 코드 변경은 2.1.8 과 동일.
- 배포: `v2.1.9` 태그 푸시 → GitHub Actions → GitHub Releases (`ADMed-2.1.9-Setup.exe` + `latest.yml`).
- 운영 안전망: 동일 — pre-release 마크 → Windows 수동 설치 검증 → 해제.

## 2026-05-15 HLS "2~3초 무한 반복" 진짜 원인 발견 + Fix A+B (`src/renderer/media.js`)

- 동기: 2.1.5 자동 업데이트 받은 현장에서도 사용자 보고 — 영상 시작 시 같은 영상이 처음부터 무한 반복. 사용자 가설 "윈도우 부팅 직후라 값을 못 가져와서?" 가 정확히 트리거 조건이었음.
- 진단: Mac 로컬에서 `cache-server.js` 의 첫 .ts 응답에 인공 5초 delay 를 임시 추가해 Windows cold disk IO 시뮬레이션 → 콘솔 로그로 두 버그가 합쳐진 무한 루프 정확히 재현. ① **stall checker false-positive**: `manifest_loaded → play()` 직후 첫 segment 가 cold disk 로 늦게 오는 동안 currentTime=0 → 6초 시점 stall 판정 → `+5초 seek` → 5초 위치 buffer 없음 → 또 stall → 3회 누적 → skip. ② **currentTime 전염**: yank 된 ct=10 이 `resetMedia()` + `hls.attachMedia` 후에도 일부 경로에서 리셋되지 않아 다음 항목이 ct=10 부터 시작 → 짧은 영상이면 즉시 ended → cycle 끝 → 첫 영상 → 반복. 2.1.5 fix(stale 타이머)는 부분 원인만 잡았던 것. 진단 후 임시 코드(5s delay / 500ms threshold / diag 로그) 전부 원복.
- 변경:
  - **Fix A** — stall checker arm 을 첫 `playing` 이벤트 후로 미룸. `AbortController + {once: true, signal}` 로 등록하여 `destroyHls()` 가 `abort()` 호출로 정리. manifest_loaded 직후 buffer 채우는 cold-disk 윈도우의 false-positive 원천 차단.
  - **Fix B** — `resetMedia()` 에 `videoEl.currentTime = 0` 명시 + `hls.js` config 에 `startPosition: 0` 추가. yank 된 currentTime 이 다음 항목으로 전염되지 않게 이중 안전망.
- 검증: `node --input-type=module --check < src/renderer/media.js` OK. Mac 로컬에서 인공 delay 재현으로 fix 검증 가능 (별도 시도). **Windows pre-release 수동 검증 필수** (운영 중 코드, 회귀 절대 금지).
- 영향 범위: renderer `media.js` 1파일. IPC/preload/main 변경 없음. 회귀 risk 낮음 — Fix A 는 진짜 stall (영상 시작 후 buffer underrun) 시엔 그대로 동작, Fix B 는 새 항목 시작 시점에만 currentTime=0 set.
- 추가 변경 (같은 commit): `index.html` video element 의 background 에 ADMed 로고 표시 (영상 buffering 동안만 보이고 frame 그려지면 자동 가려짐). `.move-handle` 의 background-image 를 SVG inline 으로 교체 (binary 의존 제거). `images/logo_full.png` 가 이전 `.gitattributes` 의 `* text eol=lf` 룰로 LF 변환되어 PNG 시그니처(`0D 0A`) 손상돼 있던 것을 정상 복원 (1 byte 차이). `images/move_icon.png` 도 같은 손상 + 사용처 SVG 대체로 삭제. `.gitattributes` 를 `* text=auto eol=lf` + binary 명시 룰(*.png, *.otf 등) 로 재작성, 미래 binary 손상 차단.
- 다음 단계: tester / reviewer 위임 완료 (둘 다 PASS, P0 차단 0건). Mac 로컬 인공 delay 재현으로 fix 검증 완료 — `HLS stall #N` 로그 0건. 패치 릴리스 v2.1.10 (v2.1.9 base) → 운영 안전망 패턴(pre-release 마크 → Windows 1대 수동 검증 → OK 면 해제). incident-log 2026-05-13 항목은 현장 재발 안 확인되면 ✅ 격상.

## 2026-06-30 운영 중 "콘텐츠 없음" 영구 정지 self-heal + 코너 도넛 스피너 (renderer 5파일)

- 동기: 현장 사진 보고 — 운영 중 새 템플릿을 올리면, 한 사이클 끝나고 루프 재시작 시 "콘텐츠를 불러오지 못했습니다 / No playable content available" 에러로 영구 정지. 수동 새로고침해야만 새 콘텐츠 다운로드·진행. 첫 실행·수동 새로고침은 정상.
- 진단(코드): 루프 재시작 `loadPlaylist({fromCycle})` → `preparePlaylist()` 재fetch 자체는 정상. 그러나 갓 올린 `hls-zip` 이 그 한 번의 prepare 에서 404(업로드 직후 미전파)/추출 일시 실패 → `streamUrl`·`localFile` 없는 항목만 남아 renderer `firstPlayable<0`. "no playable" 분기가 에러만 띄우고 **재시도 타이머를 안 걸어**(예외 `catch` 분기에만 retry) 영구 정지. 수동 새로고침이 듣는 건 그때 prepare 재실행으로 성공하기 때문. 메인 다운로드 경로는 이미 재시도·손상처리 보유 → 손대지 않음.
- 변경(사용자 확정 UX = "직전 콘텐츠 유지"):
  - **self-heal** — 운영 중(`state.hasEverPlayed`) no-playable 시 빨간 에러 대신 직전 프레임 유지(resetMedia/playIndex 미호출) + `NO_CONTENT_RETRY_MS`(5초) 간격 `attemptRecovery()` 자동 재시도 → 새 콘텐츠 준비되면 자동 교체. 콜드 스타트(한 번도 재생 못 함)만 에러(+자동 재시도). `firstPlayable>=0` 시 `hasEverPlayed=true`.
  - **코너 도넛 스피너** — `#player` 우하단 `#content-spinner`(CSS `@keyframes spin`). `state.downloadActive || state.fetchingContent` 면 `SPINNER_DELAY_MS`(500ms) 지연 후 표시(짧은 캐시 사이클 깜빡임 방지). 운영 중엔 화면 덮는 큰 `#download-overlay` 대신 도넛만, 콜드 스타트(`overlayLocked`)엔 기존 큰 진행 오버레이 유지.
  - reviewer P1 반영: `catch`/no-serial 경로에서 `state.downloadActive` 도 정리(prepare throw 시 progress active:false 미수신으로 도넛 영구 회전하던 edge 차단). catch 재시도도 `NO_CONTENT_RETRY_MS` 공유.
- 영향 범위: renderer 5파일(`playlist.js`/`state.js`/`overlays.js`/`dom.js` + `index.html`). IPC/preload/main 변경 없음 → 계약·보안 경계 그대로.
- 검증: `node --input-type=module --check` 4파일 OK + tester·reviewer PASS(P0 0). **Mac `npm start` 스모크(직전 프레임 유지 + 5초 자동 복구 = acceptance) + Windows pre-release 수동 검증 대기.**
- 트레이드오프(확정): 운영 중엔 환자에게 에러 미노출 → 콘텐츠 영구 손상 시에도 직전 광고 + 도넛만, 에러는 DevTools 로그로만.
- 다음 단계: 사용자 Mac 스모크 OK → commit + `package.json` 2.1.11 → **사용자 승인 후** `v2.1.11` 태그 푸시 → pre-release 마크 → Windows 1대 검증 → OK 면 해제(문제 시 Release 삭제로 2.1.10 유지).
- Mac 라이브 시연 완료: fault 주입으로 운영 중 no-playable 강제 → 직전 이미지 프레임 유지 + 우하단 도넛 + 빨간 에러 0 + 정확히 5초 간격 자동 재시도 확인. 주입 코드 원복.

## 2026-06-30 (2차) FABCDE freeze 제거 — 비차단 백그라운드 HLS-ZIP + IPC `allowBackground`

- 동기: 위 1차로 "no-playable 에러"는 사라졌지만, 새 템플릿 F 가 맨 앞에 추가돼 `FABCDE` 로 받아질 때 F(미캐시 `hls-zip`) 다운로드를 `preparePlaylist` 가 **`await`(차단)** 해서 A 가 바로 안 나오고 직전 프레임에 멈춤(freeze). F 가 크면(현장 600MB+ 관측) 수십 초~분. 사용자 요구: "F 는 스피너로 받고 A 로 넘어가야".
- 변경:
  - **main `src/main/playlist.js`** — `preparePlaylist({allowBackground})` 시그니처화. 운영 중(`allowBackground`) 미캐시 HLS-ZIP 은 `await` 대신 `startHlsZipBackground()` 로 백그라운드 다운로드, 이번 사이클은 `streamUrl` 없이 push → 렌더러가 skip 하고 준비된 항목부터 재생, 패키지는 받아지면 다음 사이클에 합류. 모듈 `hlsZipInProgress` Set(중복 다운로드 방지 + 스피너 active 판정). 다운로드+추출 로직을 `doHlsZipDownloadExtract()` 로 추출(콜드/백그라운드 공유, 동작 등가 — 미사용 `dlContentType` 만 제거). `notifyDownload` active = `downloadActive>0 || hlsZipInProgress.size>0`.
  - **콜드 스타트는 차단 유지** — 렌더러가 `preparePlaylist(state.hasEverPlayed)` 로 전달, `false`(첫 실행)면 기존처럼 await + 큰 n/m 오버레이 → 다 받고 재생. 요청 "처음엔 n/m 다운로드중" 보존.
  - **IPC `playlist:prepare`** — `preload.js`/`main.js`/렌더러 호출처에 `allowBackground` 인자 동기 추가(미전달 시 `false` 폴백 — 하위호환). `docs/architecture/ipc-contracts.md` 표 갱신.
  - **renderer `media.js`** — `playIndex` 에서 not-ready(streamUrl/localFile 없음) skip 검사를 `resetMedia` **앞**으로 이동 → 미준비 항목 건너뛸 때 직전 프레임 안 지워 검은 깜빡임 방지(reviewer 관찰 반영).
- 영향 범위: `src/main/playlist.js`(핵심) + `preload.js` + `main.js` + `src/renderer/playlist.js` + `src/renderer/media.js`. cache-server/보안 경계 무변경.
- 검증: 5파일 `node --check` OK + 스타트업 스모크(크래시 0, HLS 영상 재생) + **tester·reviewer·verifier 전부 PASS, P0 0**. P1 = ipc-contracts.md 문서 갱신(반영 완료). P2(cross-cycle 스피너 깜빡임 = SPINNER_DELAY_MS 흡수, stale 클로저 n/m = 운영 중 미사용) = 무해, 주석화. **운영 중 새 템플릿 추가 실측 + Windows pre-release 수동 검증 대기.**
- 알려진 미세 edge(자가복구): 백그라운드 받는 중 F 가 시나리오에서 다시 빠지면 keepPaths 누락으로 cleanup 이 partial 삭제 가능 → 백그라운드 catch 로 무해 실패, F 는 어차피 제거된 항목.

## 2026-06-30 (배포 상태) v2.1.11 — Draft 보류

- 커밋 `e166860` (1·2차 통합) → origin/main 푸시 완료. `v2.1.11` 태그 푸시 → CI(windows-latest) 빌드 success.
- **CI 가 Release 를 Draft 로 생성** (electron-builder 기본 releaseType=draft). Draft 는 electron-updater 에 안 보여 **현장 자동업데이트 안 됨** → 별도 pre-release 마킹 불필요(운영 문서의 "pre-release 마크" 보다 더 안전). 자산: `ADMed-2.1.11-Setup.exe`(~93MB) + `latest.yml`.
- 현장 Latest = **2.1.10 그대로**. 사용자 결정 = **"Draft 보류"** (승격/롤백 안 함, 추후 결정). 승격은 `gh release edit v2.1.11 --draft=false --latest`, 롤백은 `gh release delete v2.1.11` + 태그 삭제.
- 미해결 의문: 그날 "No playable content" 실제 트리거(빈 목록 vs 404)는 재현 안 돼 미확정 → 사용자 "다음에 또 나면 그때 보기". **parked 아이디어**: no-playable 순간 원인(빈 목록/404/API에러)을 로컬 파일에 남기는 진단 로그(현장은 DevTools·stdout 미수집이라, 자동복구가 에러 화면을 덮으면 증거가 안 남음 → 원인 추적하려면 필요).

## 2026-09-16 (배포 완료) v2.1.11 — Draft 해제 → 현장 Latest

- 동기: 현장에서 "콘텐츠를 불러오지 못했습니다"가 계속 관측됨. 원인 추적 결과 = 2.1.11 이 이미 고쳐놓은 그 버그인데 Release 가 **Draft 인 채 두 달 반 방치**되어 현장에 안 내려가고 있었음 (현장 Latest = 2.1.10).
- **원인 코드로 확정** (2.1.10 기준): `src/main/playlist.js:64-73` 이 `getScenario()` 실패를 catch 로 **삼키고 `playlist = []` 를 정상 응답처럼 반환** → 렌더러엔 예외가 아니라 *성공했는데 0개* 로 보여, 5초 재시도가 있는 `catch` 가 아니라 **재시도가 없는 `firstPlayable < 0` 분기**로 빠짐 → 영구 정지. 이미지/비디오는 캐시 없어도 `streamUrl` 이 항상 붙으므로(`playlist.js:274-278`) **콘텐츠 404 단독으론 이 에러 불가** → 6월 30일 미해결이던 "빈 목록 vs 404" 의문은 **빈 목록 쪽으로 정리**. 트리거 후보: 부팅 직후 auto-launch 가 DHCP/DNS 보다 먼저 뜸(이때 `navigator.onLine === true` 라 유일한 복구 트리거인 `online` 이벤트도 안 옴) / 서버 배포 중 502·503 / 프록시 HTML 응답으로 `res.json()` 실패.
- 조치: `gh release edit v2.1.11 --draft=false --latest`. 승격 전 태그 커밋 = `origin/main` = `e166860` 일치 확인.
- 검증: 릴리스 Latest 전환 + electron-updater 가 읽는 `latest.yml` 공개 URL 응답(`version: 2.1.11`, sha512·size 정상) + `ADMed-2.1.11-Setup.exe` 인증 없이 HTTP 200.
- **롤백 한계(중요)**: `gh release edit v2.1.10 --latest` 로 Latest 를 되돌려도 **이미 2.1.11 을 설치한 단말은 electron-updater 가 다운그레이드를 하지 않아 자동 복귀 안 됨** → 현장 수동 재설치 필요. Windows 실기 검증 0회 상태로 승격했으므로(사용자 결정) 초기 단말 화면 확인 필요. incident-log 2건은 실기 검증 전이라 ⚠ 유지.
- 남은 구멍 2개(2.1.11 로도 안 덮임):
  1. **콜드 스타트 + 서버 다운** — 보여줄 직전 프레임이 없어 에러 화면 노출. 단 5초 재시도로 자동 복구(사람 개입 불필요). 근본 해결은 직전 재생목록 캐시 → **무시 가능** 판단.
  2. **`fetch` 타임아웃 없음** — 응답 없이 연결만 물린 경우(방화벽 DROP 등) no-playable 분기에 도달조차 못 해 **self-heal 이 작동하지 않는 유일한 경로**. Electron 39.2.7 = undici 6.22.0 확인(main 의 global `fetch`) → 무한이 아니라 기본 `headersTimeout` **300초** 뒤 실패. 즉 최대 5분 정지 후 자동 복구. → 아래 2.1.12 에서 한 줄로 처리.

## 2026-09-16 (핫픽스) v2.1.12 — 재생 루프 무증상 정지 + 캐시 전삭제 + fetch 타임아웃

- 동기: "간혹 콘텐츠를 불러올 수 없습니다" 추적 중 **2.1.11 현장 배포분에 들어간 결정적 P0 두 건**을 코드에서 발견. 캐시 폴백(2.1.13)보다 먼저 나가야 한다고 판단해 최소 범위로 분리.
- 변경 (코드 3파일, 실제 로직 4줄):
  1. **`src/renderer/media.js`** — `playIndex()` 미준비 항목 skip 분기에 `state.currentIndex = idx` 선행. 없으면 `playNext()` 의 `currentIndex + 1` 이 같은 인덱스를 가리켜 **동기 재귀 → 스택 오버플로 → `.catch(() => {})` 가 삼켜 재생 루프 무증상 사망**(재부팅 전 복구 불가). 재현: `playIndex(4)` 1회 → 1836회 재귀 후 RangeError (메인·reviewer 독립 재현 동일). 2.1.11 의 백그라운드 HLS-ZIP 이 미준비 항목을 만들므로 **간판 기능이 곧 트리거**였고, 6/30 검증이 "F 를 맨 앞(FABCDE)" 배치라 우연히 비껴갔다.
  2. **`src/main/cache-server.js`** — `cleanupCache` 진입부 빈 `keepPaths` early return. 시나리오 조회 1회 실패 → `playlist=[]` → `keepPaths` 빈 Set → **캐시 전체 `fs.rmSync`** 를 차단. 과거 13.5GB → 321MB 사고와 같은 클래스.
  3. **`src/main/scenario-api.js`** — 시나리오·공지 `fetch` 에 `AbortSignal.timeout(10s)`. 없으면 undici 기본 headersTimeout 300초까지 매달려 **self-heal 이 유일하게 도달 못 하는 모드**가 된다(Electron 39.2.7 = undici 6.22.0 실측 확인). 실패는 예외가 아니라 `playlist: []` 로 전달되어 2번 가드의 입력이 된다 — 2·3번이 서로 맞물려 있어 같은 릴리스로 묶었다.
- 검증: **tester·reviewer 전부 PASS, P0 0건.** tester 는 실제 renderer 모듈을 바이트 동일 복사해 DOM 만 스텁으로 갈아끼운 하네스로 수정 전(1723회 재귀 후 스택 오버플로, `fatal: none` = 예외 은폐 실증) / 수정 후 4개 skip 시나리오(중간·끝·전체·앞 미준비) 정상을 확인했고, `cleanupCache` 유닛 테스트 3케이스 + macOS 라이브 스모크(60초 구동, main 에러 0, stale 자산 9건 정상 정리, 영상 재생 fd 확인)까지 통과. **Windows 실기 검증 대기** — 2.1.11 을 실기 0회로 승격한 전례가 있어 이번엔 실측 후 승격 권장(tester·reviewer 공통 의견).
- 추가 반영(두 검증 공통 지적): `callPlayNext` 와 `app.js` 의 video ended/error 핸들러에서 **`.catch(() => {})` 눈가리개 제거** → `log()` 로 전환. 이번 P0 가 2.5개월간 안 보인 진짜 이유가 `currentIndex` 누락이 아니라 이 무조건 catch 였다(RangeError 가 통째로 삼켜짐). 다음 번 다른 원인의 예외는 최소한 로그로 드러난다.
- 타임아웃 10초 판단: 운영 중엔 실패해도 `hasEverPlayed` 경로가 직전 프레임을 유지하고 5초 뒤 재시도하므로, 느린 서버의 결과는 "정지"가 아니라 "옛 콘텐츠가 계속 나온다" — 사이니지에서 올바른 실패 모드. 300초는 IPC 가 안 돌아와 `playlistLoading` 이 물리는 최악 모드였다. 저속 회선 사이트가 확인되면 15초로만 조정(구조 변경 금지).
- **남은 절반**: `src/main/download.js` 의 `fetch` 는 여전히 무타임아웃 — 대용량 파일(600MB급)이라 전체 시간 `AbortSignal.timeout` 은 부적합하고, headersTimeout/bodyTimeout 방식이 필요. 방화벽 DROP 시 항목당 최대 25분(300초 × 5회 재시도). 2.1.13.
- **검증 중 새로 발견(2.1.12 범위 밖, 별도 처리)**:
  - **P1 — `hls.js` 가 unpkg CDN 로드**(`index.html`). 오프라인 부팅(auto-launch 가 DHCP/DNS 보다 먼저)이면 `window.Hls === undefined` + Chromium 네이티브 HLS 미지원 → `media.js` 의 `HLS playback not supported` 분기가 **동기** `callPlayNext()` → 사이클 전체가 한 스택에서 붕괴 → 끝에서 `loadPlaylist({fromCycle})` 이 `if (state.playlistLoading) return` 에 막혀 **retryTimer 도 안 걸리고 루프 사망**. tester 하네스에서 `prepareCount` 1 고정으로 실증. 이번 P0 와 **동일 계열이고 현장 증상의 더 유력한 후보일 수 있다.** 수정은 hls.js 로컬 번들링(CSP 동반) 또는 재진입 가드.
  - **P2 — `.part` 영구 누적**: `cleanupCache` 가 `.part` 를 무조건 건너뛰어 삭제 주체가 없다. 개발 머신 실측 `2024278-*.zip.part` **687MB**(2026-06-30자) 방치. 현장 단말은 128GB SSD 에 Windows 라 실여유가 넉넉하지 않다. mtime 기준 정리 필요(진행 중 다운로드를 깨지 않도록 여유 있게).
- 2.1.13 후보: 캐시 폴백(대안 A = 복원 사이클엔 캐시 실재 항목만 재생, 새 다운로드 안 걸기) / cleanup 정책을 호출자 `scenarioOk` 플래그로 이전 + 유예 세대 / 콜드·운영 타임아웃 분리 / `callPlayNext` 마이크로태스크화 / 재생 0건 사이클 레이트 리밋 / 공지·대기열 복원 시효성 처리.

## 2026-09-16 v2.1.13 — hls.js 로컬 번들 + `callPlayNext` 비동기화

- 동기: 2.1.12 검증 중 tester 가 **같은 "무성 정지" 계열의 두 번째 원인**을 찾았다. `hls.js` 를 unpkg CDN 에서 로드하고 있어(`index.html`, CSP `script-src` 에 unpkg 허용) 오프라인 부팅(auto-launch 가 DHCP/DNS 보다 먼저)이면 `window.Hls` 가 undefined → Chromium 네이티브 HLS 미지원 → `HLS playback not supported` 분기가 **동기** `callPlayNext()` → 사이클이 한 스택에서 붕괴 → 끝의 `loadPlaylist({fromCycle})` 이 `playlistLoading` 재진입 가드에 막혀 `retryTimer` 조차 안 걸림. **현장 증상의 유력한 후보.**
- 변경:
  - **`index.html`** — unpkg CDN → `./node_modules/hls.js/dist/hls.min.js` 로컬 로드. CSP `script-src 'self' https://unpkg.com` → **`script-src 'self'`**. 부팅마다 서드파티 CDN 에서 코드를 받아 실행하던 공급망 표면이 사라졌다.
  - **`package.json`** — `hls.js` **`"1.6.15"` 정확 핀**(CDN URL 이 버전을 박고 있어 원래 정확 핀이었는데 `^` 로 느슨해질 뻔했다). `build.files` 에 트림 글롭 3줄(`dist/*.map`, `dist/hls-demo.js`, `src/**`) — 패키지 22MB 중 실사용은 `hls.min.js` 532KB 뿐이고 자동 업데이트가 인스톨러 전체를 200대에 내려보낸다.
  - **`src/renderer/media.js`** — `callPlayNext()` 를 `setTimeout(..., 0)` 으로 감싸 항상 새 스택에서 시작 + export. **스택 완화가 아니라 재진입 데드락 수정**이다(하네스 실증: `prepareCount` 1 고정 → 정상 순환, 5000개 연쇄 skip 에서도 오버플로 없음). HLS 미지원 분기에 `return` 추가(그 뒤 `HLS streaming start` 오도 로그가 찍히던 것 차단).
  - **`src/renderer/app.js`** — `ended`/`error` 핸들러가 중복 구현 대신 `media.js` 의 `callPlayNext` 사용. **`.catch(() => {})` 무성 실패 제거** — tester 지적대로 `app.js` 가 **일반 mp4 의 유일한 전환 경로**라 가장 흔한 콘텐츠의 전환 실패가 아직 무성이었다. `videoEl.error` 가 없는 error 이벤트도 로그를 남긴다.
- 검증: **tester·reviewer·verifier 전부 PASS, P0/P1 0건.**
  - tester — 개발 모드 CDP 라이브(`Hls` 1.6.15, `scriptSrc` = `file://`, 콘솔 에러 0, 영상 연속 재생) + **실제 asar 에 프로덕션 CSP 로 hls.js 로드 실측**(worker 포함) + 출하된 2.1.8 asar 에서 `!dist/**` 가 `node_modules/*/dist/` 를 안 지움을 실물 확인 + 전환 지연 4.26ms/hop 실측.
  - reviewer — 자기 이전 판단 정정("`setTimeout` 은 스타일 개선이 아니라 재진입 데드락의 정통 수정"). `setTimeout` 이 `queueMicrotask` 보다 나은 이유도 명시(폭주 시 페인트 굶음 방지 + 중첩 타이머 클램프가 공짜 레이트리밋).
  - verifier — 4 도메인 통과. CSP 축소는 허용 집합 **축소**라 승인 게이트 대상 아님, 문서↔실제 값 문자 단위 일치, 외부 스크립트 로드 0건, blob 워커는 무변경 `worker-src` 가 커버, IPC·캐시 가드 무변경, **순환 import 없음**(오히려 `state.onPlayNext` 슬롯 접근점이 `media.js` 한 곳으로 단일화).
  - **asar 게이트 통과** — `npx electron-builder --win --dir` 후 `npx asar list` 로 `dist/hls.min.js` 포함 + `.map`/`hls-demo.js`/`src/` 제외 0건 확인. 이 실패는 로컬 `npm start` 로는 절대 안 잡히고 패키징 산출물에서만 드러나므로 impact-map 에 검사 절차로 등재했다.
- 팀 공유 문서 갱신(사용자 승인): `CLAUDE.md` 기술 스택 서술, **`.claude/agents/frontend.md` CSP 규칙 텍스트** — 후자는 안 고치면 이후 frontend 에이전트가 unpkg 를 허용 origin 으로 오인해 CDN 로드를 되살릴 수 있다.
- **Windows 실기 검증 대기** — 특히 ① 오프라인 부팅에서 `typeof window.Hls === 'function'` ② 설치본에서 HLS-ZIP 재생 ③ CSP 위반 0건.
- 잔존(별도): `.part` 687MB 영구 방치 / 부분 keepPaths 로 인한 HLS 패키지 재다운로드 / skip 연쇄 중 `loadPlaylist` 개입 시 항목 1개 스킵 race(영구 freeze 를 항목 1개 스킵으로 바꾼 것이라 순이득) / `download.js` 무타임아웃.
