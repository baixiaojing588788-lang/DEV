const { app, BrowserWindow, screen, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const WIN_SIZE = 160;
const STATUS_PORT = 37123;   // Claude Code hooks 往这个本地端口发状态

let win;
let chatWin = null;       // 聊天窗口
let settingsWin = null;   // 设置窗口
let paused = false;       // 暂停标志：控制走动和动画
let dragging = false;     // 正在被鼠标拖动
let hovering = false;     // 鼠标悬停在身上
let homeX = 0;            // "家"的横坐标，走完会回到这里（拖动后会更新）

// ---- 可切换的宠物主题（帧结构相同，仅素材目录/名字/人设不同）----
const PETS = {
  'little-mao-puppy': {
    id: 'little-mao-puppy',
    name: '小鸡毛',
    dir: 'assets/little-mao-puppy',
    persona: '你是一只可爱的桌面宠物小狗，名叫“小鸡毛”。用简短、亲切、口语化的中文回复，偶尔俏皮一点。',
  },
  'hema': {
    id: 'hema',
    name: 'Hema',
    dir: 'assets/hema-pet',
    persona: '你是一只友好的蓝色河马吉祥物，名叫“Hema”。用简短、亲切、口语化的中文回复，偶尔俏皮一点。',
  },
  'luffy': {
    id: 'luffy',
    name: 'Luffy',
    dir: 'assets/luffy-pet',
    persona: '你是一只戴草帽的橡皮海贼船长 chibi，名叫“Luffy”。性格乐观勇敢、有点傻气，用简短、热血、口语化的中文回复。',
  },
};
function currentTheme() {
  return PETS[loadConfig().theme] || PETS['little-mao-puppy'];
}

// ---- 本地配置（存在应用数据目录，不在项目里，也不会进 Git）----
const DEFAULT_CONFIG = {
  apiKey: '',
  model: 'anthropic/claude-haiku-4.5',
  baseURL: 'https://openrouter.ai/api/v1',
  theme: 'little-mao-puppy',
};
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(partial) {
  const merged = { ...loadConfig(), ...partial };
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2));
  return merged;
}

// 走动/等待需要暂时让路的两种情况
const isFrozen = () => paused || dragging || hovering;

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
  // 鼠标悬停：停下；移开：继续
  ipcMain.on('pet-hover', (_e, isHovering) => { hovering = isHovering; });

  // 等画面加载完，先应用当前主题，再开始自动走动的循环
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('pet-theme', currentTheme());
    startBehaviorLoop();
  });
}

// 切换宠物主题：存配置 + 通知桌宠和聊天窗口
function setTheme(id) {
  if (!PETS[id]) return;
  saveConfig({ theme: id });
  const t = currentTheme();
  if (win && !win.isDestroyed()) win.webContents.send('pet-theme', t);
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat-theme', t);
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
    {
      label: '切换主题',
      submenu: Object.values(PETS).map((p) => ({
        label: p.name,
        type: 'radio',
        checked: p.id === loadConfig().theme,
        click: () => setTheme(p.id),
      })),
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
    backgroundColor: '#f1f0fd',     // 浅色（与渐变背景匹配）
    webPreferences: {
      preload: path.join(__dirname, 'chat-preload.js'),
    },
  });
  chatWin.loadFile('chat.html');
  chatWin.on('closed', () => { chatWin = null; });
}

// ---- 设置窗口 ----
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 380,
    resizable: false,
    title: '设置',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
    },
  });
  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

// 当前主题（桌宠/聊天窗口启动时来问）
ipcMain.handle('theme-get', () => currentTheme());

// 配置读写 + 打开/关闭窗口
ipcMain.handle('config-get', () => loadConfig());
ipcMain.handle('config-save', (_e, partial) => saveConfig(partial));
ipcMain.on('open-settings', () => openSettings());
ipcMain.on('close-settings', () => { if (settingsWin) settingsWin.close(); });

// ---- 聊天：流式请求 OpenRouter，边收边转发给聊天窗口 ----
ipcMain.on('chat-send', async (e, { messages, web }) => {
  const wc = e.sender;
  const cfg = loadConfig();

  if (!cfg.apiKey) {
    wc.send('chat-error', '还没有配置 API Key，请点右键菜单的「设置」先填写。');
    return;
  }

  try {
    const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
        'HTTP-Referer': 'http://localhost',  // OpenRouter 建议带上
        'X-Title': 'little-mao-puppy',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        // OpenRouter 内置联网搜索插件（Exa 驱动）
        ...(web ? { plugins: [{ id: 'web' }] } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      wc.send('chat-error', `请求失败（${res.status}）：${text.slice(0, 300)}`);
      return;
    }

    // 解析 SSE：每行 "data: {...}"，取出 delta.content 转发
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) wc.send('chat-token', delta);
        } catch { /* 忽略心跳/空行 */ }
      }
    }
    wc.send('chat-end');
  } catch (err) {
    wc.send('chat-error', '网络或接口错误：' + err.message);
  }
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

// ---- 感知 Claude Code 状态：本地 HTTP 监听 ----
function handleStatus(s) {
  if (!win || win.isDestroyed()) return;
  if (s === 'working') {
    win.webContents.send('pet-status', { text: '工作中…', ms: 0 });   // ms:0 = 常驻
  } else if (s === 'waiting') {
    win.webContents.send('pet-status', { text: '等你操作', ms: 0 });
  } else if (s === 'done') {
    win.webContents.send('pet-status', { text: '搞定了！', ms: 3000 });
    win.webContents.send('pet-play', 'cheer');                        // 完成小动画
  } else if (s === 'clear') {
    win.webContents.send('pet-status', { text: '', ms: 1 });
  }
}

function startStatusServer() {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      const s = u.searchParams.get('s');
      if (s) handleStatus(s);
    } catch { /* 忽略畸形请求 */ }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  // 只监听本机回环地址，外部访问不到
  server.on('error', (e) => console.error('状态端口启动失败:', e.message));
  server.listen(STATUS_PORT, '127.0.0.1');
}

app.whenReady().then(() => {
  createWindow();
  startStatusServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
