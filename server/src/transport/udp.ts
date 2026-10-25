import dgram from "node:dgram";

import type { UdpParams } from "../shared/protocol.js";
import type { Transport, TransportEvents } from "./types.js";

/**
 * UDP：绑定本地端口收包；发送目标优先用配置的 remote，其次回发给最近的对端。
 */
export class UdpTransport implements Transport {
  readonly kind = "udp" as const;

  private socket?: dgram.Socket;
  private lastPeer?: { host: string; port: number };

  constructor(
    readonly id: string,
    private readonly params: UdpParams,
    private readonly events: TransportEvents,
  ) {}

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      socket.on("error", (err: Error) => {
        reject(
          new Error(`UDP 绑定 :${this.params.localPort} 失败：${err.message}`, { cause: err }),
        );
      });
      socket.on("message", (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        this.lastPeer = { host: rinfo.address, port: rinfo.port };
        this.events.onData(msg, `${rinfo.address}:${rinfo.port}`);
      });
      socket.bind(this.params.localPort, () => {
        this.events.onState("open", `udp :${this.params.localPort}`);
        resolve();
      });
      this.socket = socket;
    });
  }

  async close(): Promise<void> {
    this.socket?.close();
    this.socket = undefined;
    this.events.onState("closed");
  }

  async send(data: Uint8Array): Promise<void> {
    const target = this.remote() ?? this.lastPeer;
    if (!this.socket || !target) {
      throw new Error("UDP 发送需要先配置 remote 地址，或已有对端发过包");
    }
    await new Promise<void>((resolve, reject) => {
      this.socket!.send(Buffer.from(data), target.port, target.host, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  private remote(): { host: string; port: number } | undefined {
    const { remoteHost, remotePort } = this.params;
    if (remoteHost && remotePort) return { host: remoteHost, port: remotePort };
    return undefined;
  }
}
