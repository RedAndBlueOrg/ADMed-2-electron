'use strict';

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, dialog, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const http = require('http');
const https = require('https');
const { pathToFileURL } = require('url');
const AdmZip = require('adm-zip');
const AutoLaunch = require('auto-launch');
const ini = require('ini');
const { autoUpdater } = require('electron-updater');

const CACHE_ROOT_NAME = 'admed-cache';
const USER_DATA_PATH = app.getPath('userData');
const WINDOW_STATE_PATH = path.join(USER_DATA_PATH, 'window-state.ini');
const CONFIG_INI_PATH = path.join(USER_DATA_PATH, 'device_config.ini');
const TRAY_ICON_CANDIDATES = [
  path.join(__dirname, 'images', 'icon.ico'),
  path.join(process.resourcesPath || __dirname, 'images', 'icon.ico'),
];
const ADMIN_PASSWORD = 'rnb61196119';

app.commandLine.appendSwitch('ignore-certificate-errors');
// Enable WinRT geolocation (avoids Google API key requirement on Windows)
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');

let cacheServer = null;
let cacheServerPort = null;
let cacheServerBase = null;
let cacheServerReady = null;
let tray = null;
let autoLauncher = null;
let windowState = null;
let saveStateTimer = null;
let mainWindow = null;
let alwaysOnTop = false;
let isFullscreen = false;
let autoLaunchEnabled = false;
app.isQuiting = false;
let configIni = { deviceSerial: '' };
let clinicWsConfig = null;
const CLINIC_BACKOFF_MAX = 30000;
const WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : null;
const clinicSessions = new Map(); // key: seq|null, value: { ws, timer, delay }

function getWsImpl() {
  if (WebSocketImpl) return WebSocketImpl;
  try {
    // lazy import to avoid hard dependency if not installed
    // eslint-disable-next-line global-require
    return require('ws');
  } catch (err) {
    console.warn('[clinic] WebSocket implementation unavailable:', err.message);
    return null;
  }
}

function sendClinicWsEvent(payload) {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send('clinic:ws:event', payload);
    }
  }
}

function sendDownloadProgress(payload) {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send('download:progress', payload);
    }
  }
}

function stopClinicSocket() {
  for (const [, session] of clinicSessions) {
    if (session.timer) clearTimeout(session.timer);
    if (session.ws) {
      try {
        session.ws.close();
      } catch (_) {
        /* noop */
      }
    }
  }
  clinicSessions.clear();
}

function startClinicSocket(config) {
  const memberSeq = config?.memberSeq;
  const clinicSeqList = Array.isArray(config?.clinicSeqList)
    ? config.clinicSeqList.filter((v) => v !== undefined && v !== null)
    : [config?.clinicSeq].filter((v) => v !== undefined && v !== null);
  const origin = config?.clinicWsOrigin;
  if (!memberSeq || !origin) {
    stopClinicSocket();
    return;
  }
  const WsCtor = getWsImpl();
  if (!WsCtor) return;

  stopClinicSocket();
  clinicWsConfig = { memberSeq, clinicSeqList, clinicWsOrigin: origin };

  const targets = [null, ...clinicSeqList];

  for (const clinicSeq of targets) {
    const key = clinicSeq === null ? 'all' : clinicSeq;
    const urlBase = `${origin.replace(/\/+$/, '')}/clinic/topic/${memberSeq}`;
    const url = clinicSeq ? `${urlBase}/${clinicSeq}` : urlBase;

    const connect = () => {
      let ws;
      try {
        ws = new WsCtor(url);
      } catch (err) {
        console.warn('[clinic] WS open failed:', err.message);
        scheduleReconnect(key);
        return;
      }
      clinicSessions.set(key, { ws, timer: null, delay: 1000 });

      ws.onopen = () => {
        const session = clinicSessions.get(key);
        if (session) session.delay = 1000;
        sendClinicWsEvent({ type: 'status', status: 'open', clinicSeq });
      };

      ws.onmessage = (event) => {
        try {
          const raw = event?.data || event;
          const text = Buffer.isBuffer(raw) ? raw.toString('utf-8') : raw?.toString?.() || '';
          const parsed = text ? JSON.parse(text) : null;
          sendClinicWsEvent({ type: 'data', data: parsed, raw: text, clinicSeq });
        } catch (err) {
          console.warn('[clinic] WS message parse failed:', err.message);
        }
      };

      ws.onerror = (err) => {
        console.warn('[clinic] WS error:', err?.message || err);
        sendClinicWsEvent({ type: 'status', status: 'error', error: err?.message || String(err), clinicSeq });
      };

      ws.onclose = () => {
        const session = clinicSessions.get(key);
        sendClinicWsEvent({ type: 'status', status: 'closed', clinicSeq });
        if (session) scheduleReconnect(key);
      };
    };

    const scheduleReconnect = (k) => {
      const session = clinicSessions.get(k) || { ws: null, timer: null, delay: 1000 };
      if (session.timer) return;
      const delay = session.delay || 1000;
      const nextDelay = Math.min(delay * 2, CLINIC_BACKOFF_MAX);
      session.timer = setTimeout(() => {
        session.timer = null;
        session.delay = nextDelay;
        clinicSessions.set(k, session);
        connect();
      }, delay);
      clinicSessions.set(k, session);
    };

    connect();
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadEnvFiles() {
  const candidates = [
    path.join(__dirname, '.env'),
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

loadEnvFiles();

function loadConfigIni() {
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
  configIni = { ...configIni, ...next };
  const data = {
    ADMed: {
      device_serial: configIni.deviceSerial || '',
    },
  };
  try {
    fs.writeFileSync(CONFIG_INI_PATH, ini.stringify(data));
  } catch (err) {
    console.error('config.ini save failed:', err);
  }
}

configIni = loadConfigIni();

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
  const fullscreen = typeof win.isFullScreen === 'function' ? win.isFullScreen() : !!isFullscreen;
  windowState = {
    ...(windowState || {}),
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    fullscreen,
    alwaysOnTop,
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      captureWindowState(mainWindow);
    }
    if (!windowState) return;
    const ws = {
      ...windowState,
      px_width: windowState.pxWidth,
      px_height: windowState.pxHeight,
      px_x: windowState.pxX,
      px_y: windowState.pxY,
      last_scale_factor: windowState.lastScaleFactor,
      last_display_id: windowState.lastDisplayId,
    };
    const data = { WindowState: ws };
    fs.writeFileSync(WINDOW_STATE_PATH, ini.stringify(data));
  } catch (err) {
    console.error('window state save failed:', err);
  }
}

function scheduleSaveWindowState() {
  if (saveStateTimer) clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(saveWindowState, 500);
}

async function setAutoLaunch(enabled) {
  if (!autoLauncher) return;
  try {
    const isEnabled = await autoLauncher.isEnabled();
    if (enabled && !isEnabled) {
      await autoLauncher.enable();
    } else if (!enabled && isEnabled) {
      await autoLauncher.disable();
    }
    autoLaunchEnabled = await autoLauncher.isEnabled();
  } catch (err) {
    console.warn('Auto-launch setup failed:', err.message);
  }
}

async function isAutoLaunchEnabled() {
  try {
    if (!autoLauncher) return false;
    return await autoLauncher.isEnabled();
  } catch {
    return false;
  }
}

function selectHttpModule(url) {
  return url.startsWith('https') ? https : http;
}

async function downloadFileWithHeaders(url, destPath) {
  const tempPath = `${destPath}.part`;

  return new Promise((resolve, reject) => {
    const mod = selectHttpModule(url);
    const request = mod.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const contentType = response.headers['content-type'];
      const fileStream = fs.createWriteStream(tempPath);
      pipeline(response, fileStream)
        .then(() => fs.rename(tempPath, destPath, (err) => (err ? reject(err) : resolve({ path: destPath, contentType }))))
        .catch(reject);
    });

    request.on('error', reject);
  });
}

function getScenarioApiUrl() {
  const base = process.env.SCENARIO_API_URL || '';
  const deviceSerial = configIni.deviceSerial || '';
  if (!base) return '';
  if (!deviceSerial) return base;
  try {
    const u = new URL(base);
    u.searchParams.set('id', deviceSerial);
    return u.toString();
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}id=${encodeURIComponent(deviceSerial)}`;
  }
}

async function downloadFile(url, destPath) {
  const result = await downloadFileWithHeaders(url, destPath);
  return result.path;
}

async function startCacheServer(cacheRoot) {
  if (cacheServerBase) return cacheServerBase;
  if (cacheServerReady) {
    await cacheServerReady;
    return cacheServerBase;
  }

  const server = http.createServer((req, res) => {
    const prefix = '/cache/';
    if (!req.url.startsWith(prefix)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const relPath = decodeURIComponent(req.url.slice(prefix.length));
    const targetPath = path.join(cacheRoot, relPath);
    if (!targetPath.startsWith(cacheRoot)) {
      res.statusCode = 400;
      res.end('invalid path');
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin');
      res.end();
      return;
    }
    fs.stat(targetPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.statusCode = 404;
        res.end();
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const mimeMap = {
        '.m3u8': 'application/vnd.apple.mpegurl',
        '.ts': 'video/mp2t',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin');
      res.setHeader('Accept-Ranges', 'bytes');
      fs.createReadStream(targetPath).pipe(res);
    });
  });

  cacheServerReady = new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      cacheServerPort = server.address().port;
      cacheServerBase = `http://127.0.0.1:${cacheServerPort}/cache`;
      resolve(cacheServerBase);
    });
  });

  cacheServer = server;
  await cacheServerReady;
  return cacheServerBase;
}

function extractZip(zipPath, targetDir) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
}

function findFirstManifest(dirPath) {
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const nested = findFirstManifest(fullPath);
      if (nested) return nested;
    } else if (stat.isFile() && path.extname(fullPath).toLowerCase() === '.m3u8') {
      return fullPath;
    }
  }
  return null;
}

function buildFileUrl(baseUrl, img, type) {
  if (!baseUrl) throw new Error('templateBaseUrl is not configured');
  const url = new URL(baseUrl);
  url.searchParams.set('img', img);
  const typeLower = (type || '').toLowerCase();
  const normalizedType = ['jpg', 'jpeg', 'png'].includes(typeLower) ? 'jpg' : typeLower || 'jpg';
  url.searchParams.set('type', normalizedType);
  return url.toString();
}

async function fetchScenarioPlaylist() {
  const scenarioUrl = getScenarioApiUrl();
  const templateBaseUrl = process.env.TEMPLATE_BASE_URL || '';
  if (!scenarioUrl || !templateBaseUrl) {
    throw new Error(
      'scenario API URL (.env SCENARIO_API_URL + config.ini device_serial) and templateBaseUrl (.env TEMPLATE_BASE_URL) are required.'
    );
  }

  const res = await fetch(scenarioUrl);
  if (!res.ok) throw new Error(`Scenario API request failed: ${res.status}`);
  const data = await res.json();
  const templates = Array.isArray(data.templates) ? data.templates : [];

  const mapped = templates
    .map((tpl, idx) => {
      const typeRaw = (tpl.type || '').toLowerCase();
      const sort = tpl.sort ?? idx;
      const time = Number(tpl.time) || undefined;
      const title = tpl.templateStorage?.title || tpl.img || `item-${idx}`;
      const img = tpl.img;
      if (!img || !typeRaw) return null;

      let mappedType = 'video';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(typeRaw)) mappedType = 'image';
      else if (typeRaw === 'm3u8') mappedType = 'hls-zip';
      else if (['mp4', 'mov'].includes(typeRaw)) mappedType = 'video';

      const url = buildFileUrl(templateBaseUrl, img, typeRaw);
      return {
        id: tpl.img || `item-${idx}`,
        title,
        type: mappedType,
        url,
        durationSeconds: mappedType === 'image' ? time : undefined,
        sort,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  return { playlist: mapped, waitingInfo: data.waitingInfo, memberSeq: data.mSeq?.seq ?? null, scenarioRaw: data };
}

async function getScenario() {
  return fetchScenarioPlaylist();
}

function buildNoticeUrlFromScenario(apiUrl, memberId) {
  if (!apiUrl || !memberId) return null;
  try {
    const u = new URL(apiUrl);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}/dapi/clinic/notice/list?memberId=${memberId}`;
  } catch (_err) {
    return null;
  }
}

async function fetchNoticeList(baseUrl, memberId) {
  if (!baseUrl || !memberId) return [];
  const url = buildNoticeUrlFromScenario(baseUrl, memberId);
  if (!url) return [];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Notice API request failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((n, idx) => ({
        id: n.id || `notice-${idx}`,
        content: n.content || '',
        sort: n.sort ?? idx,
      }))
      .filter((n) => n.content)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  } catch (err) {
    console.warn('Notice fetch failed:', err.message);
    return [];
  }
}

async function fetchNoticesFast() {
  try {
    const scenario = await getScenario();
    const noticeList = await fetchNoticeList(getScenarioApiUrl(), scenario.memberSeq);
    return { noticeList, waitingInfo: scenario.waitingInfo };
  } catch (err) {
    console.warn('notice fetch failed:', err.message);
    return { noticeList: [], waitingInfo: null, error: err.message };
  }
}

function setWindowSize(width, height) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setFullScreen(false);
  isFullscreen = false;
  if (windowState) windowState.fullscreen = false;
  mainWindow.setSize(width, height);
  try {
    const { width: sw, height: sh } = require('electron').screen.getPrimaryDisplay().workAreaSize;
    const x = Math.max(0, Math.floor((sw - width) / 2));
    const y = Math.max(0, Math.floor((sh - height) / 2));
    mainWindow.setPosition(x, y);
  } catch {}
  captureWindowState(mainWindow);
  scheduleSaveWindowState();
}

async function promptInput({ title, label, placeholder = '', value = '', password = false }) {
  return new Promise((resolve) => {
    const promptWin = new BrowserWindow({
      width: 460,
      height: 215,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      modal: true,
      parent: mainWindow || undefined,
      show: false,
      backgroundColor: '#f7f8fb',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    const html = `
      <!doctype html>
      <html><head><meta charset="UTF-8">
      <style>
        body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f7f8fb; color: #111; }
        .card { margin: 12px; padding: 16px 16px 12px; background: #fff; border-radius: 14px; box-shadow: 0 12px 38px rgba(0,0,0,0.14); }
        h1 { margin: 0 0 10px 0; font-size: 18px; }
        label { display: block; margin-bottom: 10px; color: #444; }
        input { width: 100%; padding: 10px 12px; font-size: 15px; border: 1px solid #ccd; border-radius: 10px; outline: none; box-sizing: border-box; }
        input:focus { border-color: #4d7cff; box-shadow: 0 0 0 3px rgba(77,124,255,0.2); }
        .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
        button { padding: 11px 0; border: none; border-radius: 10px; font-size: 15px; cursor: pointer; }
        .primary { background: #4d7cff; color: #fff; }
        .secondary { background: #e6e8ef; color: #333; }
      </style>
      </head>
      <body>
        <div class="card">
          <h1>${title}</h1>
          <label>${label}</label>
          <input id="input" type="${password ? 'password' : 'text'}" placeholder="${placeholder}" value="${value || ''}" autofocus />
          <div class="actions">
            <button class="primary" id="ok">확인</button>
            <button class="secondary" id="cancel">취소</button>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          const input = document.getElementById('input');
          document.getElementById('ok').addEventListener('click', () => ipcRenderer.send('prompt:response', input.value));
          document.getElementById('cancel').addEventListener('click', () => ipcRenderer.send('prompt:response', null));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') ipcRenderer.send('prompt:response', input.value);
            if (e.key === 'Escape') ipcRenderer.send('prompt:response', null);
          });
        </script>
      </body></html>
    `;

    ipcMain.once('prompt:response', (_e, val) => {
      try { promptWin.close(); } catch {}
      resolve(val);
    });
    promptWin.on('closed', () => resolve(null));
    promptWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    promptWin.once('ready-to-show', () => promptWin.show());
  });
}

async function promptAdminSettings({ currentSerial = '' } = {}) {
  return new Promise((resolve) => {
    const promptWin = new BrowserWindow({
      width: 460,
      height: 225,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      modal: true,
      parent: mainWindow || undefined,
      show: false,
      backgroundColor: '#f7f8fb',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    const html = `
      <!doctype html>
      <html><head><meta charset="UTF-8">
      <style>
        body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f7f8fb; color: #111; }
        .card { margin: 12px; padding: 16px 16px 12px; background: #fff; border-radius: 14px; box-shadow: 0 12px 38px rgba(0,0,0,0.14); }
        h1 { margin: 0 0 10px 0; font-size: 18px; }
        label { display: block; margin-bottom: 8px; color: #444; font-size: 14px; }
        input { width: 100%; padding: 10px 12px; font-size: 15px; border: 1px solid #ccd; border-radius: 10px; outline: none; box-sizing: border-box; margin-bottom: 12px; }
        input:focus { border-color: #4d7cff; box-shadow: 0 0 0 3px rgba(77,124,255,0.2); }
        .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
        button { padding: 11px 0; border: none; border-radius: 10px; font-size: 15px; cursor: pointer; }
        .primary { background: #4d7cff; color: #fff; }
        .secondary { background: #e6e8ef; color: #333; }
      </style>
      </head>
      <body>
        <div class="card">
          <h1>관리자 설정</h1>
          <label>기기 시리얼 번호</label>
          <input id="deviceSerial" type="text" value="${currentSerial || ''}" />
          <div class="actions">
            <button class="primary" id="ok">저장</button>
            <button class="secondary" id="cancel">취소</button>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          const deviceSerial = document.getElementById('deviceSerial');
          document.getElementById('ok').addEventListener('click', () => {
            ipcRenderer.send('prompt:admin:response', {
              deviceSerial: deviceSerial.value.trim(),
            });
          });
          document.getElementById('cancel').addEventListener('click', () => ipcRenderer.send('prompt:admin:response', null));
          window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('ok').click();
            if (e.key === 'Escape') document.getElementById('cancel').click();
          });
        </script>
      </body></html>
    `;

    ipcMain.once('prompt:admin:response', (_e, payload) => {
      try { promptWin.close(); } catch {}
      resolve(payload || null);
    });
    promptWin.on('closed', () => resolve(null));
    promptWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    promptWin.once('ready-to-show', () => promptWin.show());
  });
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
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
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
            if (!mainWindow || mainWindow.isDestroyed()) return;
            try {
              const { width, height } = mainWindow.getBounds();
              const { width: sw, height: sh } = require('electron').screen.getPrimaryDisplay().workAreaSize;
              const x = Math.max(0, Math.floor((sw - width) / 2));
              const y = Math.max(0, Math.floor((sh - height) / 2));
              mainWindow.setPosition(x, y);
              scheduleSaveWindowState();
            } catch {}
          },
        },
        {
          label: '좌상단으로 (0,0)',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            mainWindow.setPosition(0, 0);
            scheduleSaveWindowState();
          },
        },
      ],
    },
    {
      label: '전체화면',
      type: 'checkbox',
      checked: !!isFullscreen,
      click: (mi) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const wantFS = !!mi.checked;
        mainWindow.setFullScreen(wantFS);
        isFullscreen = wantFS;
        if (windowState) windowState.fullscreen = wantFS;
        scheduleSaveWindowState();
      },
    },
    {
      label: '항상 위',
      type: 'checkbox',
      checked: !!alwaysOnTop,
      click: (mi) => {
        alwaysOnTop = !!mi.checked;
        if (windowState) windowState.alwaysOnTop = alwaysOnTop;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
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
          if (pw === null) return; // 취소 시 조용히 종료
          if (pw === ADMIN_PASSWORD) break;
          await promptError({ title: '관리자 인증 실패', message: '비밀번호가 올바르지 않습니다.' });
        }

        const currentSerial = configIni.deviceSerial || '';
        const result = await promptAdminSettings({ currentSerial });
        if (!result) return;

        const prevSerial = configIni.deviceSerial || '';
        saveConfigIni({
          deviceSerial: result.deviceSerial || '',
        });
        const changed = prevSerial !== (result.deviceSerial || '');
        if (changed && mainWindow && !mainWindow.isDestroyed()) {
          try { mainWindow.webContents.reloadIgnoringCache(); } catch {}
        }
      },
    },
    {
      label: '윈도우 시작 시 자동 실행',
      type: 'checkbox',
      checked: autoLaunchEnabled,
      async click(mi) {
        await setAutoLaunch(!!mi.checked);
        autoLaunchEnabled = await isAutoLaunchEnabled();
        mi.checked = autoLaunchEnabled;
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

function pickTrayIcon() {
  for (const candidate of TRAY_ICON_CANDIDATES) {
    if (fs.existsSync(candidate)) return nativeImage.createFromPath(candidate);
  }
  return nativeImage.createEmpty();
}

function createTray(win) {
  try {
    const trayIcon = pickTrayIcon();
    tray = new Tray(trayIcon);
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
    tray.setToolTip('ADMed');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      win.show();
      win.focus();
    });
  } catch (err) {
    console.error('Tray initialization failed:', err);
  }
}

function setupAutoLaunch() {
  autoLauncher = new AutoLaunch({ name: 'ADMed' });
  autoLauncher
    .isEnabled()
    .then((enabled) => {
      autoLaunchEnabled = enabled;
      if (!enabled) return autoLauncher.enable();
      return null;
    })
    .catch((err) => console.warn('Auto-launch setup failed:', err.message));
}

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
  if (!windowState) {
    windowState = loadWindowState();
  }
  alwaysOnTop = windowState.alwaysOnTop || false;
  isFullscreen = windowState.fullscreen || false;

  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    frame: false,
    useContentSize: true,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'images', 'icon.ico'),
    show: true,
    fullscreen: isFullscreen,
    alwaysOnTop: alwaysOnTop,
    skipTaskbar: true,
    maximizable: false, // 더블클릭으로 최대화 방지
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  Menu.setApplicationMenu(null);
  win.loadFile('index.html');

  // 드래그 영역에서의 기본 시스템 메뉴 차단 (우클릭 메뉴 방지)
  win.on('system-context-menu', (event) => {
    event.preventDefault();
  });

  // px 기반으로 저장된 값이 있을 경우 스케일을 적용해 복원
  if (Number.isFinite(windowState?.pxWidth) || Number.isFinite(windowState?.pxHeight)) {
    setScaledBounds(win, windowState);
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
    isFullscreen = true;
    captureWindowState(win);
    scheduleSaveWindowState();
  });

  win.on('leave-full-screen', () => {
    isFullscreen = false;
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

async function preparePlaylist() {
  const cacheRoot = path.join(app.getPath('temp'), CACHE_ROOT_NAME);
  ensureDir(cacheRoot);
  const cacheBaseUrl = await startCacheServer(cacheRoot);

  let playlist = [];
  let waitingInfo = null;
  let noticeList = [];
  let memberSeq = null;
  let downloadTotal = 0;
  let downloadFinished = 0;

  const notifyDownload = () => {
    const active = downloadTotal > 0 && downloadFinished < downloadTotal;
    sendDownloadProgress({
      total: downloadTotal,
      finished: Math.min(downloadFinished, downloadTotal),
      active,
    });
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

  const prepared = [];
  const backgroundDownloads = [];
  const keepPaths = new Set();

  for (const item of playlist) {
    if (!item.url) continue;

    let urlObj;
    try {
      urlObj = new URL(item.url);
    } catch (err) {
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
      // HLS 스트림은 로컬 캐시 없음
      continue;
    }

    if (itemType === 'hls-zip') {
      const destDir = path.join(cacheRoot, safeBase);
      ensureDir(destDir);
      const zipPath = path.join(cacheRoot, `${safeBase}.zip`);

      if (!fs.existsSync(zipPath) || !findFirstManifest(destDir)) {
        downloadTotal += 1;
        notifyDownload();
        try {
          const dl = await downloadFileWithHeaders(item.url, zipPath);
          extractZip(zipPath, destDir);
          downloadFinished += 1;
          notifyDownload();
        } catch (err) {
          console.error(`download failed for package ${item.url}`, err);
          downloadFinished += 1;
          notifyDownload();
          prepared.push({ ...item, type: 'hls', streamUrl: item.url, error: err.message });
          continue;
        }
      }

      const manifestPath = findFirstManifest(destDir);
      if (!manifestPath) {
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

    downloadTotal += 1;
    notifyDownload();

    const dl = downloadFile(item.url, destPath)
      .then(() => {
        downloadFinished += 1;
        notifyDownload();
      })
      .catch((err) => {
        console.error(`download failed (bg) for ${item.url}`, err);
        downloadFinished += 1;
        notifyDownload();
      });

    backgroundDownloads.push(dl);
  }

  if (backgroundDownloads.length) {
    Promise.allSettled(backgroundDownloads).then(() => {
    });
  }

  // 캐시 청소: keepPaths에 없는 오래된 파일/폴더 제거
  cleanupCache(cacheRoot, keepPaths);

  const clinicApiOrigin = process.env.CLINIC_API_ORIGIN || '';
  const clinicWsOrigin = process.env.CLINIC_WS_ORIGIN || '';
  if (!clinicApiOrigin || !clinicWsOrigin) {
    console.warn('[clinic] API/WS origin env is missing. CLINIC_API_ORIGIN or CLINIC_WS_ORIGIN not set.');
  }
  const landingUrl = process.env.LANDING_URL || 'https://www.admed.kr';

  return {
    playlist: prepared,
    waitingInfo,
    noticeList,
    memberSeq,
    deviceSerial: configIni.deviceSerial || '',
    clinicApiOrigin,
    clinicWsOrigin,
    landingUrl,
  };
}

function cleanupCache(cacheRoot, keepPaths) {
  try {
    const entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
    const now = Date.now();
    const staleMs = 15 * 60 * 1000; // 최근 15분 내 생성된 항목은 건너뜀

    for (const entry of entries) {
      const fullPath = path.join(cacheRoot, entry.name);
      if (keepPaths.has(fullPath)) continue;

      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs < staleMs) continue; // 너무 최근이면 건너뜀

        if (entry.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.rmSync(fullPath, { force: true });
        }
      } catch (err) {
        console.warn('[cache] remove failed:', fullPath, err.message);
      }
    }
  } catch (err) {
    console.warn('[cache] cleanup skipped:', err.message);
  }
}

function attachContextMenu(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.on('context-menu', (e) => {
    e.preventDefault();
    const menu = buildContextMenu();
    menu.popup({ window: win });
  });
}

function initAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (err) => {
      console.warn('[update] error:', err?.message || err);
    });
    autoUpdater.on('update-available', (info) => {
      console.log('[update] available:', info?.version || 'unknown');
    });
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[update] downloaded:', info?.version || 'unknown', '- will install on quit');
    });
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[update] check failed:', err?.message || err);
    });
  } catch (err) {
    console.warn('[update] init failed:', err?.message || err);
  }
}

app.whenReady().then(() => {
  windowState = loadWindowState();
  const win = createWindow();
  createTray(win);
  setupAutoLaunch();
  setupGeolocationPermission();
  attachContextMenu(win);
  initAutoUpdater();

  ipcMain.handle('playlist:prepare', async () => {
    return await preparePlaylist();
  });
  ipcMain.handle('notice:fetch', async () => {
    try {
      return await fetchNoticesFast();
    } catch (err) {
      console.warn('notice fetch failed (handler):', err.message);
      return { noticeList: [], waitingInfo: null, error: err.message };
    }
  });
  ipcMain.handle('clinic:ws:start', async (_event, config) => {
    startClinicSocket(config || {});
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
  ipcMain.handle('weather:config', async () => {
    return {
      lat: process.env.WEATHER_LAT ? Number(process.env.WEATHER_LAT) : null,
      lon: process.env.WEATHER_LON ? Number(process.env.WEATHER_LON) : null,
    };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
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
async function promptError({ title, message }) {
  return new Promise((resolve) => {
    const promptWin = new BrowserWindow({
      width: 350,
      height: 155,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      modal: true,
      parent: mainWindow || undefined,
      show: false,
      backgroundColor: '#f7f8fb',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    const html = `
      <!doctype html>
      <html><head><meta charset="UTF-8">
      <style>
        body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f7f8fb; color: #111; }
        .card { margin: 10px; padding: 14px 14px 10px; background: #fff; border-radius: 14px; box-shadow: 0 12px 38px rgba(0,0,0,0.14); }
        h1 { margin: 0 0 10px 0; font-size: 18px; }
        p { margin: 0 0 12px 0; font-size: 15px; color: #444; }
        .actions { display: flex; gap: 8px; margin-top: 10px; }
        button { padding: 10px 0; border: none; border-radius: 10px; font-size: 15px; cursor: pointer; flex: 1; }
        .primary { background: #4d7cff; color: #fff; }
      </style>
      </head>
      <body>
        <div class="card">
          <h1>${title}</h1>
          <p>${message}</p>
          <div class="actions">
            <button class="primary" id="ok">확인</button>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          document.getElementById('ok').addEventListener('click', () => ipcRenderer.send('prompt:error:response'));
          window.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') ipcRenderer.send('prompt:error:response'); });
        </script>
      </body></html>
    `;

    ipcMain.once('prompt:error:response', () => {
      try { promptWin.close(); } catch {}
      resolve();
    });
    promptWin.on('closed', () => resolve());
    promptWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    promptWin.once('ready-to-show', () => promptWin.show());
  });
}
