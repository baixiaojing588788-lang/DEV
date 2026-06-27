const { contextBridge, ipcRenderer } = require('electron');

// 聊天窗口的小桥梁
contextBridge.exposeInMainWorld('chatAPI', {
  // 把对话历史 + 选项（如联网）发给主进程，主进程流式返回
  send: (payload) => ipcRenderer.send('chat-send', payload),
  onToken: (cb) => ipcRenderer.on('chat-token', (_e, t) => cb(t)),
  onEnd: (cb) => ipcRenderer.on('chat-end', () => cb()),
  onError: (cb) => ipcRenderer.on('chat-error', (_e, m) => cb(m)),
  // 打开设置窗口
  openSettings: () => ipcRenderer.send('open-settings'),
  // 当前主题 + 主题切换
  getTheme: () => ipcRenderer.invoke('theme-get'),
  onTheme: (cb) => ipcRenderer.on('chat-theme', (_e, t) => cb(t)),
});
