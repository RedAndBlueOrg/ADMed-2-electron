'use strict';

const { app, BrowserWindow } = require('electron');
const state = require('./state');

function initAutoUpdater() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  try {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (token) {
      autoUpdater.requestHeaders = { Authorization: `token ${token}` };
    }
    const broadcastUpdateEvent = (channel, payload) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      }
    };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (err) => {
      console.warn('[update] error:', err?.message || err);
      broadcastUpdateEvent('update:error', err?.message || String(err));
    });
    autoUpdater.on('update-available', (info) => {
      console.log('[update] available:', info?.version || 'unknown');
      broadcastUpdateEvent('update:available', info);
    });
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[update] downloaded:', info?.version || 'unknown', '- will install on quit');
      broadcastUpdateEvent('update:ready', info);
      if (!state.pendingUpdateInstall) {
        state.pendingUpdateInstall = true;
        // 업데이트 우선: 동기화 중이어도 즉시 설치 (재시작 후 동기화 재개)
        console.log('[update] installing immediately (sync will resume after restart)');
        setTimeout(() => {
          try {
            autoUpdater.quitAndInstall(false, true);
          } catch (installErr) {
            state.pendingUpdateInstall = false;
            console.warn('[update] quitAndInstall failed:', installErr?.message || installErr);
            broadcastUpdateEvent('update:error', installErr?.message || String(installErr));
          }
        }, 1000);
      }
    });
    autoUpdater.on('download-progress', (progress) => {
      broadcastUpdateEvent('update:progress', progress);
    });
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[update] check failed:', err?.message || err);
      broadcastUpdateEvent('update:error', err?.message || String(err));
    });
  } catch (err) {
    console.warn('[update] init failed:', err?.message || err);
  }
}

module.exports = {
  initAutoUpdater,
};
