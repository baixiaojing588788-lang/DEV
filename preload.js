const { contextBridge, ipcRenderer } = require('electron');

// 主进程 -> 画面 的小桥梁
contextBridge.exposeInMainWorld('petAPI', {
  // 现在该播什么动画、朝哪个方向
  onState: (cb) => ipcRenderer.on('pet-state', (_e, data) => cb(data)),
  // 说一句话（显示气泡）
  onSay: (cb) => ipcRenderer.on('pet-say', (_e, text) => cb(text)),
  // Claude Code 状态气泡（{ text, ms }，ms:0 表示常驻）
  onStatus: (cb) => ipcRenderer.on('pet-status', (_e, data) => cb(data)),
  // 播放一次性动画（如 cheer 完成动画）
  onPlay: (cb) => ipcRenderer.on('pet-play', (_e, name) => cb(name)),
  // 暂停 / 继续
  onPause: (cb) => ipcRenderer.on('pet-pause', (_e, p) => cb(p)),

  // 拖动：开始/结束 + 实时位置
  setDragging: (b) => ipcRenderer.send('pet-drag', b),
  moveTo: (x, y) => ipcRenderer.send('pet-move', { x, y }),
  // 双击打开设置
  openSettings: () => ipcRenderer.send('open-settings'),
  // 鼠标悬停状态
  setHover: (b) => ipcRenderer.send('pet-hover', b),
});
