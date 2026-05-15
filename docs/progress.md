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
