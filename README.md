# 🚀 DouBao-Codex-input：豆包深度接入 OpenAI Codex 桌面端与电脑自动化操控 Agent

<p align="center">
  <img src="https://img.shields.io/badge/Codex-Responses_API_2026-blue?style=for-the-badge&logo=openai" alt="Codex">
  <img src="https://img.shields.io/badge/Doubao-ByteDance_AI-orange?style=for-the-badge" alt="Doubao">
  <img src="https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Computer_Control-Agent_Ready-purple?style=for-the-badge" alt="Agent">
  <img src="https://img.shields.io/badge/License-MIT-brightgreen?style=for-the-badge" alt="License">
</p>

> **国内免翻墙、免官方 API Key、零成本！**  
> 将**字节跳动豆包网页版（doubao.com）**的高性能大模型能力无缝对接到 **OpenAI Codex Desktop 桌面端**及各大 AI 客户端。不仅支持常规问答与编程，还内置 **Computer Control Agent（本地电脑操控引擎）**，支持直接在桌面自动排版创建 Word 文档、生成代码文件与执行命令！

---

## ✨ 核心特性

- 🎯 **完美适配 OpenAI Codex 桌面端**：原生兼容 Codex 最新 Responses API 协议规范，告别中断与重新连接。
- 💻 **本地电脑操控 Agent (Computer Control)**：
  - **Word 自动排版与生成**：对讲出“在桌面创建word文档”等需求，自动使用 `docx` 引擎生成带居中标题、中文首行缩进（`　　`）、标准行距与微软雅黑排版的 `.docx` 文件。
  - **代码与文本落地**：自动识别代码块并在指定目录（如桌面）生成 `.py`、`.js`、`.html`、`.txt` 等文件。
  - **终端命令执行**：自动调用本地系统终端执行并回显结果。
- 🛡️ **无感签名与风控绕过**：基于 Playwright 持久化浏览器上下文，完整继承 ByteDance 真实设备指纹、`msToken` 与 `X-Bogus` 签名。
- 🔑 **一次登录，永久免登**：仅需在首次启动时扫码登录一次，会话与 Cookie 自动持久化保存在本地。
- ⚡ **零额外下载**：自动复用您电脑自带的 Google Chrome 或 Microsoft Edge 浏览器。

---

## 🛠️ 极简 3 步快速上手教程（人人都能用）

### 第一步：安装依赖

确保您的电脑已安装 [Node.js](https://nodejs.org/) (推荐 LTS v18 或更高版本)。  
克隆本项目到本地，在项目文件夹中打开终端运行：

```bash
npm install
```

---

### 第二步：一次性扫码登录豆包（仅需首次操作）

运行以下命令，会自动打开一个真实的浏览器窗口：

```bash
npm run login
```

在弹出的窗口中登录您的豆包账号（支持**微信扫码、手机验证码、抖音登录**等）。  
登录成功后，终端将提示已成功保存登录凭据并自动退出。后续所有启动均会自动免密登录。

---

### 第三步：一键配置 Codex 并启动服务

#### 1. 自动配置 Codex 客户端
运行一键配置脚本，自动将配置写入 Codex 的全局配置文件（`~/.codex/config.toml`）：

```bash
node update-codex-config.js
```

> **手动配置参考**（如果你想手动修改 `~/.codex/config.toml`）：
> ```toml
> model = "gpt-5.6-terra"
> model_provider = "doubao"
> 
> [model_providers.doubao]
> name = "Doubao Proxy"
> base_url = "http://127.0.0.1:8000/v1"
> env_key = "DOUBAO_API_KEY"
> wire_api = "responses"
> ```

#### 2. 启动本地代理服务

```bash
npm run dev
```

看到控制台输出 `[Server] Doubao API proxy listening on http://127.0.0.1:8000` 即表示启动成功！

---

### 第四步：打开 Codex 尽情使用！

1. 打开电脑上的 **Codex Desktop** 桌面应用。
2. 点击左侧侧边栏顶部的 **“+ 新对话”**。
3. 直接输入任意指令，豆包将如同官方 API 一样极速打字响应！

---

## 🎯 电脑自动化实测场景展示

### 场景 1：在电脑桌面自动撰写并排版 Word 文档

在 Codex 桌面端中输入：
> *“在我桌面创建一个新的word，里面写一篇散文小说，模仿鲁迅，季节在秋天”*

**效果**：
1. Codex 实时流式打字输出名为《秋晚》的深度鲁迅风散文正文；
2. 豆包绝不说“我无法操作电脑”；
3. 本地引擎自动在桌面上生成 [`秋夜_鲁迅风格散文.docx`](file:///C:/Users/JunJia/Desktop)，排版精美（标题居中、首行中文两字符缩进、微软雅黑），双击 Word / WPS 即可直接阅读！
4. Codex 界面追加绿色执行报告：
   ```text
   ---
   ✅ 【自动化系统执行报告】
   文件已成功在您的电脑桌面创建完毕！
   - 文件路径：C:\Users\<你的用户名>\Desktop\秋夜_鲁迅风格散文.docx
   - 文件类型：Microsoft Word 文档 (.docx)
   - 排版状态：已应用标题居中与正文首行缩进排版。
   ```

---

### 场景 2：在桌面生成代码文件

在 Codex 桌面端中输入：
> *“在桌面创建一个 python 脚本叫 system_info.py，打印当前电脑的 CPU 与内存信息”*

**效果**：
Codex 自动生成完整 Python 代码，本地 Agent 引擎自动提取代码并落盘到桌面 `system_info.py`。

---

## ⚙️ 环境变量说明 (`.env`)

项目根目录的 `.env` 可根据个人需求进行微调（已有 `.env.example` 供参考）：

```ini
# 服务端口与绑定地址
PORT=8000
HOST=0.0.0.0

# 客户端认证密钥（设为 any 时接受任意 Key）
API_KEY=any

# 浏览器设置
# HEADLESS: true 为无头后台运行；调试排查问题可设为 false 显示浏览器界面
HEADLESS=true
# 浏览器通道: 'chrome' 或 'msedge'
BROWSER_CHANNEL=chrome
# 用户登录凭据持久化保存目录（已加入 .gitignore，不会泄露隐私）
USER_DATA_DIR=./.doubao_user_data

# 默认模型
DEFAULT_MODEL=doubao-pro
```

---

## 🔌 兼容其他第三方 AI 客户端

除了 Codex Desktop，本项目还兼容所有支持自定义 OpenAI 接口地址的工具：

| 客户端 | API 地址 (Base URL) | API Key | 模型名称 |
|---|---|---|---|
| **NextChat** | `http://127.0.0.1:8000` | 任意字符串 (如 `any`) | `doubao-pro`, `doubao-think` |
| **Chatbox** | `http://127.0.0.1:8000` | 任意字符串 (如 `any`) | `doubao-pro`, `doubao-think` |
| **Cherry Studio** | `http://127.0.0.1:8000/v1` | 任意字符串 (如 `any`) | 自动拉取模型列表 |
| **Cursor / VSCode** | `http://127.0.0.1:8000/v1` | 任意字符串 (如 `any`) | `gpt-5.6-terra` 或 `doubao-pro` |

---

## ❓ 常见问题 FAQ

**Q1：Codex 提示“正在重新连接 1/5 或 3/5”？**  
- 请确认 `npm run dev` 终端是否正在运行；
- 请检查 `~/.codex/config.toml` 中是否配置了 `wire_api = "responses"`；
- 请彻底退出 Codex（右键系统右下角托盘完全退出）后重新打开。

**Q2：我的账号登录凭证安全吗？**  
- 登录数据仅保存在您本地电脑的 `.doubao_user_data` 文件夹内，项目 `.gitignore` 已严格排除此目录，绝对不会被上传到 Git 或任何第三方服务器。

**Q3：我想查看浏览器是怎么自动操作的？**  
- 将 `.env` 中的 `HEADLESS=true` 改为 `HEADLESS=false`，启动后即可亲眼看到浏览器是如何自动打字和响应的。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。仅供个人技术学习交流与逆向工程研究，请遵守相关服务条款。
