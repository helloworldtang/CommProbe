# CommProbe

面向研发人员的跨平台联调工具：TCP / UDP / 串口，Web 界面，一条命令启动，浏览器即用。
功能与场景对标 SSCOM 网络调试助手，可在 macOS / Windows / Linux 上运行同一套代码。

## 功能（v0.1）

- **连接**：TCP Client / TCP Server / UDP / 串口（波特率、数据位、停止位、校验位、流控）
- **收发**：HEX / ASCII 双显，UTF-8 / GBK 编码切换，时间戳 + 方向着色
- **按帧显示**：空闲 ≥N ms 自动分组（可配），告别字节瀑布
- **帧过滤**：关键字过滤（hex 片段或文本）、方向筛选、**重复帧窗口折叠**——心跳等高频有规律的消息按时间窗口聚合为一行（×N + 首末时间），间隔超窗自动分段，心跳中断/恢复时刻直接可见
- **发送**：多条预存、单发 / 定时循环 / 序列发送（帧间间隔可配）
- **校验计算器**：CRC16-Modbus / CRC16-CCITT-FALSE / CRC16-XMODEM / SUM8 / XOR8
- **会话录制**：整场联调收发落 JSONL，便于事后分析与复现

## 安装

三种方式，各取所需：

**终端用户（npm，最简）**：

```bash
npm i -g commprobe   # 或免安装直接 npx commprobe
commprobe            # 浏览器自动打开（需 Node ≥ 20）
```

**联调用户（免装 Node，双击即用）**：到 [Releases](https://github.com/helloworldtang/commprobe/releases) 下载对应平台的便携包
（`commprobe-vX.Y.Z-win-x64.zip` / `commprobe-vX.Y.Z-mac-arm64.zip`），解压后双击启动器即用，详见包内《使用说明.txt》。

**研发（源码运行）**：

```bash
# 锁定具体 tag，不要引用滚动的 main 分支（main 会随演进引入未经审阅的变更）
git clone --branch v0.1.1 --depth 1 https://github.com/helloworldtang/commprobe.git
cd commprobe && npm install && npm run build && npm start
```

## 快速开始

```bash
npm install
npm run build
npm start          # 启动服务并自动打开浏览器（默认 http://localhost:7717）
```

开发模式（前后端热更新）：

```bash
npm run dev        # server :7717 + web :5173，浏览器访问 http://localhost:5173
```

## 双击运行（免装 Node）

面向不做前端开发的同事（如硬件工程师）：

```bash
npm run pack                             # 打当前平台便携包
node scripts/pack.mjs --target win-x64   # 交叉打 Windows 包
```

产出 `dist-portable/commprobe-v<版本>-<平台>.zip`（约 33 MB，已内嵌 Node 运行时与全部依赖）。
解压后**双击 `start-windows.bat` / `start-mac.command`**，浏览器自动打开界面，关闭启动窗口即退出。
Windows 首次运行的防火墙弹窗请选择允许。打包机需要 macOS / Linux（用到 zip / unzip / tar）。

## 依赖管理

- 运行与开发需要 **Node.js ≥ 20（LTS）**（[下载](https://nodejs.org/)）——这是串口模块 serialport 的最低版本要求。
- **版本兼容性**：内核只使用带 `node:` 前缀的稳定核心模块；串口原生模块基于 N-API 稳定 ABI，
  且其安装包内已内置全平台预编译二进制（含 win32-x64 / darwin / linux），Node 发布新的大版本**不需要重新编译**，正常升级不会报错。
- 安装依赖需要能访问 **npm 公共仓库**（`registry.npmjs.org`）**或其镜像**（如 `registry.npmmirror.com`）。
  串口支持依赖平台二进制包 `@serialport/*`，以上 registry 均已包含。
- 推荐使用 [nrm](https://github.com/Pana/nrm)（NPM 源管理器）管理 registry：

```bash
npm i -g nrm       # 安装 nrm
nrm ls             # 查看可用源
nrm use taobao     # 切换到国内镜像（或 nrm use npm 切回官方源）
nrm test           # 检测各源延迟
```

- 安装前 check 当前源是否可用：

```bash
npm config get registry                # 确认当前源
npm view serialport version            # 能输出版本号 = 源可用
```

- 内网环境使用私有 Nexus 时，将 registry 指向包含 npmjs 代理的 group，配置写入项目根目录 `.npmrc`（模板见 `.npmrc.example`）。

## 项目结构

```
commprobe/
├─ server/            # Node/TS 内核：传输 + 拆帧 + 校验 + 会话录制 + WS 服务
│  └─ src/
│     ├─ shared/      # 与前端共享的纯函数：协议消息、hex/文本编码、校验算法
│     ├─ transport/   # 统一 Transport 接口：tcp-client / tcp-server / udp / serial
│     ├─ framing/     # 空闲切帧（idle-gap grouper）
│     ├─ session/     # 会话录制（JSONL）
│     └─ index.ts     # HTTP + WebSocket 入口，托管 web/dist
└─ web/               # Vue3 + Vite 前端
```

## 串口模块说明

串口依赖 `serialport`（原生模块，放在 `optionalDependencies`，安装失败不影响 TCP/UDP 功能）。
连接串口时才动态加载；加载失败时界面会提示，TCP/UDP 继续可用。

## 开发

```bash
npm run lint        # ESLint（server 侧 TS）
npm run typecheck   # server + web 类型检查
npm run test        # 共享模块单元测试（校验/编码/协议）
npm run format      # Prettier 格式化
```

## 发版流程（维护者）

推送 `v*.*.*` tag 即自动完成全部发版（GitHub Actions，见 `.github/workflows/release.yml`）：

质量门 → 构建 → `npm publish`（版本已发布则自动跳过）→ 打 win/mac 便携双包 → 创建 GitHub Release 并附上 zip。

npm 发布优先走 OIDC trusted publishing（免 token；需在 npmjs.com 的包设置里把本仓库的
`release.yml` 工作流注册为 Trusted Publisher，一次性配置）。若配置了 `NPM_TOKEN` secret 则自动改用它。

```bash
# 例：发 0.2.0
# 1. 同步更新版本号：三个 package.json 与 server/src/shared/protocol.ts
# 2. 提交并打 tag
git commit -am "v0.2.0: ..." && git tag v0.2.0 && git push --follow-tags
```
