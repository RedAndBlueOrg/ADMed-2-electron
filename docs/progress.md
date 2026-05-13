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
