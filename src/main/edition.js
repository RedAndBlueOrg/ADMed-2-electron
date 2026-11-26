'use strict';

const path = require('path');
const pkg = require('../../package.json');

// 빌드 종류: 의료기관(기본) / 일반기관(all).
// 일반기관 빌드는 electron-builder.all.js 의 extraMetadata 가 패키지 package.json 에 admedEdition 을 넣는다.
// ADMED_EDITION 은 개발 실행용 프로세스 환경변수(예: `ADMED_EDITION=all npm start`) — .env 보다 먼저(모듈 로드 시) 한 번만 읽는다.
const IS_ALL = (process.env.ADMED_EDITION || pkg.admedEdition) === 'all';
const PRODUCT_NAME = IS_ALL ? 'ADMed All' : 'ADMed';

// 일반기관 빌드만 데이터 폴더를 %APPDATA%/ADMed All 로 고정한다(device_config.ini·scenario-cache.json·admed-cache 분리).
// 의료기관 빌드는 아무것도 바꾸지 않는다 — 기존 설치본의 데이터 폴더가 그대로 유지돼야 한다.
// getPath('userData') 가 처음 불리기 전에 호출해야 한다.
function applyAppIdentity(app) {
  if (!IS_ALL) return;
  app.setName(PRODUCT_NAME);
  app.setPath('userData', path.join(app.getPath('appData'), PRODUCT_NAME));
}

module.exports = { IS_ALL, PRODUCT_NAME, applyAppIdentity };
