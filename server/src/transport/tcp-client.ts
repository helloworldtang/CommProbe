import net from "node:net";

import type { TcpClientParams } from "../shared/protocol.js";
import type { Transport, TransportEvents } from "./types.js";

/** TCP 客户端：主动连接对端 */
export class TcpClientTransport implements Transport {
  readonly kind = "tcp-client" as const;

  private socket?: net.Socket;
  private settled = false;

  constructor(
    readonly id: string,
    private readonly params: TcpClientParams,
    private readonly events: TransportEvents,
  ) {}

  async open(): Promise<void> {
    const { host, port } = this.params;
    this.events.onState("connecting", `${host}:${port}`);
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host, port }, () => {
        this.settled = true;
        this.events.onState("open", `${host}:${port}`);
        resolve();
      });
      socket.on("data", (chunk: Buffer) => {
        this.events.onData(chunk, `${host}:${port}`);
      });
      socket.on("error", (err: Error) => {
        if (!this.settled) {
          this.settled = true;
          reject(new Error(`连接 ${host}:${port} 失败：${err.message}`, { cause: err }));
        } else {
          this.reportError(err);
        }
      });
      socket.on("close", () => {
        if (this.settled) this.events.onState("closed", `${host}:${port}`);
      });
      this.socket = socket;
    });
  }

  async close(): Promise<void> {
    this.socket?.destroy();
    this.socket = undefined;
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("TCP 连接未建立");
    }
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(Buffer.from(data), (err) => (err ? reject(err) : resolve()));
    });
  }

  private reportError(err: Error): void {
    this.events.onState("error", err.message);
  }
}
