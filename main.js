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
const { detectIpLocation } = require('./src/main/ip-location');

// App lifecycle
app.whenReady().then(async () => {
  // IPC handlers — register BEFORE creating window so renderer can use them immediately
  ipcMain.handle('playlist:prepare', async () => {
    try {
      return await preparePlaylist();
    } catch (err) {
      state.contentSyncing = false;
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

  ipcMain.handle('app:version', async () => app.getVersion());

  ipcMain.handle('weather:config', async () => {
    const ini = state.configIni || {};
    const envLat = process.env.WEATHER_LAT ? Number(process.env.WEATHER_LAT) : null;
    const envLon = process.env.WEATHER_LON ? Number(process.env.WEATHER_LON) : null;
    return {
      lat: Number.isFinite(ini.lat) ? ini.lat : envLat,
      lon: Number.isFinite(ini.lon) ? ini.lon : envLon,
      locationLabel: ini.locationLabel || '',
      weatherServiceUrl:
        process.env.WEATHER_SERVICE_URL ||
        'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst',
      weatherServiceKey: process.env.WEATHER_SERVICE_KEY || '',
    };
  });

  // Create window AFTER IPC handlers are ready
  state.windowState = loadWindowState();
  const win = createWindow();
  createTray(win);

  ipcMain.handle('context:menu', async () => {
    const menu = buildContextMenu();
    menu.popup({ window: win });
  });

  await setupAutoLaunch();

  setupGeolocationPermission();
  attachContextMenu(win);
  initAutoUpdater();

  // 첫 실행/좌표 미설정 시 IP 기반으로 자동 감지하여 device_config.ini 에 저장.
  // 성공 시 렌더러에 알려 weather 패널이 새 좌표로 즉시 fetch 하도록.
  if (!Number.isFinite(state.configIni.lat) || !Number.isFinite(state.configIni.lon)) {
    detectIpLocation()
      .then((coords) => {
        if (!coords) return;
        config.saveConfigIni({ lat: coords.lat, lon: coords.lon, locationLabel: coords.label || '' });
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('weather:config-changed');
        }
      })
      .catch((err) => console.warn('[startup] IP location detect failed:', err.message));
  }

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
