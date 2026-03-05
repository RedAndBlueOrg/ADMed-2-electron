'use strict';

const { app, Menu, Tray, nativeImage } = require('electron');
const fs = require('fs');
const state = require('./state');
const { TRAY_ICON_CANDIDATES } = require('./config');

function pickTrayIcon() {
  for (const candidate of TRAY_ICON_CANDIDATES) {
    if (fs.existsSync(candidate)) return nativeImage.createFromPath(candidate);
  }
  return nativeImage.createEmpty();
}

function createTray(win) {
  try {
    const trayIcon = pickTrayIcon();
    state.tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      { label: '열기/보이기', click: () => win.show() },
      { label: '전체화면 토글', click: () => win.setFullScreen(!win.isFullScreen()) },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          app.isQuiting = true;
          app.quit();
        },
      },
    ]);
    state.tray.setToolTip('ADMed');
    state.tray.setContextMenu(contextMenu);
    state.tray.on('double-click', () => {
      win.show();
      win.focus();
    });
  } catch (err) {
    console.error('Tray initialization failed:', err);
  }
}

module.exports = {
  createTray,
};
