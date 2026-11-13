const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

test('E3 CSS uses the requested font scale and minimum bar height cap', () => {
  const html = read('index.html');
  const rule = html.match(/\.moving-text-span\s*\{([^}]+)\}/)[1];
  assert.ok(rule.includes('font-size: min(calc(clamp(32px, calc(48px * var(--ui-scale)), 72px) * var(--notice-font-scale, 1)), calc(max(60px, calc(var(--notice-h) * 1vh)) * 0.75));'));
  assert.match(html, /#notice-bar\s*\{[^}]*min-height:\s*60px;/);
});

test('E4 test configuration keeps renderer ESM and excludes tests from packaging', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.type, 'commonjs');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.ok(pkg.build.files.includes('!test/**'));
  assert.deepEqual(JSON.parse(read('src/renderer/package.json')), { type: 'module' });
  assert.match(read('index.html'), /<script type="module" src="\.\/src\/renderer\/app\.js"><\/script>/);
});

test('E5 application and both lockfile versions are 2.1.15', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, '2.1.15');
  assert.equal(lock.version, '2.1.15');
  assert.equal(lock.packages[''].version, '2.1.15');
});

test('E6 both IPC contracts document settings in both documents', () => {
  for (const filename of ['docs/architecture/ipc-contracts.md', 'docs/features/playlist-hls.md']) {
    const doc = read(filename);
    assert.match(doc, /`playlist:prepare`[^\n]*\{playlist\[\], waitingInfo, noticeList\[\], noticeSpeedPct, noticeFontPct,/);
    assert.match(doc, /`notice:fetch`[^\n]*\{noticeList\[\], waitingInfo, noticeSpeedPct, noticeFontPct\}/);
    assert.ok(doc.includes('{noticeList:[], waitingInfo:null, noticeSpeedPct:100, noticeFontPct:100, error}'));
  }
});
