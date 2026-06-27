const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 160,
    height: 160,
    transparent: true,      // 背景透明
    frame: false,           // 无标题栏 / 无边框
    alwaysOnTop: true,      // 浮在最上层
    hasShadow: false,       // 透明窗口不要投影
    resizable: false,
    skipTaskbar: true,      // 不在 Dock 之外占位
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
