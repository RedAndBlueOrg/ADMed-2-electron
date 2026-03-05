'use strict';

const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');
const state = require('./state');
const { loadWindowState, setScaledBounds, captureWindowState, saveWindowState, scheduleSaveWindowState } = require('./window-state');

function setupGeolocationPermission() {
  try {
    const ses = session && session.defaultSession;
    if (!ses) return;
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        callback(true);
      } else {
        callback(false);
      }
    });
  } catch (err) {
    console.error('Permission setup failed:', err);
  }
}

function createWindow() {
  if (!state.windowState) {
    state.windowState = loadWindowState();
  }
  state.alwaysOnTop = state.windowState.alwaysOnTop || false;
  state.isFullscreen = state.windowState.fullscreen || false;

  const appRoot = path.join(__dirname, '..', '..');

  const win = new BrowserWindow({
    width: state.windowState.width,
    height: state.windowState.height,
    x: state.windowState.x,
    y: state.windowState.y,
    frame: false,
    useContentSize: true,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    icon: path.join(appRoot, 'images', 'icon.ico'),
    show: true,
    fullscreen: state.isFullscreen,
    alwaysOnTop: state.alwaysOnTop,
    skipTaskbar: true,
    maximizable: false,
    webPreferences: {
      preload: path.join(appRoot, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  state.mainWindow = win;
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(appRoot, 'index.html'));

  // win.webContents.openDevTools();

  win.on('system-context-menu', (event) => {
    event.preventDefault();
  });

  if (Number.isFinite(state.windowState?.pxWidth) || Number.isFinite(state.windowState?.pxHeight)) {
    setScaledBounds(win, state.windowState);
  }

  win.on('resize', () => {
    captureWindowState(win);
    scheduleSaveWindowState();
  });

  win.on('move', () => {
    captureWindowState(win);
    scheduleSaveWindowState();
  });

  win.on('enter-full-screen', () => {
    state.isFullscreen = true;
    captureWindowState(win);
    scheduleSaveWindowState();
  });

  win.on('leave-full-screen', () => {
    state.isFullscreen = false;
    captureWindowState(win);
    scheduleSaveWindowState();
  });

  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    } else {
      saveWindowState();
    }
  });

  return win;
}

module.exports = {
  setupGeolocationPermission,
  createWindow,
};
