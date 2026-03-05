'use strict';

const fs = require('fs');
const ini = require('ini');
const { screen } = require('electron');
const state = require('./state');
const { WINDOW_STATE_PATH } = require('./config');

function toNumber(value, fallback = undefined) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function loadWindowState() {
  const defaults = { width: 1280, height: 720, fullscreen: false, alwaysOnTop: false };
  try {
    if (!fs.existsSync(WINDOW_STATE_PATH)) {
      return defaults;
    }
    const parsed = ini.parse(fs.readFileSync(WINDOW_STATE_PATH, 'utf-8'));
    const ws = parsed.WindowState || {};

    const rawScale = toNumber(
      ws.lastScaleFactor ?? ws.scaleFactor ?? ws.last_scale_factor ?? ws.scale_factor,
      null
    );
    const lastScaleFactor = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
    const pxWidth = toNumber(ws.pxWidth ?? ws.px_width);
    const pxHeight = toNumber(ws.pxHeight ?? ws.px_height);
    const pxX = toNumber(ws.pxX ?? ws.px_x);
    const pxY = toNumber(ws.pxY ?? ws.px_y);

    const width = Number.isFinite(pxWidth)
      ? Math.round(pxWidth / lastScaleFactor)
      : toNumber(ws.width, defaults.width);
    const height = Number.isFinite(pxHeight)
      ? Math.round(pxHeight / lastScaleFactor)
      : toNumber(ws.height, defaults.height);

    return {
      width: width || defaults.width,
      height: height || defaults.height,
      x: Number.isFinite(pxX) ? Math.round(pxX / lastScaleFactor) : toNumber(ws.x),
      y: Number.isFinite(pxY) ? Math.round(pxY / lastScaleFactor) : toNumber(ws.y),
      fullscreen: ws.fullscreen === 'true' || ws.fullscreen === true,
      alwaysOnTop: ws.alwaysOnTop === 'true' || ws.alwaysOnTop === true,
      pxWidth,
      pxHeight,
      pxX,
      pxY,
      lastScaleFactor,
      lastDisplayId: ws.lastDisplayId || ws.displayId || ws.last_display_id,
    };
  } catch (err) {
    console.error('window state load failed:', err);
    return defaults;
  }
}

function getScaledBounds(win) {
  const bounds = win.getNormalBounds();
  const display = screen.getDisplayMatching(bounds);
  const scaleFactor = display?.scaleFactor || 1;

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    pxWidth: Math.round(bounds.width * scaleFactor),
    pxHeight: Math.round(bounds.height * scaleFactor),
    pxX: Math.round(bounds.x * scaleFactor),
    pxY: Math.round(bounds.y * scaleFactor),
    scaleFactor,
    displayId: display?.id,
  };
}

function setScaledBounds(win, saved) {
  if (!win || !saved) return;
  const sfCandidate =
    saved.lastScaleFactor ??
    saved.last_scale_factor ??
    saved.scaleFactor ??
    saved.scale_factor;
  const sf = Number.isFinite(sfCandidate) && sfCandidate > 0 ? sfCandidate : 1;
  const next = {
    x: Number.isFinite(saved.pxX ?? saved.px_x) ? Math.round((saved.pxX ?? saved.px_x) / sf) : saved.x,
    y: Number.isFinite(saved.pxY ?? saved.px_y) ? Math.round((saved.pxY ?? saved.px_y) / sf) : saved.y,
    width: Number.isFinite(saved.pxWidth ?? saved.px_width)
      ? Math.round((saved.pxWidth ?? saved.px_width) / sf)
      : saved.width,
    height: Number.isFinite(saved.pxHeight ?? saved.px_height)
      ? Math.round((saved.pxHeight ?? saved.px_height) / sf)
      : saved.height,
  };
  win.setBounds(next);
}

function captureWindowState(win) {
  if (!win) return;
  const bounds = getScaledBounds(win);
  const fullscreen = typeof win.isFullScreen === 'function' ? win.isFullScreen() : !!state.isFullscreen;
  state.windowState = {
    ...(state.windowState || {}),
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    fullscreen,
    alwaysOnTop: state.alwaysOnTop,
    pxWidth: bounds.pxWidth,
    pxHeight: bounds.pxHeight,
    pxX: bounds.pxX,
    pxY: bounds.pxY,
    lastScaleFactor: bounds.scaleFactor,
    lastDisplayId: bounds.displayId,
  };
}

function saveWindowState() {
  try {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      captureWindowState(state.mainWindow);
    }
    if (!state.windowState) return;
    const ws = {
      ...state.windowState,
      px_width: state.windowState.pxWidth,
      px_height: state.windowState.pxHeight,
      px_x: state.windowState.pxX,
      px_y: state.windowState.pxY,
      last_scale_factor: state.windowState.lastScaleFactor,
      last_display_id: state.windowState.lastDisplayId,
    };
    const data = { WindowState: ws };
    fs.writeFileSync(WINDOW_STATE_PATH, ini.stringify(data));
  } catch (err) {
    console.error('window state save failed:', err);
  }
}

function scheduleSaveWindowState() {
  if (state.saveStateTimer) clearTimeout(state.saveStateTimer);
  state.saveStateTimer = setTimeout(saveWindowState, 500);
}

module.exports = {
  loadWindowState,
  getScaledBounds,
  setScaledBounds,
  captureWindowState,
  saveWindowState,
  scheduleSaveWindowState,
};
