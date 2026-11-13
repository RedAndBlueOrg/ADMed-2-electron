const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let normalizePct, noticeDurationSec, fontScaleValue;
before(async () => {
  ({ normalizePct, noticeDurationSec, fontScaleValue } = await import('../src/renderer/notice-metrics.js'));
});

test('E2 normalizePct defaults invalid values and clamps both bounds', () => {
  for (const value of ['abc', '130', '', null, undefined, NaN, Infinity, -Infinity, true, {}]) {
    assert.equal(normalizePct(value, 50, 200), 100);
  }
  for (const [value, expected] of [[0, 50], [50, 50], [130, 130], [200, 200], [300, 200]]) {
    assert.equal(normalizePct(value, 50, 200), expected);
  }
  assert.equal(normalizePct(200, 50, 150), 150);
});

test('E2 duration at 100 and missing or invalid values exactly matches legacy', () => {
  for (const speed of [100, 'abc', null, undefined]) {
    for (const [bar, text] of [[1709, 500], [100, 100], [1920, 10000], [1920, 777]]) {
      assert.equal(noticeDurationSec(bar, text, speed), Math.max(8, (bar + text) / 140));
    }
  }
});

test('E2 speed scales after the minimum duration and clamps to 50..200', () => {
  for (const [bar, text] of [[1709, 500], [100, 100]]) {
    const legacy = Math.max(8, (bar + text) / 140);
    assert.equal(noticeDurationSec(bar, text, 200), legacy / 2);
    assert.equal(noticeDurationSec(bar, text, 50), legacy * 2);
    assert.equal(noticeDurationSec(bar, text, 300), legacy / 2);
    assert.equal(noticeDurationSec(bar, text, 0), legacy * 2);
  }
});

test('E2 font scale removes defaults and clamps to 50..150', () => {
  for (const font of [100, 'abc', null, undefined]) assert.equal(fontScaleValue(font), null);
  assert.equal(fontScaleValue(130), '1.3');
  assert.equal(fontScaleValue(200), '1.5');
  assert.equal(fontScaleValue(0), '0.5');
});
