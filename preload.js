const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediaAPI', {
  preparePlaylist: () => ipcRenderer.invoke('playlist:prepare'),
  fetchNotices: () => ipcRenderer.invoke('notice:fetch'),
  showContextMenu: () => ipcRenderer.invoke('context:menu'),
  getWeatherConfig: () => ipcRenderer.invoke('weather:config'),
  onDownloadProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  },
});

contextBridge.exposeInMainWorld('appInfo', {
  getVersion: () => ipcRenderer.invoke('app:version'),
});

contextBridge.exposeInMainWorld('clinicWS', {
  start: (config) => ipcRenderer.invoke('clinic:ws:start', config),
  stop: () => ipcRenderer.invoke('clinic:ws:stop'),
  onMessage: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('clinic:ws:event', listener);
    return () => ipcRenderer.removeListener('clinic:ws:event', listener);
  },
});
