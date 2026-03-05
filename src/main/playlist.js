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

async function preparePlaylist() {
  state.contentSyncing = true;
  const cacheRoot = path.join(app.getPath('temp'), CACHE_ROOT_NAME);
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
    const active = downloadActive > 0;
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
      return !fs.existsSync(zipPath) || !findFirstManifest(destDir);
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
      currentDownloadTitle = getItemDisplayName(item);
      const alreadyCached = fs.existsSync(zipPath) && !!findFirstManifest(destDir);

      if (!alreadyCached) {
        const endActive = beginActiveDownload({ currentTitle: currentDownloadTitle });
        try {
          const dl = await downloadFileWithHeaders(item.url, zipPath);
          await extractZip(zipPath, destDir);
          endActive();
        } catch (err) {
          console.error(`download failed for package ${item.url}`, err);
          endActive();
          markSyncDone({ currentTitle: currentDownloadTitle });
          prepared.push({ ...item, type: 'hls', streamUrl: item.url, error: err.message });
          continue;
        }
      }

      const manifestPath = findFirstManifest(destDir);
      if (!manifestPath) {
        if (!alreadyCached) markSyncDone({ currentTitle: currentDownloadTitle });
        prepared.push({ ...item, type: 'hls', streamUrl: item.url, error: '패키지 내 m3u8 없음' });
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
  if (state.updateReadyWhileSyncing) {
    state.updateReadyWhileSyncing = false;
    console.log('[update] content sync finished – proceeding with deferred quitAndInstall');
    setTimeout(() => {
      try {
        require('electron-updater').autoUpdater.quitAndInstall(false, true);
      } catch (installErr) {
        state.pendingUpdateInstall = false;
        console.warn('[update] deferred quitAndInstall failed:', installErr?.message || installErr);
      }
    }, 1000);
  }

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
