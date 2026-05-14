'use strict';

module.exports = {
  cacheServer: null,
  cacheServerPort: null,
  cacheServerBase: null,
  cacheServerReady: null,
  tray: null,
  autoLauncher: null,
  pendingUpdateInstall: false,
  contentSyncing: false,
  windowState: null,
  saveStateTimer: null,
  mainWindow: null,
  alwaysOnTop: false,
  isFullscreen: false,
  autoLaunchEnabled: false,
  configIni: { deviceSerial: '', lat: null, lon: null, locationLabel: '' },
  clinicWsConfig: null,
  stompClient: null,
};
