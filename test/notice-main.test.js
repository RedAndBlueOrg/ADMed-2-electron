const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { fetchScenarioPlaylist, fetchNoticesFast } = require('../src/main/scenario-api');

const envNames = ['SCENARIO_API_URL', 'TEMPLATE_BASE_URL'];
let savedEnv;
beforeEach(() => {
  savedEnv = envNames.map((name) => process.env[name]);
  process.env.SCENARIO_API_URL = 'https://example.test/dapi/device/scenario';
  process.env.TEMPLATE_BASE_URL = 'https://example.test/template';
});
afterEach(() => {
  envNames.forEach((name, i) => {
    if (savedEnv[i] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[i];
  });
});

function assertPcts(result, speed, font) {
  assert.equal(result.noticeSpeedPct, speed);
  assert.equal(result.noticeFontPct, font);
}

test('E1 scenario mapping preserves settings and defaults old servers', async (t) => {
  for (const fields of [{ noticeSpeedPct: 175, noticeFontPct: 130 }, {}, { noticeSpeedPct: null, noticeFontPct: null }]) {
    const data = { templates: [], waitingInfo: 'A', mSeq: { seq: 7 }, ...fields };
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => data }));
    const result = await fetchScenarioPlaylist();
    assertPcts(result, fields.noticeSpeedPct ?? 100, fields.noticeFontPct ?? 100);
    assert.deepEqual(result.playlist, []);
    assert.equal(result.waitingInfo, 'A');
    assert.equal(result.memberSeq, 7);
    assert.equal(result.scenarioRaw, data);
    t.mock.restoreAll();
  }
});

test('E1 fetchNoticesFast forwards scenario settings with array notices and defaults failures', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let fields = { noticeSpeedPct: 175, noticeFontPct: 130 };
  let failScenario = false;
  let failNotices = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('/notice/list')) {
      if (failNotices) throw new Error('notice offline');
      return { ok: true, json: async () => [{ id: 1, content: '공지', sort: 0 }] };
    }
    if (failScenario) throw new Error('offline');
    return { ok: true, json: async () => ({ templates: [], mSeq: { seq: 7 }, waitingInfo: 'A', ...fields }) };
  });
  const result = await fetchNoticesFast();
  assertPcts(result, 175, 130);
  assert.deepEqual(result.noticeList, [{ id: 1, content: '공지', sort: 0 }]);
  failNotices = true;
  assertPcts(await fetchNoticesFast(), 175, 130);
  fields = {};
  assertPcts(await fetchNoticesFast(), 100, 100);
  failScenario = true;
  const failed = await fetchNoticesFast();
  assertPcts(failed, 100, 100);
  assert.deepEqual(failed.noticeList, []);
  assert.equal(failed.error, 'offline');
});

test('E1 preparePlaylist forwards settings and resets scenario or notice failures', async () => {
  const filename = path.resolve(__dirname, '../src/main/playlist.js');
  const nativeRequire = createRequire(filename);
  let scenario = { playlist: [], noticeSpeedPct: 175, noticeFontPct: 130 };
  let failure = '';
  let cached = null;
  const mocks = {
    electron: { app: { getPath: () => '/unused' }, BrowserWindow: { getAllWindows: () => [] } },
    './state': { configIni: {} },
    './config': { CACHE_ROOT_NAME: 'cache', ensureDir() {} },
    './download': {},
    './cache-server': { startCacheServer: async () => '', cleanupCache() {} },
    './scenario-api': {
      getScenario: async () => { if (failure === 'scenario') throw new Error('offline'); return scenario; },
      getScenarioApiUrl: () => '',
      fetchNoticeList: async () => { if (failure === 'notice') throw new Error('offline'); return []; },
      saveScenarioCache() {},
      loadScenarioCache: () => cached,
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, process: { env: {} }, console: { warn() {} },
    require: (name) => mocks[name] ?? nativeRequire(name),
  }, { filename });
  assertPcts(await module.exports.preparePlaylist(), 175, 130);
  for (failure of ['notice', 'scenario']) assertPcts(await module.exports.preparePlaylist(), 100, 100);
  failure = '';
  scenario = { playlist: [] };
  assertPcts(await module.exports.preparePlaylist(), 100, 100);
  // 시나리오 실패 + 저장본 있음 → 오프라인 폴백은 저장본의 배율을 쓴다
  cached = { playlist: [], waitingInfo: 'A', memberSeq: 7, noticeList: [], noticeSpeedPct: 150, noticeFontPct: 120 };
  failure = 'scenario';
  const offline = await module.exports.preparePlaylist();
  assertPcts(offline, 150, 120);
  assert.equal(offline.offline, true);
});

test('E1 notice IPC handler forwards success and supplies failure defaults', async () => {
  // 앱을 시작하지 않고 실제 등록 코드의 콜백만 실행한다.
  const source = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
  const handlerSource = source.slice(source.indexOf("  ipcMain.handle('notice:fetch'"), source.indexOf("  ipcMain.handle('clinic:ws:start'"));
  let handler;
  let fail = false;
  const response = { noticeList: [], waitingInfo: 'A', noticeSpeedPct: 175, noticeFontPct: 130 };
  vm.runInNewContext(handlerSource, {
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    fetchNoticesFast: async () => { if (fail) throw new Error('offline'); return response; },
    console: { warn() {} },
  });
  assert.equal(await handler(), response);
  fail = true;
  assertPcts(await handler(), 100, 100);
});
