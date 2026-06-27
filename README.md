# 小鸡毛 · Little Mao Puppy 🐶

一只悬浮在 macOS 桌面上的像素风桌面宠物。它会自己溜达、能拖动、能聊天（接入真实 AI），还能感知你在 VS Code 里用 Claude Code 的工作状态。

<p>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white">
  <img alt="Platform" src="https://img.shields.io/badge/Platform-macOS-000000?logo=apple&logoColor=white">
  <img alt="AI" src="https://img.shields.io/badge/AI-OpenRouter-7C3AED">
</p>

## 简介

这是一个基于 Electron 的桌面宠物应用：一个透明、无边框、永远置顶的小窗口，里面播放逐帧动画的小狗。它在桌面上自动闲逛、待机，可以用鼠标拖到任何位置；右键有原生菜单，双击可打开设置；通过 OpenRouter 接入真实大模型，支持流式打字机回复和联网搜索；并能通过 Claude Code 的 hooks 机制实时显示「工作中 / 等你操作 / 搞定了」的状态气泡。

## 功能特性

- 🪟 **透明悬浮窗** — 无边框、背景透明、永远置顶，像素图保持锐利不模糊
- 🚶 **自主行为** — 大部分时间原地待机，隔一会儿随机往左右溜达一段再走回「家」
- 🖱️ **拖动 & 安家** — 左键拖到任意位置，松手后该处即成为新的活动中心
- ✋ **悬停暂停** — 鼠标移到身上它就停下，移开继续行动
- 🍎 **原生右键菜单** — 打招呼、聊天、暂停/继续、退出（macOS 系统样式）
- 💬 **AI 聊天** — iMessage 风格深色聊天窗口，流式「打字机」逐字回复
- 🌐 **联网搜索** — 一键开关，让 AI 带着实时信息回答（OpenRouter Web 插件）
- ⚙️ **本地配置** — 双击桌宠打开设置，API Key / 模型 / 接口地址存在本地，不写死、不入库
- 🤖 **感知 Claude Code** — 通过 hooks 实时显示工作状态，完成时播放欢呼动画

## 技术栈

| 模块 | 选型 |
|------|------|
| 桌面框架 | [Electron](https://www.electronjs.org/) 33 |
| 运行时 | Node.js（建议 18+） |
| 界面 | 原生 HTML / CSS / JavaScript（无前端框架） |
| 动画 | 逐帧 PNG 精灵图（idle / walk / cheer） |
| AI 网关 | [OpenRouter](https://openrouter.ai/)（OpenAI 兼容接口，流式 SSE） |
| 状态联动 | 本地 HTTP 端口 + Claude Code hooks |

进程间通过 Electron 的 `ipcMain` / `ipcRenderer` 通信，每个窗口配有独立的 `preload` 桥接脚本，遵循上下文隔离，API Key 仅停留在主进程。

## 安装与运行

需要本机已安装 Node.js 与 npm。

```bash
# 1. 克隆
git clone git@github.com:baixiaojing588788-lang/DEV.git
cd DEV

# 2. 安装依赖（会下载 Electron 二进制）
npm install

# 3. 启动
npm start
```

> **macOS 提示**：如果你从 VS Code、Cursor 等基于 Electron 的应用内置终端启动，可能会继承到 `ELECTRON_RUN_AS_NODE=1`，导致窗口起不来。启动前清掉它即可：
> ```bash
> unset ELECTRON_RUN_AS_NODE && npm start
> ```

启动后小狗出现在桌面，**右键**呼出菜单，**双击**打开设置填入 API Key 即可聊天。

## 配置

### AI 配置（聊天功能）

双击桌宠打开「设置」面板填写，保存在本地，**不会上传、不会进入 Git**：

存储位置：`~/Library/Application Support/little-mao-puppy/config.json`

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `apiKey` | OpenRouter API Key（`sk-or-...`） | 空（必填） |
| `model` | 模型名称 | `anthropic/claude-haiku-4.5` |
| `baseURL` | 接口地址 | `https://openrouter.ai/api/v1` |

> 模型可改为 `anthropic/claude-sonnet-4.6`、`anthropic/claude-opus-4.8` 等任意 OpenRouter 支持的模型。联网搜索按搜索结果额外计费，可在聊天框用 🌐 按钮开关。

### 接入 Claude Code 状态感知（可选）

应用启动后会在 `127.0.0.1:37123` 监听状态信号。在 Claude Code 的 `settings.json` 中添加以下 hooks，桌宠即可感知工作状态：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "curl -s --max-time 1 'http://127.0.0.1:37123/?s=working' >/dev/null 2>&1 || true" } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "curl -s --max-time 1 'http://127.0.0.1:37123/?s=waiting' >/dev/null 2>&1 || true" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "curl -s --max-time 1 'http://127.0.0.1:37123/?s=done' >/dev/null 2>&1 || true" } ] }
    ]
  }
}
```

状态信号：`working`（工作中）、`waiting`（等你操作）、`done`（搞定了，播放欢呼动画）。命令带 `--max-time` 与 `|| true`，桌宠未运行时也不会阻塞或报错。

## 项目结构

```
.
├── main.js              # 主进程：窗口管理、行为循环、右键菜单、
│                        #         OpenRouter 流式请求、状态 HTTP 服务
├── index.html           # 桌宠窗口：逐帧动画、拖动、悬停、双击
├── preload.js           # 桌宠窗口的 IPC 桥接
├── chat.html            # 聊天窗口：iMessage 风格深色 UI、打字机、联网开关
├── chat-preload.js      # 聊天窗口的 IPC 桥接
├── settings.html        # 设置面板：API Key / 模型 / 接口地址
├── settings-preload.js  # 设置面板的 IPC 桥接
├── assets/
│   └── little-mao-puppy/
│       ├── frames/      # 逐帧精灵图：walk / scratch / cheer / roll / wave / expressions
│       ├── spritesheet.webp
│       └── pet.json
└── package.json
```

## 致谢

桌宠美术素材：Little Mao Puppy（小鸡毛），by Hao Y.
