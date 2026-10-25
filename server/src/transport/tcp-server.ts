import net from "node:net";

import type { TcpServerParams } from "../shared/protocol.js";
import type { Transport, TransportEvents } from "./types.js";

/**
 * TCP 服务端：监听端口，允许多客户端同时连入。
 * 下行 send 为广播语义（写给所有已连入客户端），无客户端时抛错。
 */
export class TcpServerTransport implements Transport {
  readonly kind = "tcp-server" as const;

  private server?: net.Server;
  private readonly sockets = new Set<net.Socket>();

  constructor(
    readonly id: string,
    private readonly params: TcpServerParams,
    private readonly events: TransportEvents,
  ) {}

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer((socket) => {
        const peer = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`;
        this.sockets.add(socket);
        this.events.onState("open", `:${this.params.port} 客户端 ${this.sockets.size} 个`);
        socket.on("data", (chunk: Buffer) => this.events.onData(chunk, peer));
        socket.on("close", () => {
          this.sockets.delete(socket);
          this.events.onState("open", `:${this.params.port} 客户端 ${this.sockets.size} 个`);
        });
        socket.on("error", () => {
          this.sockets.delete(socket);
          socket.destroy();
        });
      });
      server.on("error", (err: Error) => {
        reject(new Error(`监听 :${this.params.port} 失败：${err.message}`, { cause: err }));
      });
      server.listen(this.params.port, () => {
        this.events.onState("open", `:${this.params.port} 等待客户端连入`);
        resolve();
      });
      this.server = server;
    });
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = undefined;
    this.events.onState("closed");
  }

  async send(data: Uint8Array): Promise<void> {
    if (this.sockets.size === 0) {
      throw new Error("尚无客户端连入，无法发送");
    }
    const buf = Buffer.from(data);
    for (const socket of this.sockets) socket.write(buf);
  }
}
