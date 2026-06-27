const { contextBridge, ipcRenderer } = require('electron');

// 主进程 -> 画面 的小桥梁
contextBridge.exposeInMainWorld('petAPI', {
  // 现在该播什么动画、朝哪个方向
  onState: (cb) => ipcRenderer.on('pet-state', (_e, data) => cb(data)),
  // 说一句话（显示气泡）
  onSay: (cb) => ipcRenderer.on('pet-say', (_e, text) => cb(text)),
  // 暂停 / 继续
  onPause: (cb) => ipcRenderer.on('pet-pause', (_e, p) => cb(p)),
});
