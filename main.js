const { app, BrowserWindow, screen, Menu, ipcMain } = require('electron');
const path = require('path');

const WIN_SIZE = 160;

let win;
let chatWin = null;       // 聊天窗口
let paused = false;       // 暂停标志：控制走动和动画
let dragging = false;     // 正在被鼠标拖动
let homeX = 0;            // "家"的横坐标，走完会回到这里（拖动后会更新）

// 走动/等待需要暂时让路的两种情况
const isFrozen = () => paused || dragging;

function createWindow() {
  win = new BrowserWindow({
    width: WIN_SIZE,
    height: WIN_SIZE,
    transparent: true,      // 背景透明
    frame: false,           // 无标题栏 / 无边框
    alwaysOnTop: true,      // 浮在最上层
    hasShadow: false,       // 透明窗口不要投影
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');

  // 右键弹出 Mac 原生菜单
  win.webContents.on('context-menu', () => showMenu());

  // 鼠标拖动：画面把窗口该到的位置发过来，主进程移动窗口
  ipcMain.on('pet-drag', (_e, isDragging) => {
    dragging = isDragging;
    // 松手后，把放下的位置当作新的"家"，以后就在这附近溜达
    if (!isDragging && win) homeX = win.getPosition()[0];
  });
  ipcMain.on('pet-move', (_e, { x, y }) => {
    if (win) win.setPosition(Math.round(x), Math.round(y));
  });

  // 等画面加载完，再开始自动走动的循环
  win.webContents.on('did-finish-load', () => {
    startBehaviorLoop();
  });
}

// ---- 右键菜单（系统原生样式）----
function showMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: '打招呼',
      click: () => win.webContents.send('pet-say', '你好呀'),
    },
    {
      label: '聊天',
      click: () => openChat(),
    },
    { type: 'separator' },
    {
      label: paused ? '继续' : '暂停',
      click: () => togglePause(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ]);
  menu.popup({ window: win });
}

function togglePause() {
  paused = !paused;
  win.webContents.send('pet-pause', paused); // 通知画面暂停/继续动画
}

// ---- 聊天窗口 ----
function openChat() {
  // 已经开着就聚焦，不重复开
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show();
    chatWin.focus();
    return;
  }
  chatWin = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 300,
    minHeight: 380,
    title: '小鸡毛',
    titleBarStyle: 'hiddenInset',   // Mac 风格：保留红绿灯按钮，标题栏自定义
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'chat-preload.js'),
    },
  });
  chatWin.loadFile('chat.html');
  chatWin.on('closed', () => { chatWin = null; });
}

// 聊天回复（暂时固定；以后这里换成真正的 AI 即可）
ipcMain.handle('chat-message', async (_e, _text) => {
  return '我收到啦';
});

// ---- 告诉画面：现在播什么动画、朝哪边 ----
let lastFacing = 'right';
function setState(anim, facing) {
  if (facing) lastFacing = facing;
  win.webContents.send('pet-state', { anim, facing: lastFacing });
}

// ---- 小工具 ----
// 可暂停的等待：paused 时不倒计时
function sleep(ms) {
  return new Promise((resolve) => {
    let remaining = ms;
    const step = 50;
    const t = setInterval(() => {
      if (isFrozen()) return;
      remaining -= step;
      if (remaining <= 0) {
        clearInterval(t);
        resolve();
      }
    }, step);
  });
}
const rand = (min, max) => min + Math.random() * (max - min);

// 把窗口横向移动到 targetX，边走边播走路动画
function walkTo(targetX) {
  return new Promise((resolve) => {
    const MOVE_TICK = 16;   // 约 60 次/秒
    const SPEED = 2;        // 每次移动 2 像素 -> 约 120 像素/秒
    let lastDir = 0;

    const timer = setInterval(() => {
      if (isFrozen()) return;            // 暂停或被拖动时原地不动
      const [x, y] = win.getPosition();  // 每次读当前位置，尊重拖动
      const dx = targetX - x;
      if (Math.abs(dx) <= SPEED) {
        win.setPosition(Math.round(targetX), y);
        clearInterval(timer);
        resolve();
        return;
      }
      const dir = dx > 0 ? 1 : -1;       // 每步都朝目标方向，拖过头能自己纠正
      if (dir !== lastDir) {             // 方向变了才更新朝向，避免狂发消息
        setState('walk', dir > 0 ? 'right' : 'left');
        lastDir = dir;
      }
      win.setPosition(Math.round(x + dir * SPEED), y);
    }, MOVE_TICK);
  });
}

// ---- 行为循环：待机 -> 随机往左/右走 -> 走回原点 -> 继续待机 ----
async function startBehaviorLoop() {
  homeX = win.getPosition()[0];   // 启动位置就是最初的"家"

  while (true) {
    // 1) 原地待机一会儿
    setState('idle');
    await sleep(rand(3000, 7000));

    // 屏幕可用范围（每轮重新取，拖到别的显示器也适用）
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const minX = area.x;
    const maxX = area.x + area.width - WIN_SIZE;

    // 2) 从"家"出发，随机方向 + 随机距离
    const dir = Math.random() < 0.5 ? -1 : 1;
    const dist = rand(120, 280);
    let target = homeX + dir * dist;
    target = Math.max(minX, Math.min(maxX, target)); // 夹在屏幕内

    // 3) 走出去
    await walkTo(target);

    // 4) 到了之后停顿一下，再走回"家"
    setState('idle');
    await sleep(rand(600, 1200));
    await walkTo(homeX);

    // 回到家，循环顶部会重新进入待机
  }
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
