# PR 체크리스트

> 이 문서는 PR 생성 전 / `/review` 호출 시 본다. reviewer 서브에이전트도 read.

## 자동 강제 / 검증 (메인이 결과만 보고)

- [ ] `/test` 통과 — tester 서브에이전트 보고 (node --check + IPC 동기화 grep + npm ls 무결성 + 스모크 체크리스트 작성)
- [ ] (PR 직전, 선택) `/verify` 4 도메인 통과 — verifier 서브에이전트 (electron-security / ipc-contract / secrets / cache-path)
- [ ] 영향 범위 분석 — tester 의 변경 심볼·IPC 채널 사용처 추적

## 자동 환기 (Stop hook 이 메인에 알림)

- [ ] 코드 수정 후 `/test`·`/verify` 미호출 — `notify-test-needed` (Stop) 환기
- [ ] progress.md 가 N일+ 갱신 안 됨 + 그 사이 커밋 — `notify-progress-stale` (Stop) 환기

## 사람 확인 필수 (자동화 X — tester 가 헤드리스로 못 함)

- [ ] `npm start` GUI 스모크 — 변경된 기능 경로 동작 + DevTools 콘솔 에러 없음 + 회귀 의심 기능 1~2개 (시나리오: `docs/testing-plan.md`)
- [ ] IPC 채널 변경 시 → `preload.js` 브리지 + renderer 호출처가 같이 갱신됐는가 (`docs/architecture/ipc-contracts.md` 갱신 포함)
- [ ] Electron 보안 표면(`webPreferences`, CSP, `app.commandLine`) 변경 없음 — 있으면 별도 검토·승인 받았는가
- [ ] 타이머/리스너/HLS/WS 정리가 재로딩에 안전한가 (장시간 운영 누수)
- [ ] 주석이 코드 변경과 일치 / 불필요한 주석 없음
- [ ] (해당 시) `docs/development/impact-map.md` 한 줄 추가 (자동 grep 못 잡는 의미 의존)
- [ ] (해당 시) `docs/features/<name>.md` / `docs/architecture/` 갱신
- [ ] `docs/progress.md` 한 항목 추가 (작업 한 줄 + 날짜)
- [ ] 재사용 가능한 helper 가 이미 있는지 확인 (`download.js` / `cache-server.js` / `dom.js` 중복 작성 회피)
- [ ] 시크릿/엔드포인트 하드코딩 없음, `.env` 커밋 안 됨
- [ ] PR 제목 / body 한글 + 요약 명료, 버전 bump 필요 시 `package.json` 갱신 ([build-deploy.md](build-deploy.md))

## 머지 후

- [ ] (배포 대상이면) `v<버전>` 태그 푸시 → GitHub Actions `release.yml` 이 `npm run dist -- --publish always` 실행 → Releases 확인
- [ ] 현장 자동 업데이트 적용 확인 (다음 실행 시 새 버전 다운로드·설치)
