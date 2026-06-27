const { app, BrowserWindow, screen, Menu } = require('electron');
const path = require('path');

const WIN_SIZE = 160;

let win;
let paused = false;   // 暂停标志：控制走动和动画

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
      if (paused) return;
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
    const [, y] = win.getPosition();
    const startX = win.getPosition()[0];
    const dir = targetX >= startX ? 1 : -1;

    setState('walk', dir > 0 ? 'right' : 'left');

    const timer = setInterval(() => {
      if (paused) return;   // 暂停时原地不动
      const [x] = win.getPosition();
      if (Math.abs(x - targetX) <= SPEED) {
        win.setPosition(Math.round(targetX), y);
        clearInterval(timer);
        resolve();
        return;
      }
      win.setPosition(Math.round(x + dir * SPEED), y);
    }, MOVE_TICK);
  });
}

// ---- 行为循环：待机 -> 随机往左/右走 -> 走回原点 -> 继续待机 ----
async function startBehaviorLoop() {
  const [originX] = win.getPosition();

  // 屏幕可用范围，防止走出屏幕
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const minX = area.x;
  const maxX = area.x + area.width - WIN_SIZE;

  while (true) {
    // 1) 原地待机一会儿
    setState('idle');
    await sleep(rand(3000, 7000));

    // 2) 随机方向 + 随机距离
    const dir = Math.random() < 0.5 ? -1 : 1;
    const dist = rand(120, 280);
    let target = originX + dir * dist;
    target = Math.max(minX, Math.min(maxX, target)); // 夹在屏幕内

    // 3) 走出去
    await walkTo(target);

    // 4) 到了之后停顿一下，再走回原点
    setState('idle');
    await sleep(rand(600, 1200));
    await walkTo(originX);

    // 回到原点，循环顶部会重新进入待机
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
