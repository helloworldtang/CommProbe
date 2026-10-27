# CommProbe 待办

## v0.2.0 候选：在线版（浏览器串口，零安装）

**定位**：静态站部署（GitHub Pages/Vercel），纯浏览器串口调试版；桌面版（npm 包）继续承担 TCP/UDP。两版定位互补不打架——浏览器能开串口（Web Serial API），但开不了裸 TCP/UDP socket（沙箱）。

**可行性依据**：UI 本就是 Vue SPA，`hex.ts` / `frame-fold.ts` / `checksum.ts` 均为浏览器兼容纯函数，只差把串口 transport 从 `serialport`（Node）换成 `navigator.serial`（浏览器）。Web Serial 支持 baudRate/数据位/停止位/校验位/流控/RTS/DTR，与现有参数面板一一对应（参照 stack-anyway.com、ESP Web Tools 的浏览器刷 ROM 先例）。

**实施要点**：
- [ ] `WebSerialTransport`：对齐现有 `Transport` 接口（open/close/send/onData/onState）
- [ ] 连接面板条件分支：有 `navigator.serial` → 串口可选；无 → 提示换 Chrome/Edge
- [ ] 首次连接走浏览器串口选择器（授权后 `getPorts()` 记住，无端口枚举权限）
- [ ] GBK 发送：浏览器只能 UTF-8 编码，GBK 发送需自带编码表（~100KB）或 v1 仅 UTF-8（GBK 接收用 `TextDecoder('gbk')` 没问题）
- [ ] 部署：静态托管 + CI（复用现有 release 流水线思路）
- [ ] 传播点：「零安装的浏览器串口调试」

**先决验证**：本机 USB 转串口设备实测 Web Serial 收发链路（一个静态 demo 页），通了再定 v0.2.0 范围。

## 已知小项（v0.1.5 记录）

- [ ] TCP 服务端多客户端时无法指定下发（当前广播 only）——目标胶囊已显示「客户端 N，广播」
- [ ] 侧边停靠 480px 宽度下「常用」行 8 控件偏挤，可改两行卡片式
- [ ] 自绘 AppSelect 无键盘导航（上下键选菜单）
- [ ] 校验计算器同时显示数值序与线上序（Modbus 低字节在前）
