const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = require(pkgPath);
const freshModules = ['src/main/edition.js', 'src/main/config.js', 'src/main/scenario-api.js'].map((p) => path.join(root, p));
const state = require('../src/main/state');

// 빌드 종류는 모듈 로드 시 한 번 정해진다 → 캐시를 비우고 다시 require 한다.
// packaged: 패키지 안 package.json 에 extraMetadata 가 들어간 상태(일반기관 설치본)를 흉내낸다.
function load({ env, packaged } = {}) {
  for (const p of freshModules) delete require.cache[p];
  const savedEnv = process.env.ADMED_EDITION;
  if (env) process.env.ADMED_EDITION = env;
  else delete process.env.ADMED_EDITION;
  if (packaged) require.cache[pkgPath].exports = { ...pkg, ...require('../electron-builder.all.js').extraMetadata };
  try {
    return {
      edition: require('../src/main/edition'),
      config: require('../src/main/config'),
      api: require('../src/main/scenario-api'),
    };
  } finally {
    require.cache[pkgPath].exports = pkg;
    if (savedEnv === undefined) delete process.env.ADMED_EDITION;
    else process.env.ADMED_EDITION = savedEnv;
  }
}

function fakeApp(appData) {
  const calls = [];
  return {
    calls,
    setName: (n) => calls.push(['setName', n]),
    setPath: (k, v) => calls.push(['setPath', k, v]),
    getPath: (k) => (k === 'appData' ? appData : assert.fail(`unexpected getPath(${k})`)),
  };
}

const savedEnv = { SCENARIO_API_URL: process.env.SCENARIO_API_URL, TEMPLATE_BASE_URL: process.env.TEMPLATE_BASE_URL };
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  state.configIni = {};
});

test('의료기관 빌드 식별자는 그대로다', () => {
  const b = pkg.build;
  assert.equal(b.appId, 'kr.fine.admed.pc');
  assert.equal(b.productName, 'ADMed');
  assert.equal(b.nsis.shortcutName, 'ADMed');
  assert.equal(b.win.artifactName, '${productName}-${version}-Setup.${ext}');
  assert.deepEqual(b.publish, [{ provider: 'github', owner: 'RedAndBlueOrg', repo: 'ADMed-2-electron' }]);
  assert.deepEqual(b.extraResources[0], { from: '.env', to: '.' });
  assert.equal(b.extraMetadata, undefined);
});

test('일반기관 빌드 설정은 식별자·업데이트 저장소·.env 를 모두 분리한다', () => {
  const all = require('../electron-builder.all.js');
  assert.equal(all.appId, 'kr.fine.admed.all.pc');
  assert.equal(all.productName, 'ADMed All');
  assert.equal(all.nsis.shortcutName, 'ADMed All');
  assert.equal(all.win.artifactName, 'ADMed-All-${version}-Setup.${ext}');
  assert.equal(all.win.icon, pkg.build.win.icon); // 아이콘은 같은 AdMed
  assert.deepEqual(all.publish, [{ provider: 'github', owner: 'RedAndBlueOrg', repo: 'ADMed-all-electron' }]);
  assert.deepEqual(all.extraResources[0], { from: '.env.all', to: '.env' });
  assert.ok(all.files.includes('!.env'), '의료기관 .env 가 일반기관 asar 에 들어가면 안 된다');
  assert.equal(all.extraMetadata.name, 'admed-all'); // electron-updater 캐시 폴더 분리
  assert.notEqual(all.directories.output, 'dist');
});

test('의료기관(기본): 이름·자동실행 이름 ADMed, 데이터 폴더를 건드리지 않는다', () => {
  const { edition, config } = load();
  assert.equal(edition.IS_ALL, false);
  assert.equal(config.AUTO_LAUNCH_NAME, 'ADMed');
  const app = fakeApp('/appdata');
  edition.applyAppIdentity(app);
  assert.deepEqual(app.calls, []);
});

for (const [label, opts] of [['설치본(extraMetadata)', { packaged: true }], ['개발 실행(ADMED_EDITION)', { env: 'all' }]]) {
  test(`일반기관 ${label}: 이름·자동실행 이름·데이터 폴더가 ADMed All`, () => {
    const { edition, config } = load(opts);
    assert.equal(edition.IS_ALL, true);
    assert.equal(config.AUTO_LAUNCH_NAME, 'ADMed All');
    const app = fakeApp('/appdata');
    edition.applyAppIdentity(app);
    assert.deepEqual(app.calls, [['setName', 'ADMed All'], ['setPath', 'userData', path.join('/appdata', 'ADMed All')]]);
  });
}

test('공지 URL: 의료기관은 memberId, 일반기관은 기기 serial', () => {
  state.configIni = { deviceSerial: 'SN 01' };
  const scenarioUrl = 'https://host.test:8443/dapi/device/scenario?id=SN%2001';
  const medical = load().api;
  assert.equal(medical.buildNoticeUrlFromScenario(scenarioUrl, 7), 'https://host.test:8443/dapi/clinic/notice/list?memberId=7');
  assert.equal(medical.buildNoticeUrlFromScenario(scenarioUrl, null), null);

  const all = load({ env: 'all' }).api;
  assert.equal(all.buildNoticeUrlFromScenario(scenarioUrl, 7), 'https://host.test:8443/dapi/device/notice?id=SN%2001');
  assert.equal(all.buildNoticeUrlFromScenario(scenarioUrl, null), 'https://host.test:8443/dapi/device/notice?id=SN%2001');
  state.configIni = { deviceSerial: '' };
  assert.equal(all.buildNoticeUrlFromScenario(scenarioUrl, 7), null);
});

test('일반기관: 공지 응답 매핑 + 공지 배율 필드가 없으면 100%', async (t) => {
  state.configIni = { deviceSerial: 'SN1' };
  process.env.SCENARIO_API_URL = 'https://host.test/dapi/device/scenario';
  process.env.TEMPLATE_BASE_URL = 'https://host.test/file/local/download/template';
  const { api } = load({ env: 'all' });
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url));
    const body = String(url).includes('/notice')
      ? [{ id: 'b-uuid', title: 't2', content: '둘째', sort: 2 }, { id: 'a-uuid', title: 't1', content: '첫째', sort: 1 }]
      : { templates: [], waitingInfo: 'B', mSeq: { seq: 3 } }; // 일반기관 응답에는 noticeSpeedPct·noticeFontPct 가 없다
    return { ok: true, json: async () => body };
  });
  const result = await api.fetchNoticesFast();
  assert.equal(urls[1], 'https://host.test/dapi/device/notice?id=SN1');
  assert.deepEqual(result.noticeList, [{ id: 'a-uuid', content: '첫째', sort: 1 }, { id: 'b-uuid', content: '둘째', sort: 2 }]);
  assert.equal(result.noticeSpeedPct, 100);
  assert.equal(result.noticeFontPct, 100);
});

test('데이터 폴더가 나뉘어 한 앱의 캐시 정리가 상대 앱 미디어를 지우지 않는다', (t) => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'admed-edition-'));
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  const { cleanupCache } = require('../src/main/cache-server');
  const { CACHE_ROOT_NAME } = load().config;

  // 의료기관 설치본의 userData = %APPDATA%/<package name>(admed). Windows 는 대소문자를 구분하지 않는다.
  const medicalUserData = path.join(appData, pkg.name);
  const app = fakeApp(appData);
  load({ packaged: true }).edition.applyAppIdentity(app);
  const allUserData = app.calls.find((c) => c[0] === 'setPath')[2];
  assert.notEqual(allUserData.toLowerCase(), medicalUserData.toLowerCase());

  const roots = [medicalUserData, allUserData].map((u) => path.join(u, CACHE_ROOT_NAME));
  for (const r of roots) {
    fs.mkdirSync(path.join(r, 'hls-pkg'), { recursive: true });
    fs.writeFileSync(path.join(r, 'shared.mp4'), 'x');
    fs.writeFileSync(path.join(r, 'only-here.jpg'), 'x');
  }
  const [medicalRoot, allRoot] = roots;
  // 일반기관 시나리오에는 shared.mp4 만 남았다 → 일반기관 캐시에서만 나머지가 지워져야 한다
  cleanupCache(allRoot, new Set([path.join(allRoot, 'shared.mp4')]));
  assert.deepEqual(fs.readdirSync(allRoot), ['shared.mp4']);
  assert.deepEqual(fs.readdirSync(medicalRoot).sort(), ['hls-pkg', 'only-here.jpg', 'shared.mp4']);
});

test('개발 실행: 의료기관은 .env, 일반기관은 .env.all 을 읽는다', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admed-env-'));
  const cwd = process.cwd();
  t.after(() => { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); delete process.env.ADMED_ENV_PROBE; });
  fs.writeFileSync(path.join(dir, '.env'), 'ADMED_ENV_PROBE=medical\n');
  fs.writeFileSync(path.join(dir, '.env.all'), 'ADMED_ENV_PROBE=all\n');
  process.chdir(dir);
  for (const [opts, expected] of [[{}, 'medical'], [{ env: 'all' }, 'all']]) {
    delete process.env.ADMED_ENV_PROBE;
    load(opts).config.loadEnvFiles();
    assert.equal(process.env.ADMED_ENV_PROBE, expected);
  }
});
