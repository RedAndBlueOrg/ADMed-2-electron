'use strict';

// 일반기관(ADMed All) 빌드 설정. package.json 의 build(의료기관)를 바탕으로 정체성만 바꾼다.
// `electron-builder -c electron-builder.all.js` 로 쓰면 package.json 의 build 는 읽지 않는다(-c 가 대신한다).
// 앱 아이콘은 의료기관과 같은 images/icon.ico 를 쓴다.
const base = require('./package.json').build;

module.exports = {
  ...base,
  appId: 'kr.fine.admed.all.pc',
  productName: 'ADMed All',
  // 패키지 안 package.json 에 들어간다.
  // name → electron-updater 캐시 폴더(%LOCALAPPDATA%/admed-all-updater)를 의료기관(admed-updater)과 분리
  // productName → Electron 앱 이름(데이터 폴더) · admedEdition → src/main/edition.js 가 읽는 빌드 종류
  extraMetadata: { name: 'admed-all', productName: 'ADMed All', admedEdition: 'all' },
  directories: { output: 'dist-all' },
  // electron-builder 는 extraResources 원본만 asar 에서 뺀다 → 여기선 .env(의료기관)가 asar 에 들어간다.
  // loadEnvFiles 는 asar 안 .env 를 먼저 읽으므로 의료기관 주소가 이긴다 → 명시적으로 뺀다(빌드 산출물로 확인).
  files: [...base.files, '!.env'],
  extraResources: [
    { from: '.env.all', to: '.env' },
    { from: 'images/icon.ico', to: '.' },
  ],
  // GitHub 은 자산 이름의 공백을 점으로 바꾼다 → latest.yml 과 이름이 어긋나지 않게 공백 없이 쓴다.
  win: { ...base.win, artifactName: 'ADMed-All-${version}-Setup.${ext}' },
  nsis: { ...base.nsis, shortcutName: 'ADMed All' },
  publish: [{ provider: 'github', owner: 'RedAndBlueOrg', repo: 'ADMed-all-electron' }],
};
