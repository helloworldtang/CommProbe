<div align="center">

<img src="https://raw.githubusercontent.com/helloworldtang/CommProbe/main/web/public/logo.svg" width="340" alt="CommProbe" />

跨平台 TCP / UDP / 串口联调工具 · Web 界面 · 一条命令启动，浏览器即用

对标 SSCOM 网络调试助手，macOS / Windows / Linux 同一套代码

</div>

## 功能（v0.1）

- **连接**：TCP Client / TCP Server / UDP / 串口（波特率、数据位、停止位、校验位、流控）
- **收发**：HEX / ASCII 双显，UTF-8 / GBK 编码切换，时间戳 + 方向着色
- **按帧显示**：空闲 ≥N ms 自动分组（可配），告别字节瀑布
- **帧过滤**：关键字过滤（hex 片段或文本）、方向筛选、**重复帧窗口折叠**——心跳等高频有规律的消息按时间窗口聚合为一行（×N + 首末时间），间隔超窗自动分段，心跳中断/恢复时刻直接可见
- **发送**：多条预存、单发 / 定时循环 / 序列发送（帧间间隔可配）
- **校验计算器**：CRC16-Modbus / CRC16-CCITT-FALSE / CRC16-XMODEM / SUM8 / XOR8
- **会话录制**：整场联调收发落 JSONL，便于事后分析与复现

## 安装（新电脑从 0 到 1）

两条路线，先选一条：

|          | 路线 A：npm 安装          | 路线 B：便携版                       |
| -------- | ------------------------- | ------------------------------------ |
| 适合谁   | 日常用终端的人            | 不想装任何环境的同学（如硬件工程师） |
| 前置条件 | Node.js ≥ 20              | **零依赖**，什么都不装               |
| 怎么升级 | `npm update -g commprobe` | 下载新版 zip 覆盖解压                |

### 路线 A：npm 安装（4 步）

**第 1 步：安装 Node.js ≥ 20（LTS）**

到 <https://nodejs.org> 下载 **LTS 版**安装包（20 或更高都行；低于 20 会在安装串口模块时被 npm 拒绝）。装完验证：

```bash
node -v    # 输出 v20.x / v22.x / v24.x 即 OK
```

**第 2 步：确认 npm 源可用**

```bash
npm i -g nrm                 # 装 NPM 源管理器
nrm use taobao               # 国内镜像；海外网络用 nrm use npm
npm view serialport version  # 能输出版本号 = 源 OK
```

**第 3 步：安装 CommProbe**

```bash
npm i -g commprobe
```

> 安装时若提示 `@serialport/bindings-cpp` 的 install script 未放行：**可安全忽略**，串口功能不受影响（原因见下方"依赖管理"）。

**第 4 步：启动**

```bash
commprobe    # 注意命令是 commprobe；浏览器自动打开 http://localhost:7717
```

> 下次使用：再运行一次 `commprobe` 即可，无需重装。

### 路线 B：便携版（双击即用，类似 MySQL 的 zip 版）

免装 Node、免装任何依赖，解压即用：

1. 打开 [Releases](https://github.com/helloworldtang/CommProbe/releases)，按平台下载：
   - Windows：`commprobe-vX.Y.Z-win-x64.zip`
   - macOS（Apple Silicon）：`commprobe-vX.Y.Z-mac-arm64.zip`
2. 解压到任意目录
3. 双击 `start-windows.bat`（Windows）或 `start-mac.command`（macOS）
4. 浏览器自动打开界面；关闭启动窗口即退出

> 下次使用：再双击一次启动器即可，解压目录不要删。

Windows 首次运行的防火墙弹窗请选择允许；macOS 首次若提示"无法验证的开发者"：右键文件 → 打开（仅需一次）。更多细节见包内《使用说明.txt》。

## 开发（源码运行）

```bash
# 锁定具体 tag，不要引用滚动的 main 分支（main 会随演进引入未经审阅的变更）
git clone --branch v0.1.2 --depth 1 https://github.com/helloworldtang/CommProbe.git
cd CommProbe && npm install && npm run build && npm start
```

开发模式（前后端热更新）：`npm run dev`（server :7717 + web :5173，浏览器访问 http://localhost:5173）。

质量门：`npm run lint` / `npm run typecheck` / `npm run test` / `npm run format`。

## 依赖管理（原理与内网环境）

- **Node 版本兼容性**：内核只使用带 `node:` 前缀的稳定核心模块；串口原生模块基于 N-API 稳定 ABI，
  且其安装包内已内置全平台预编译二进制（含 win32-x64 / darwin / linux），Node 发布新的大版本**不需要重新编译**，正常升级不会报错；最低版本 20 由串口模块 serialport 要求。
- **install script 提示为何可忽略**：npm 11 拦截的只是 `@serialport/bindings-cpp` 的安装期校验脚本，
  其预编译二进制内置于包内、运行时自选加载，不依赖该脚本（已实测）。介意提示可执行一次
  `npm config set allow-scripts=@serialport/bindings-cpp --location=user`。
- **registry 要求**：npm 公共仓库（`registry.npmjs.org`）或其镜像（如 `registry.npmmirror.com`）均可，
  二者都包含本工具的全部依赖。内网使用私有 Nexus 时，将 registry 指向包含 npmjs 代理的 group，
  配置写入项目根目录 `.npmrc`（模板见 `.npmrc.example`）。

## 项目结构

```
CommProbe/
├─ server/            # Node/TS 内核：传输 + 拆帧 + 校验 + 会话录制 + WS 服务
│  └─ src/
│     ├─ shared/      # 与前端共享的纯函数：协议消息、hex/文本编码、校验算法、帧折叠
│     ├─ transport/   # 统一 Transport 接口：tcp-client / tcp-server / udp / serial
│     ├─ framing/     # 空闲切帧（idle-gap grouper）
│     ├─ session/     # 会话录制（JSONL）
│     └─ index.ts     # HTTP + WebSocket 入口，托管 web/dist
└─ web/               # Vue3 + Vite 前端
```

## 串口模块说明

串口依赖 `serialport`（原生模块，放在 `optionalDependencies`，安装失败不影响 TCP/UDP 功能）。
连接串口时才动态加载；加载失败时界面会提示，TCP/UDP 继续可用。

## 发版流程（维护者）

推送 `v*.*.*` tag 即自动完成全部发版（GitHub Actions，见 `.github/workflows/release.yml`）：

质量门 → 构建 → `npm publish`（OIDC trusted publishing，免 token；版本已发布则自动跳过）
→ 打 win/mac 便携双包 → 创建 GitHub Release 并附上 zip。

```bash
# 例：发 0.2.0
# 1. 同步更新版本号：三个 package.json 与 server/src/shared/protocol.ts
# 2. 提交并打 tag
git commit -am "v0.2.0: ..." && git tag v0.2.0 && git push --follow-tags
```
