import iconv from "iconv-lite";

import { IdleGrouper } from "../framing/idle-grouper.js";
import type { SessionRecorder } from "../session/recorder.js";
import { parseHex, toHex } from "../shared/hex.js";
import {
  DEFAULT_IDLE_MS,
  type ConnectionState,
  type SerialParams,
  type ServerMessage,
  type TcpClientParams,
  type TcpServerParams,
  type TextEncoding,
  type TransportKind,
  type TransportParams,
  type UdpParams,
} from "../shared/protocol.js";
import { SerialTransport } from "./serial.js";
import { TcpClientTransport } from "./tcp-client.js";
import { TcpServerTransport } from "./tcp-server.js";
import type { Transport, TransportEvents } from "./types.js";
import { UdpTransport } from "./udp.js";

function idleMsOf(params: TransportParams): number {
  const ms = "idleMs" in params ? params.idleMs : undefined;
  return typeof ms === "number" && ms >= 30 ? ms : DEFAULT_IDLE_MS;
}

/** 文本 → 字节：UTF-8 走 TextEncoder，GBK 走 iconv-lite（Web 标准 API 不支持 GBK 编码） */
export function encodeBytes(text: string, encoding: TextEncoding): Uint8Array {
  if (encoding === "gbk") return iconv.encode(text, "gbk");
  return new TextEncoder().encode(text);
}

/**
 * 传输管理器：按 id 维护一组 Transport 实例，
 * 上行字节经 IdleGrouper 切帧后以 ServerMessage 推给前端，同时落会话录制。
 */
export class TransportManager {
  private readonly entries = new Map<
    string,
    { transport: Transport; grouper: IdleGrouper; kind: TransportKind }
  >();

  constructor(
    private readonly sink: (msg: ServerMessage) => void,
    private readonly recorder: SessionRecorder,
  ) {}

  async open(id: string, kind: TransportKind, params: TransportParams): Promise<void> {
    if (this.entries.has(id)) {
      await this.close(id);
    }
    const grouper = new IdleGrouper(idleMsOf(params), (frame, peer) => {
      const hex = toHex(frame);
      this.recorder.append({ ts: Date.now(), id, kind, dir: "in", hex, peer });
      this.sink({ t: "frame", id, kind, dir: "in", hex, ts: Date.now(), peer });
    });
    const events: TransportEvents = {
      onState: (state: ConnectionState, detail?: string) =>
        this.sink({ t: "status", id, kind, state, detail }),
      onData: (data: Uint8Array, peer?: string) => grouper.push(Buffer.from(data), peer),
    };
    const transport = this.createTransport(id, kind, params, events);
    this.entries.set(id, { transport, grouper, kind });
    await transport.open();
  }

  async send(
    id: string,
    payload: { hex?: string; text?: string; encoding?: TextEncoding },
  ): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`连接 ${id} 不存在`);
    const bytes = this.resolveBytes(payload);
    await entry.transport.send(bytes);
    const hex = toHex(bytes);
    this.recorder.append({ ts: Date.now(), id, kind: entry.kind, dir: "out", hex });
    this.sink({ t: "frame", id, kind: entry.kind, dir: "out", hex, ts: Date.now() });
  }

  async close(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    entry.grouper.dispose();
    await entry.transport.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close(id)));
  }

  private resolveBytes(payload: { hex?: string; text?: string; encoding?: TextEncoding }) {
    if (payload.text !== undefined && payload.text !== "") {
      return encodeBytes(payload.text, payload.encoding ?? "utf-8");
    }
    if (payload.hex !== undefined && payload.hex.trim() !== "") {
      return parseHex(payload.hex);
    }
    throw new Error("发送内容为空：需要 hex 或 text");
  }

  private createTransport(
    id: string,
    kind: TransportKind,
    params: TransportParams,
    events: TransportEvents,
  ): Transport {
    switch (kind) {
      case "tcp-client":
        return new TcpClientTransport(id, params as TcpClientParams, events);
      case "tcp-server":
        return new TcpServerTransport(id, params as TcpServerParams, events);
      case "udp":
        return new UdpTransport(id, params as UdpParams, events);
      case "serial":
        return new SerialTransport(id, params as SerialParams, events);
    }
  }
}
