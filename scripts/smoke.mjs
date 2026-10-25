/**
 * 端到端冒烟：启动内核 → WS 开 tcp-server → 用原生 net 模拟下位机连入 →
 * 背靠背发两段字节 → 校验空闲切帧后收到两帧 + echo 回测发送路径。
 */
import net from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 7798;

const server = spawn(
  "node",
  ["dist/index.js", "--port", String(PORT), "--no-open", "--no-record"],
  {
    cwd: new URL("..", import.meta.url).pathname + "server",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (d) => process.stdout.write(`[srv] ${d}`));
server.stderr.on("data", (d) => process.stderr.write(`[srv!] ${d}`));

await sleep(600);

const { WebSocket } = await import("ws");
const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
const frames = [];
const statuses = [];
ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.t === "frame") frames.push(msg);
  if (msg.t === "status") statuses.push(msg);
});

function send(obj) {
  ws.send(JSON.stringify(obj));
}

await new Promise((r) => ws.on("open", r));

// 1. 开 TCP 服务端（空闲 100ms 切帧）
send({ t: "open", id: "srv1", kind: "tcp-server", params: { port: PORT + 1, idleMs: 100 } });
await sleep(300);

// 2. 模拟下位机连入，背靠背发两段（中间故意停 250ms > idleMs）
const device = net.connect(PORT + 1, "127.0.0.1");
await new Promise((r) => device.on("connect", r));
device.write(Buffer.from([0x01, 0x03, 0x00, 0x00]));
await sleep(250);
device.write(Buffer.from([0x40, 0x41, 0x42, 0x43]));
await sleep(400);

// 3. 走 commprobe 下行：向已连客户端广播发送
send({ t: "send", id: "srv1", hex: "AA BB CC DD" });
await sleep(300);

// 校验
const inFrames = frames.filter((f) => f.dir === "in");
const outFrames = frames.filter((f) => f.dir === "out");
const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg, JSON.stringify({ frames, statuses }, null, 2));
    process.exit(1);
  }
  console.log("PASS:", msg);
};

assert(inFrames.length === 2, `空闲切帧成 2 帧（实际 ${inFrames.length}）`);
assert(inFrames[0].hex === "01 03 00 00", "第一帧内容正确");
assert(inFrames[1].hex === "40 41 42 43", "第二帧内容正确");
assert(inFrames[0].peer && inFrames[0].peer.includes("127.0.0.1"), "peer 标记了来源");
assert(outFrames.length === 1 && outFrames[0].hex === "AA BB CC DD", "下行发送 1 帧正确");

// 下位机侧应收到广播
const deviceGot = [];
device.on("data", (c) => deviceGot.push(...c));
await sleep(200);
assert(
  deviceGot.join() === [0xaa, 0xbb, 0xcc, 0xdd].join(),
  "模拟下位机收到下行广播字节",
);

ws.close();
device.destroy();
server.kill();
console.log("\nSMOKE OK");
process.exit(0);
