'use strict';

const { app, Menu, screen } = require('electron');
const state = require('./state');
const { ADMIN_PASSWORD, saveConfigIni } = require('./config');
const { captureWindowState, scheduleSaveWindowState } = require('./window-state');
const { setAutoLaunch, isAutoLaunchEnabled } = require('./auto-launch');
const { promptInput, promptAdminSettings, promptAdminMenu, promptError } = require('./dialogs');

function setWindowSize(width, height) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  state.mainWindow.setFullScreen(false);
  state.isFullscreen = false;
  if (state.windowState) state.windowState.fullscreen = false;
  state.mainWindow.setSize(width, height);
  try {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const x = Math.max(0, Math.floor((sw - width) / 2));
    const y = Math.max(0, Math.floor((sh - height) / 2));
    state.mainWindow.setPosition(x, y);
  } catch {}
  captureWindowState(state.mainWindow);
  scheduleSaveWindowState();
}

function buildContextMenu() {
  const sizePresetsLandscape = [
    { label: '1280 × 720 (16:9)', click: () => setWindowSize(1280, 720) },
    { label: '1600 × 900 (16:9)', click: () => setWindowSize(1600, 900) },
    { label: '1920 × 1080 (16:9)', click: () => setWindowSize(1920, 1080) },
  ];
  const sizePresetsPortrait = [
    { label: '720 × 1280 (세로)', click: () => setWindowSize(720, 1280) },
    { label: '900 × 1600 (세로)', click: () => setWindowSize(900, 1600) },
    { label: '1080 × 1920 (세로)', click: () => setWindowSize(1080, 1920) },
  ];

  const template = [
    {
      label: '새로고침',
      click: () => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) state.mainWindow.webContents.reloadIgnoringCache();
      },
    },
    { type: 'separator' },
    {
      label: '창 크기 설정',
      submenu: [...sizePresetsLandscape, { type: 'separator' }, ...sizePresetsPortrait],
    },
    {
      label: '창 위치 이동',
      submenu: [
        {
          label: '중앙으로',
          click: () => {
            if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
            try {
              const { width, height } = state.mainWindow.getBounds();
              const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
              const x = Math.max(0, Math.floor((sw - width) / 2));
              const y = Math.max(0, Math.floor((sh - height) / 2));
              state.mainWindow.setPosition(x, y);
              scheduleSaveWindowState();
            } catch {}
          },
        },
        {
          label: '좌상단으로 (0,0)',
          click: () => {
            if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
            state.mainWindow.setPosition(0, 0);
            scheduleSaveWindowState();
          },
        },
      ],
    },
    {
      label: '전체화면',
      type: 'checkbox',
      checked: !!state.isFullscreen,
      click: (mi) => {
        if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
        const wantFS = !!mi.checked;
        state.mainWindow.setFullScreen(wantFS);
        state.isFullscreen = wantFS;
        if (state.windowState) state.windowState.fullscreen = wantFS;
        scheduleSaveWindowState();
      },
    },
    {
      label: '항상 위',
      type: 'checkbox',
      checked: !!state.alwaysOnTop,
      click: (mi) => {
        state.alwaysOnTop = !!mi.checked;
        if (state.windowState) state.windowState.alwaysOnTop = state.alwaysOnTop;
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.setAlwaysOnTop(state.alwaysOnTop, 'screen-saver');
        }
        scheduleSaveWindowState();
      },
    },
    { type: 'separator' },
    {
      label: '관리자 설정',
      click: async () => {
        while (true) {
          const pw = await promptInput({ title: '관리자 인증', label: '관리자 비밀번호를 입력하세요.', password: true });
          if (pw === null) return;
          if (pw === ADMIN_PASSWORD) break;
          await promptError({ title: '관리자 인증 실패', message: '비밀번호가 올바르지 않습니다.' });
        }

        const choice = await promptAdminMenu();
        if (!choice) return;

        if (choice === 'devtools') {
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            state.mainWindow.webContents.openDevTools();
          }
          return;
        }

        if (choice === 'serial') {
          const currentSerial = state.configIni.deviceSerial || '';
          const result = await promptAdminSettings({ currentSerial });
          if (!result) return;

          const prevSerial = state.configIni.deviceSerial || '';
          saveConfigIni({
            deviceSerial: result.deviceSerial || '',
          });
          const changed = prevSerial !== (result.deviceSerial || '');
          if (changed && state.mainWindow && !state.mainWindow.isDestroyed()) {
            try { state.mainWindow.webContents.reloadIgnoringCache(); } catch {}
          }
        }
      },
    },
    {
      label: '윈도우 시작 시 자동 실행',
      type: 'checkbox',
      checked: state.autoLaunchEnabled,
      async click(mi) {
        await setAutoLaunch(!!mi.checked);
        state.autoLaunchEnabled = await isAutoLaunchEnabled();
        mi.checked = state.autoLaunchEnabled;
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ];

  return Menu.buildFromTemplate(template);
}

function attachContextMenu(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.on('context-menu', (e) => {
    e.preventDefault();
    const menu = buildContextMenu();
    menu.popup({ window: win });
  });
}

module.exports = {
  setWindowSize,
  buildContextMenu,
  attachContextMenu,
};
