const { contextBridge, ipcRenderer } = require('electron');

// 聊天窗口的小桥梁：把消息发给主进程，等回复
contextBridge.exposeInMainWorld('chatAPI', {
  send: (text) => ipcRenderer.invoke('chat-message', text),
});
