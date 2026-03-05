'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');

// Chrome flags (must be set before app.whenReady)
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');

// Load env BEFORE other modules (constants depend on process.env)
const { loadEnvFiles } = require('./src/main/config');
loadEnvFiles();

// Shared state & config
const state = require('./src/main/state');
const config = require('./src/main/config');

state.configIni = config.loadConfigIni();
app.isQuiting = false;

// Module imports
const { loadWindowState } = require('./src/main/window-state');
const { setupAutoLaunch } = require('./src/main/auto-launch');
const { createWindow, setupGeolocationPermission } = require('./src/main/window');
const { createTray } = require('./src/main/tray');
const { buildContextMenu, attachContextMenu } = require('./src/main/context-menu');
const { initAutoUpdater } = require('./src/main/updater');
const { preparePlaylist } = require('./src/main/playlist');
const { fetchNoticesFast } = require('./src/main/scenario-api');
const { startClinicSocket, stopClinicSocket } = require('./src/main/clinic-ws');

// App lifecycle
app.whenReady().then(async () => {
  state.windowState = loadWindowState();
  const win = createWindow();
  createTray(win);

  await setupAutoLaunch();

  setupGeolocationPermission();
  attachContextMenu(win);
  initAutoUpdater();

  // IPC handlers
  ipcMain.handle('playlist:prepare', async () => {
    try {
      return await preparePlaylist();
    } catch (err) {
      state.contentSyncing = false;
      if (state.updateReadyWhileSyncing) {
        state.updateReadyWhileSyncing = false;
        console.log('[update] content sync failed – proceeding with deferred quitAndInstall');
        setTimeout(() => {
          try { require('electron-updater').autoUpdater.quitAndInstall(false, true); } catch (_) { state.pendingUpdateInstall = false; }
        }, 1000);
      }
      throw err;
    }
  });

  ipcMain.handle('notice:fetch', async () => {
    try {
      return await fetchNoticesFast();
    } catch (err) {
      console.warn('notice fetch failed (handler):', err.message);
      return { noticeList: [], waitingInfo: null, error: err.message };
    }
  });

  ipcMain.handle('clinic:ws:start', async (_event, cfg) => {
    startClinicSocket(cfg || {});
    return true;
  });

  ipcMain.handle('clinic:ws:stop', async () => {
    stopClinicSocket();
    return true;
  });

  ipcMain.handle('context:menu', async () => {
    const menu = buildContextMenu();
    menu.popup({ window: win });
  });

  ipcMain.handle('app:version', async () => app.getVersion());

  ipcMain.handle('weather:config', async () => {
    return {
      lat: process.env.WEATHER_LAT ? Number(process.env.WEATHER_LAT) : null,
      lon: process.env.WEATHER_LON ? Number(process.env.WEATHER_LON) : null,
      weatherServiceUrl:
        process.env.WEATHER_SERVICE_URL ||
        'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst',
      weatherServiceKey: process.env.WEATHER_SERVICE_KEY || '',
    };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (state.mainWindow) {
      state.mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
