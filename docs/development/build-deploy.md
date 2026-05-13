# 빌드 / 배포 — electron-builder + GitHub Releases

> 이 문서는 NSIS 빌드, 버전 bump, GitHub Releases 배포, CI(`.github/workflows/release.yml`), 자동 업데이트 배포 작업 시 본다.

## 명령

```bash
npm install              # postinstall: electron-builder install-app-deps (네이티브 모듈 keytar 재빌드)
npm run rebuild           # electron-rebuild -f -w keytar (네이티브 모듈만 수동 재빌드)
npm run pack:dir          # electron-builder --dir (설치 파일 없이 디렉토리만 — 빠른 확인)
npm run dist:local        # electron-builder --win nsis --publish never (로컬 NSIS 설치 파일)
npm run dist              # electron-builder --win nsis --publish always (NSIS + GitHub Releases 업로드)
```

> `dist` / `dist:local` 은 무겁고 시간 걸림 — tester 서브에이전트 범위 밖. 메인/사용자가 필요할 때만.

## 빌드 설정 (`package.json` `build`)
- `appId: kr.fine.admed.pc`, `productName: ADMed`, `asar: true`
- `files`: `**/*` 에서 `dist/**`, `release/**`, `node_modules/.cache/**` 제외
- `extraResources`: `.env` → `.`, `images/icon.ico` → `.` (런타임에 `process.resourcesPath` 에서 읽음 — `config.loadEnvFiles()`, `TRAY_ICON_CANDIDATES`)
- `win.target: nsis`, 아이콘 `images/icon.ico`, artifact `${productName}-${version}-Setup.${ext}`
- `nsis`: `oneClick: true`, `perMachine: false`(사용자 단위 설치), 바탕화면·시작메뉴 바로가기, `runAfterFinish: true`, `allowElevation: true`
- `publish`: github / owner `RedAndBlueOrg` / repo `ADMed-2-electron`

## 버전 bump
- `package.json` `version` 만 올림 (앱 안에서 `app.getVersion()` 으로 노출 — 버전 토스트 `overlays.js`).
- 커밋 메시지 관례: `Bump <버전>: <요약>` (기존 git log 참고).
- 자동 업데이트는 `electron-updater` 가 GitHub Releases 의 latest 와 비교 — `package.json` 버전이 곧 비교 기준.

## CI (`.github/workflows/release.yml`)
- 트리거: `v*` 태그 push (`git tag v2.1.5 && git push origin v2.1.5`)
- `windows-latest`, Node 20, `npm install` → `npm run dist -- --publish always`
- 인증: `GH_TOKEN: ${{ secrets.GH_TOKEN }}` (비공개 릴리스 업로드/다운로드용)

## 자동 업데이트 동작 (`src/main/updater.js`)
- `app.isPackaged` 일 때만 활성 (개발 모드 X)
- `autoDownload: true`, `autoInstallOnAppQuit: true`
- `update-downloaded` → 1초 뒤 `quitAndInstall(false, true)` — **콘텐츠 동기화 중이어도 즉시 설치** (재시작 후 동기화 재개). 이 정책 바꾸려면 `state.contentSyncing` 와의 관계 함께 검토 ([impact-map.md](impact-map.md)).
- `GH_TOKEN`/`GITHUB_TOKEN` 있으면 `requestHeaders` 에 `Authorization: token <...>` (비공개 릴리스)
- 업데이트 이벤트는 renderer 로 broadcast (`update:available`/`update:ready`/`update:progress`/`update:error`) — 단 현재 renderer 쪽엔 이 이벤트 리스너가 없음 (preload 에 미노출). 진행률은 `overlays.js` 가 `download:progress`(콘텐츠 다운로드) 만 표시.

## 주의
- 네이티브 모듈 `keytar` — Node ABI / Electron 버전 안 맞으면 `postinstall` 또는 `npm run rebuild` 필요. `electron` devDep 버전 올리면 재빌드.
- `.env` 가 패키지에 포함되므로 배포 빌드는 현장용 실제 엔드포인트가 든 `.env` 로 빌드해야 함 (CI 에선 secrets 또는 빈 `.env` — 현장 설정은 별도).
