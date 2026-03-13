'use strict';

const { BrowserWindow, ipcMain } = require('electron');
const state = require('./state');

async function promptInput({ title, label, placeholder = '', value = '', password = false }) {
  return new Promise((resolve) => {
    const promptWin = new BrowserWindow({
      width: 460,
      height: 220,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      modal: true,
      parent: state.mainWindow || undefined,
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
      height: 230,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      modal: true,
      parent: state.mainWindow || undefined,
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

async function promptAdminMenu() {
  return new Promise((resolve) => {
    const promptWin = new BrowserWindow({
      width: 460,
      height: 255,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      modal: true,
      parent: state.mainWindow || undefined,
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
        h1 { margin: 0 0 14px 0; font-size: 18px; }
        .menu { display: flex; flex-direction: column; gap: 8px; }
        button { padding: 13px 16px; border: none; border-radius: 10px; font-size: 15px; cursor: pointer; text-align: left; }
        button:hover { filter: brightness(0.95); }
        .menu-btn { background: #4d7cff; color: #fff; }
        .secondary { background: #e6e8ef; color: #333; margin-top: 4px; }
      </style>
      </head>
      <body>
        <div class="card">
          <h1>관리자 메뉴</h1>
          <div class="menu">
            <button class="menu-btn" id="serial">시리얼번호 수정</button>
            <button class="menu-btn" id="devtools">개발자 도구 열기</button>
            <button class="secondary" id="cancel">닫기</button>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          document.getElementById('serial').addEventListener('click', () => ipcRenderer.send('prompt:admin-menu:response', 'serial'));
          document.getElementById('devtools').addEventListener('click', () => ipcRenderer.send('prompt:admin-menu:response', 'devtools'));
          document.getElementById('cancel').addEventListener('click', () => ipcRenderer.send('prompt:admin-menu:response', null));
          window.addEventListener('keydown', (e) => { if (e.key === 'Escape') ipcRenderer.send('prompt:admin-menu:response', null); });
        </script>
      </body></html>
    `;

    ipcMain.once('prompt:admin-menu:response', (_e, val) => {
      try { promptWin.close(); } catch {}
      resolve(val || null);
    });
    promptWin.on('closed', () => resolve(null));
    promptWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    promptWin.once('ready-to-show', () => promptWin.show());
  });
}

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
      parent: state.mainWindow || undefined,
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

module.exports = {
  promptInput,
  promptAdminSettings,
  promptAdminMenu,
  promptError,
};
