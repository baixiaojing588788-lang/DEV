const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('config-get'),
  save: (cfg) => ipcRenderer.invoke('config-save', cfg),
  close: () => ipcRenderer.send('close-settings'),
});
