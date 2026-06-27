const { contextBridge, ipcRenderer } = require('electron');

// 聊天窗口的小桥梁
contextBridge.exposeInMainWorld('chatAPI', {
  // 把整段对话历史发给主进程，主进程流式返回
  send: (messages) => ipcRenderer.send('chat-send', messages),
  onToken: (cb) => ipcRenderer.on('chat-token', (_e, t) => cb(t)),
  onEnd: (cb) => ipcRenderer.on('chat-end', () => cb()),
  onError: (cb) => ipcRenderer.on('chat-error', (_e, m) => cb(m)),
  // 打开设置窗口
  openSettings: () => ipcRenderer.send('open-settings'),
});
