const { contextBridge, ipcRenderer } = require('electron');

// 主进程 -> 画面 的小桥梁：把"现在该播什么动画、朝哪个方向"传给网页
contextBridge.exposeInMainWorld('petAPI', {
  onState: (cb) => ipcRenderer.on('pet-state', (_e, data) => cb(data)),
});
