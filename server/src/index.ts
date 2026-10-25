#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { WebSocketServer, type WebSocket } from "ws";

import { TransportManager } from "./transport/manager.js";
import { listSerialPorts } from "./transport/serial.js";
import { SessionRecorder } from "./session/recorder.js";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "./shared/protocol.js";

const DEFAULT_PORT = 7717;

interface CliOptions {
  port: number;
  openBrowser: boolean;
  record: boolean;
  dev: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { port: DEFAULT_PORT, openBrowser: true, record: true, dev: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") opts.port = Number(argv[++i] ?? DEFAULT_PORT);
    else if (arg === "--no-open") opts.openBrowser = false;
    else if (arg === "--no-record") opts.record = false;
    else if (arg === "--dev") opts.dev = true;
  }
  return opts;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

/** 托管 web/dist 静态资源；防目录穿越 */
function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const wanted = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(root, wanted));
  if (!filePath.startsWith(root + sep) && filePath !== root) {
    res.writeHead(403).end("forbidden");
    return;
  }
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    res.writeHead(404).end("not found");
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const webDist = resolve(fileURLToPath(new URL("../../web/dist", import.meta.url)));
  const hasWeb = existsSync(webDist);

  const recorder = new SessionRecorder(opts.record);
  const httpServer = createServer((req, res) => {
    if (hasWeb) {
      serveStatic(webDist, req, res);
    } else {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("commprobe server is running (dev mode: open the vite dev server URL instead)");
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    const send = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
    send({ t: "hello", version: PROTOCOL_VERSION });
    const manager = new TransportManager(send, recorder);

    ws.on("message", (raw) => {
      void handleClientMessage(manager, raw.toString(), send);
    });
    ws.on("close", () => {
      void manager.closeAll();
    });
  });

  httpServer.listen(opts.port, () => {
    const url = `http://localhost:${opts.port}`;
    console.log(`[CommProbe] server v${PROTOCOL_VERSION} listening on ${url}`);
    if (recorder.file) console.log(`[CommProbe] session recording → ${recorder.file}`);
    if (!hasWeb) {
      console.log(
        "[CommProbe] web/dist 不存在，生产界面未托管；dev 模式请访问 http://localhost:5173",
      );
    } else if (opts.openBrowser && !opts.dev) {
      openBrowser(url);
    }
  });

  const shutdown = () => {
    for (const client of wss.clients) client.terminate();
    recorder.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function handleClientMessage(
  manager: TransportManager,
  raw: string,
  send: (msg: ServerMessage) => void,
): Promise<void> {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    send({ t: "error", message: `消息不是合法 JSON：${raw.slice(0, 80)}` });
    return;
  }
  try {
    if (msg.t === "open") {
      await manager.open(msg.id, msg.kind, msg.params);
    } else if (msg.t === "close") {
      await manager.close(msg.id);
    } else if (msg.t === "send") {
      await manager.send(msg.id, { hex: msg.hex, text: msg.text, encoding: msg.encoding });
    } else if (msg.t === "serial-list") {
      send({ t: "serial-ports", ports: await listSerialPorts() });
    }
  } catch (err) {
    send({ t: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

main().catch((err) => {
  console.error("[CommProbe] fatal:", err);
  process.exit(1);
});
