'use strict';

const path = require('path');
const fs = require('fs');
const ini = require('ini');
const state = require('./state');

const CACHE_ROOT_NAME = 'admed-cache';
const AUTO_LAUNCH_NAME = 'ADMed';
const TRAY_ICON_CANDIDATES = [
  path.join(__dirname, '..', '..', 'images', 'icon.ico'),
  path.join(process.resourcesPath || path.join(__dirname, '..', '..'), 'images', 'icon.ico'),
];

// Lazy-computed paths (electron.app is not available at module load time)
let _appPaths;
function appPaths() {
  if (!_appPaths) {
    const userData = require('electron').app.getPath('userData');
    _appPaths = {
      USER_DATA_PATH: userData,
      WINDOW_STATE_PATH: path.join(userData, 'window-state.ini'),
      CONFIG_INI_PATH: path.join(userData, 'device_config.ini'),
    };
  }
  return _appPaths;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadEnvFiles() {
  const appDir = path.join(__dirname, '..', '..');
  const candidates = [
    path.join(appDir, '.env'),
    path.join(process.cwd(), '.env'),
    process.resourcesPath ? path.join(process.resourcesPath, '.env') : null,
  ].filter(Boolean);

  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key || process.env[key]) continue;
        const value = line.slice(eq + 1).trim();
        process.env[key] = value;
      }
    } catch (err) {
      console.warn('.env load failed:', err.message);
    }
  }
}

function loadConfigIni() {
  const { CONFIG_INI_PATH } = appPaths();
  if (!fs.existsSync(CONFIG_INI_PATH)) return { deviceSerial: '' };
  try {
    const parsed = ini.parse(fs.readFileSync(CONFIG_INI_PATH, 'utf-8'));
    const ws = parsed.ADMed || {};
    return {
      deviceSerial: ws.device_serial || ws.deviceSerial || '',
    };
  } catch (err) {
    console.warn('config.ini load failed:', err.message);
    return { deviceSerial: '' };
  }
}

function saveConfigIni(next = {}) {
  const { CONFIG_INI_PATH } = appPaths();
  state.configIni = { ...state.configIni, ...next };
  const data = {
    ADMed: {
      device_serial: state.configIni.deviceSerial || '',
    },
  };
  try {
    fs.writeFileSync(CONFIG_INI_PATH, ini.stringify(data));
  } catch (err) {
    console.error('config.ini save failed:', err);
  }
}

module.exports = {
  CACHE_ROOT_NAME,
  AUTO_LAUNCH_NAME,
  TRAY_ICON_CANDIDATES,
  get ADMIN_PASSWORD() { return process.env.ADMIN_PASSWORD || ''; },
  get USER_DATA_PATH() { return appPaths().USER_DATA_PATH; },
  get WINDOW_STATE_PATH() { return appPaths().WINDOW_STATE_PATH; },
  get CONFIG_INI_PATH() { return appPaths().CONFIG_INI_PATH; },
  ensureDir,
  loadEnvFiles,
  loadConfigIni,
  saveConfigIni,
};
