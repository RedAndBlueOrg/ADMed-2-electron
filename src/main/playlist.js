'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const state = require('./state');
const { CACHE_ROOT_NAME, ensureDir } = require('./config');
const { downloadFileWithHeaders, downloadFile } = require('./download');
const { getScenario, getScenarioApiUrl, fetchNoticeList } = require('./scenario-api');
const { startCacheServer, extractZip, findFirstManifest, cleanupCache } = require('./cache-server');

function sendDownloadProgress(payload) {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send('download:progress', payload);
    }
  }
}

// 운영 중(allowBackground) 백그라운드로 받고 있는 HLS-ZIP 패키지(safeBase) 집합.
// 사이클을 넘어 살아남아 ① 같은 패키지 중복 다운로드를 막고 ② 스피너 표시(active) 판정에 쓰인다.
const hlsZipInProgress = new Set();

// HLS-ZIP 패키지 다운로드 + 추출 (진행률/오버레이 보고는 호출자 책임). 첫 다운로드 실패 시 throw.
// preparePlaylist 의 콜드 스타트(await)와 운영 중(background) 양쪽이 공유한다.
async function doHlsZipDownloadExtract(item, { safeBase, destDir, zipPath, m3u8Direct }) {
  const zipExists = fs.existsSync(zipPath);
  // ZIP이 이미 있으면 다운로드 스킵, 추출만 재시도
  if (!zipExists) {
    await downloadFileWithHeaders(item.url, zipPath);
  } else {
    console.log(`[hls-zip] zip exists, skip download: ${safeBase}.zip`);
  }

  // 파일 내용으로 포맷 판별: 텍스트 첫 줄이 #EXT → m3u8, 아니면 ZIP 시도
  const headBuf = Buffer.alloc(64);
  const fd = fs.openSync(zipPath, 'r');
  const bytesRead = fs.readSync(fd, headBuf, 0, 64, 0);
  fs.closeSync(fd);
  const headText = headBuf.slice(0, bytesRead).toString('utf8').trim();
  const isM3u8 = headText.startsWith('#EXTM3U') || headText.startsWith('#EXT');

  if (isM3u8) {
    console.log(`[hls-zip] OK (m3u8 direct): ${safeBase}`);
    fs.renameSync(zipPath, m3u8Direct);
    return;
  }

  try {
    await extractZip(zipPath, destDir);
    console.log(`[hls-zip] OK (zip extracted): ${safeBase}`);
  } catch (zipErr) {
    // 7-Zip 에러여도 m3u8가 추출됐으면 부분 성공
    if (findFirstManifest(destDir)) {
      console.log(`[hls-zip] OK (partial extract): ${safeBase}`);
    } else if (zipExists) {
      // m3u8도 없고 기존 zip → 잘린 파일, 재다운로드
      console.warn(`[hls-zip] corrupt zip, re-downloading: ${safeBase}.zip`);
      try { fs.rmSync(zipPath, { force: true }); } catch {}
      try { fs.rmSync(destDir, { recursive: true, force: true }); } catch {}
      ensureDir(destDir);
      await downloadFileWithHeaders(item.url, zipPath);
      try {
        await extractZip(zipPath, destDir);
        console.log(`[hls-zip] OK (re-downloaded & extracted): ${safeBase}`);
      } catch (zipErr2) {
        if (findFirstManifest(destDir)) {
          console.log(`[hls-zip] OK (re-download partial): ${safeBase}`);
        } else {
          console.warn(`[hls-zip] re-download extract failed: ${zipErr2.message}`);
        }
      }
    } else {
      console.warn(`[hls-zip] extract failed, no m3u8: ${zipErr.message}`);
    }
  }
}

async function preparePlaylist({ allowBackground = false } = {}) {
  state.contentSyncing = true;
  const cacheRoot = path.join(app.getPath('userData'), CACHE_ROOT_NAME);
  ensureDir(cacheRoot);
  const cacheBaseUrl = await startCacheServer(cacheRoot);

  let playlist = [];
  let waitingInfo = null;
  let noticeList = [];
  let memberSeq = null;
  let downloadTotal = 0;
  let downloadFinished = 0;
  let downloadActive = 0;
  let currentDownloadTitle = '';

  const getItemDisplayName = (item) => item?.title || item?.id || item?.url || '';

  const notifyDownload = (overrides = {}) => {
    // 이 prepare 호출의 동기 다운로드(downloadActive) 또는 사이클을 넘어 살아있는
    // 백그라운드 HLS-ZIP(hlsZipInProgress) 중 하나라도 있으면 active → 스피너 유지.
    const active = downloadActive > 0 || hlsZipInProgress.size > 0;
    sendDownloadProgress({
      total: downloadTotal,
      finished: Math.min(downloadFinished, downloadTotal),
      active,
      currentTitle: overrides.currentTitle ?? currentDownloadTitle ?? '',
    });
  };

  const beginActiveDownload = (overrides = {}) => {
    downloadActive += 1;
    notifyDownload(overrides);
    return () => {
      downloadActive = Math.max(0, downloadActive - 1);
      notifyDownload();
    };
  };

  const markSyncDone = (overrides = {}) => {
    if (!downloadTotal) return;
    downloadFinished = Math.min(downloadFinished + 1, downloadTotal);
    notifyDownload(overrides);
  };

  // 운영 중: 미캐시 HLS-ZIP 을 await 하지 않고 백그라운드로 받는다. 같은 패키지가 이미
  // 받는 중이면(이전 사이클) 재시작하지 않는다. 받는 동안 hlsZipInProgress 가 스피너를 유지.
  const startHlsZipBackground = (item, paths) => {
    if (hlsZipInProgress.has(paths.safeBase)) return;
    hlsZipInProgress.add(paths.safeBase);
    notifyDownload();
    doHlsZipDownloadExtract(item, paths)
      .catch((err) => {
        console.error(`[hls-zip] background download failed: ${item.url}`, err.message);
      })
      .finally(() => {
        hlsZipInProgress.delete(paths.safeBase);
        // 이 notifyDownload 는 시작 사이클의 클로저라 total/finished 가 stale 할 수 있으나,
        // 운영 중엔 렌더러가 n/m 큰 오버레이를 안 쓰고 active 불리언만 도넛에 쓰므로 무해.
        notifyDownload();
      });
  };

  try {
    const scenario = await getScenario();
    playlist = scenario.playlist || [];
    waitingInfo = scenario.waitingInfo || null;
    memberSeq = scenario.memberSeq || null;
    noticeList = await fetchNoticeList(getScenarioApiUrl(), scenario.memberSeq);
  } catch (err) {
    console.warn('Scenario API failed:', err.message);
    playlist = [];
  }

  const needsDownload = playlist.filter((item) => {
    if (!item?.url) return false;
    const isHlsZip = item.type === 'hls-zip';
    const isHls = item.type === 'hls' || (!isHlsZip && (item.url.endsWith('.m3u8') || false));
    if (isHls) return false;
    if (isHlsZip) {
      const base = (item.id || '').replace(/[^a-zA-Z0-9._-]/g, '-');
      const destDir = path.join(cacheRoot, base);
      const zipPath = path.join(cacheRoot, `${base}.zip`);
      // ZIP이 있거나 m3u8가 직접 있으면 다운로드 불필요
      if (findFirstManifest(destDir)) return false;
      return !fs.existsSync(zipPath);
    }
    try {
      const u = new URL(item.url);
      let ext = path.extname(u.pathname);
      if (!ext) { const q = u.searchParams.get('type'); if (q) ext = `.${q}`; }
      const inferredType = /\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? 'image' : 'video';
      const extFallback = (item.type || inferredType) === 'image' ? '.jpg' : '.mp4';
      const base = (item.id || u.searchParams.get('img') || path.basename(u.pathname) || 'asset').replace(/[^a-zA-Z0-9._-]/g, '-');
      return !fs.existsSync(path.join(cacheRoot, `${base}${ext || extFallback}`));
    } catch { return true; }
  });
  downloadTotal = needsDownload.length;
  downloadFinished = 0;
  notifyDownload();

  const prepared = [];
  const backgroundDownloads = [];
  const keepPaths = new Set();

  for (const item of playlist) {
    if (!item.url) continue;

    let urlObj;
    try {
      urlObj = new URL(item.url);
    } catch (err) {
      markSyncDone();
      prepared.push({ ...item, error: '잘못된 URL' });
      continue;
    }

    let extFromUrl = path.extname(urlObj.pathname);
    if (!extFromUrl) {
      const queryExt = urlObj.searchParams.get('type');
      if (queryExt) extFromUrl = `.${queryExt}`;
    }
    const lowerExt = (extFromUrl || '').toLowerCase();
    const inferredType = /\.(jpg|jpeg|png|gif|webp)$/i.test(lowerExt) ? 'image' : 'video';
    const isHls = lowerExt === '.m3u8' || item.type === 'hls' || item.type === 'hls-zip';
    const isHlsZip = item.type === 'hls-zip';
    const itemType = isHls ? (isHlsZip ? 'hls-zip' : 'hls') : item.type || inferredType;
    const extFallback = itemType === 'image' ? '.jpg' : itemType === 'video' ? '.mp4' : '.bin';
    let ext = extFromUrl || extFallback;
    if (itemType === 'hls-zip') {
      ext = '.zip';
    }
    const baseNameSource = item.id || urlObj.searchParams.get('img') || path.basename(urlObj.pathname) || 'asset';
    const safeBase = baseNameSource.replace(/[^a-zA-Z0-9._-]/g, '-');
    const safeName = `${safeBase}${ext}`;
    const destPath = path.join(cacheRoot, safeName);

    if (itemType === 'hls') {
      prepared.push({
        ...item,
        type: 'hls',
        streamUrl: item.url,
      });
      continue;
    }

    if (itemType === 'hls-zip') {
      const destDir = path.join(cacheRoot, safeBase);
      ensureDir(destDir);
      const zipPath = path.join(cacheRoot, `${safeBase}.zip`);
      const m3u8Direct = path.join(destDir, `${safeBase}.m3u8`);
      currentDownloadTitle = getItemDisplayName(item);

      // 캐시된 m3u8가 실제로 유효한지 검증 (이전 fallback으로 잘못 저장된 파일 제거)
      const manifestCandidate = findFirstManifest(destDir);
      if (manifestCandidate) {
        try {
          const probe = Buffer.alloc(16);
          const pfd = fs.openSync(manifestCandidate, 'r');
          fs.readSync(pfd, probe, 0, 16, 0);
          fs.closeSync(pfd);
          const probeText = probe.toString('utf8').trim();
          if (!probeText.startsWith('#EXT')) {
            console.warn(`[hls-zip] invalid cached m3u8, removing: ${manifestCandidate}`);
            fs.rmSync(manifestCandidate, { force: true });
          }
        } catch {}
      }

      const alreadyCached = (fs.existsSync(zipPath) || fs.existsSync(m3u8Direct)) && !!findFirstManifest(destDir);
      const hlsPaths = { safeBase, destDir, zipPath, m3u8Direct };

      // 운영 중(allowBackground) 미캐시 패키지: 차단하지 않고 백그라운드로 받는다.
      // 이번 사이클은 streamUrl 없이 반환 → 렌더러가 skip 하고 준비된 다음 항목을 재생,
      // 패키지는 받아지면 다음 사이클에 합류. (cleanup 이 지우지 않도록 경로는 keep)
      if (!alreadyCached && allowBackground) {
        keepPaths.add(destDir);
        keepPaths.add(zipPath);
        prepared.push({ ...item, type: 'hls' });
        startHlsZipBackground(item, hlsPaths);
        continue;
      }

      // 콜드 스타트(또는 이미 캐시됨): 기존처럼 차단(await) — 다 받고 즉시 재생.
      if (!alreadyCached) {
        const endActive = beginActiveDownload({ currentTitle: currentDownloadTitle });
        try {
          await doHlsZipDownloadExtract(item, hlsPaths);
          endActive();
        } catch (err) {
          console.error(`download failed for package ${item.url}`, err);
          endActive();
          markSyncDone({ currentTitle: currentDownloadTitle });
          prepared.push({ ...item, type: 'hls', error: err.message });
          continue;
        }
      }

      const manifestPath = findFirstManifest(destDir);
      if (!manifestPath) {
        if (!alreadyCached) markSyncDone({ currentTitle: currentDownloadTitle });
        prepared.push({ ...item, type: 'hls', error: '패키지 내 m3u8 없음' });
        continue;
      }

      const relManifest = path.relative(cacheRoot, manifestPath).replace(/\\/g, '/');
      const localUrl = `${cacheBaseUrl}/${relManifest}`;

      keepPaths.add(destDir);
      keepPaths.add(zipPath);

      prepared.push({
        ...item,
        type: 'hls',
        streamUrl: localUrl,
        packageDir: destDir,
      });
      if (!alreadyCached) markSyncDone({ currentTitle: currentDownloadTitle });
      continue;
    }

    if (fs.existsSync(destPath)) {
      keepPaths.add(destPath);
      prepared.push({
        ...item,
        type: itemType,
        localFile: pathToFileURL(destPath).href,
        cachePath: destPath,
      });
      continue;
    }

    keepPaths.add(destPath);

    prepared.push({
      ...item,
      type: itemType,
      streamUrl: item.url,
    });

    const downloadTitle = getItemDisplayName(item);
    currentDownloadTitle = downloadTitle;
    const endActive = beginActiveDownload({ currentTitle: downloadTitle });

    const dl = downloadFile(item.url, destPath)
      .then(() => {
        markSyncDone({ currentTitle: downloadTitle });
      })
      .catch((err) => {
        console.error(`download failed (bg) for ${item.url}`, err);
        markSyncDone({ currentTitle: downloadTitle });
      })
      .finally(() => {
        endActive();
      });

    backgroundDownloads.push(dl);
  }

  if (backgroundDownloads.length) {
    Promise.allSettled(backgroundDownloads).then(() => {
    });
  }

  cleanupCache(cacheRoot, keepPaths);

  const clinicApiOrigin = process.env.CLINIC_API_ORIGIN || '';
  const clinicWsOrigin = process.env.CLINIC_WS_ORIGIN || '';
  if (!clinicApiOrigin || !clinicWsOrigin) {
    console.warn('[clinic] API/WS origin env is missing. CLINIC_API_ORIGIN or CLINIC_WS_ORIGIN not set.');
  }
  const landingUrl = process.env.LANDING_URL || 'https://www.admed.kr';

  state.contentSyncing = false;

  return {
    playlist: prepared,
    waitingInfo,
    noticeList,
    memberSeq,
    deviceSerial: state.configIni.deviceSerial || '',
    clinicApiOrigin,
    clinicWsOrigin,
    landingUrl,
  };
}

module.exports = {
  sendDownloadProgress,
  preparePlaylist,
};
