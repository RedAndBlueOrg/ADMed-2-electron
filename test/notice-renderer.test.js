const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const writes = [];
const frames = [];
function style(onWrite = () => {}) {
  const values = new Map();
  return {
    setProperty(key, value) { values.set(key, value); onWrite('set', value); },
    removeProperty(key) { values.delete(key); onWrite('remove'); },
    getPropertyValue: (key) => values.get(key) || '',
  };
}
const span = {
  style: style((action, value) => writes.push([action, value])),
  get offsetWidth() {
    writes.push(['measure']);
    return 500 * Number(this.style.getPropertyValue('--notice-font-scale') || 1);
  },
};
const noticeText = { style: style(), querySelector: () => span, offsetWidth: 0 };
const noticeBar = { style: style(), clientWidth: 1709 };
let state, initialState, renderNotice, loadNotices, loadPlaylist;

before(async () => {
  globalThis.document = {
    getElementById: (id) => ({ 'notice-bar': noticeBar, 'notice-text': noticeText })[id] || null,
    querySelector: () => null,
    documentElement: { style: style() },
  };
  globalThis.window = { mediaAPI: {}, clinicWS: { start() {}, stop() {} }, addEventListener() {}, innerWidth: 1920 };
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  ({ default: state } = await import('../src/renderer/state.js'));
  initialState = { ...state };
  ({ renderNotice, loadNotices } = await import('../src/renderer/notice.js'));
  ({ loadPlaylist } = await import('../src/renderer/playlist.js'));
});
beforeEach(() => {
  Object.assign(state, initialState);
  span.style.removeProperty('--notice-font-scale');
  writes.length = 0;
  frames.length = 0;
});
after(() => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
});

test('E1 renderer state starts at 100 percent', () => {
  assert.equal(state.noticeSpeedPct, 100);
  assert.equal(state.noticeFontPct, 100);
});

test('E1 loadPlaylist normalizes object responses and resets legacy arrays', async () => {
  for (const [response, speed, font] of [
    [{ noticeSpeedPct: 175, noticeFontPct: 130 }, 175, 130],
    [{}, 100, 100],
    [[], 100, 100],
    [{ noticeSpeedPct: 300, noticeFontPct: 200 }, 200, 150],
    [{ noticeSpeedPct: 'abc', noticeFontPct: null }, 100, 100],
  ]) {
    state.noticeSpeedPct = 50;
    state.noticeFontPct = 50;
    window.mediaAPI.preparePlaylist = async () => response;
    await loadPlaylist();
    assert.equal(state.noticeSpeedPct, speed);
    assert.equal(state.noticeFontPct, font);
  }
});

test('E1 loadNotices normalizes settings and resets missing or failed responses', async () => {
  for (const [response, speed, font] of [
    [{ noticeSpeedPct: 175, noticeFontPct: 130 }, 175, 130],
    [{}, 100, 100],
    [{ noticeList: [], waitingInfo: null, error: 'offline' }, 100, 100],
    [{ noticeSpeedPct: 300, noticeFontPct: 200 }, 200, 150],
    [{ noticeSpeedPct: 'abc', noticeFontPct: null }, 100, 100],
  ]) {
    state.noticeSpeedPct = 50;
    state.noticeFontPct = 50;
    window.mediaAPI.fetchNotices = async () => response;
    await loadNotices();
    assert.equal(state.noticeSpeedPct, speed);
    assert.equal(state.noticeFontPct, font);
  }
});

test('E3 renderNotice applies font inside rAF before measuring and removes 130 then 100', () => {
  state.noticeList = [{ content: '공지', sort: 0 }];
  state.noticeFontPct = 130;
  state.noticeSpeedPct = 200;
  renderNotice(true);
  assert.equal(frames.length, 1);
  assert.deepEqual(writes, []);
  frames.shift()();
  assert.deepEqual(writes, [['set', '1.3'], ['measure']]);
  assert.equal(span.style.getPropertyValue('--notice-font-scale'), '1.3');
  assert.equal(noticeText.style.animation, `move ${(1709 + 650) / 140 / 2}s linear`);

  writes.length = 0;
  state.noticeFontPct = 100;
  state.noticeSpeedPct = 100;
  renderNotice(true);
  assert.deepEqual(writes, []);
  frames.shift()();
  assert.deepEqual(writes, [['remove', undefined], ['measure']]);
  assert.equal(span.style.getPropertyValue('--notice-font-scale'), '');
  assert.equal(noticeText.style.animation, `move ${(1709 + 500) / 140}s linear`);
  assert.equal(span.style.fontSize, undefined);
});
