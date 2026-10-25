/**
 * commprobe 前后端共享的 WebSocket 消息协议与传输参数类型。
 * 纯类型与常量，无运行时依赖，web 侧直接 import 本文件。
 */

export const PROTOCOL_VERSION = "0.1.0";

/** 默认空闲切帧间隔（ms）：连续接收静默超过该时长即认为一帧结束 */
export const DEFAULT_IDLE_MS = 300;

export type TransportKind = "tcp-client" | "tcp-server" | "udp" | "serial";
export type ConnectionState = "connecting" | "open" | "closed" | "error";
export type TextEncoding = "utf-8" | "gbk";

export interface TcpClientParams {
  host: string;
  port: number;
  idleMs?: number;
}

export interface TcpServerParams {
  port: number;
  idleMs?: number;
}

export interface UdpParams {
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  idleMs?: number;
}

export interface SerialParams {
  path: string;
  baudRate: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  flowControl?: boolean;
  idleMs?: number;
}

export type TransportParams = TcpClientParams | TcpServerParams | UdpParams | SerialParams;

export interface PortInfo {
  path: string;
  manufacturer?: string;
}

/** 浏览器 → 内核 */
export type ClientMessage =
  | { t: "open"; id: string; kind: TransportKind; params: TransportParams }
  | { t: "close"; id: string }
  /** hex 与 text 二选一：text 时由内核按 encoding 编码（GBK 依赖 iconv-lite） */
  | { t: "send"; id: string; hex?: string; text?: string; encoding?: TextEncoding }
  | { t: "serial-list" };

/** 内核 → 浏览器 */
export type ServerMessage =
  | { t: "hello"; version: string }
  | { t: "status"; id: string; kind: TransportKind; state: ConnectionState; detail?: string }
  | {
      t: "frame";
      id: string;
      kind: TransportKind;
      dir: "in" | "out";
      hex: string;
      ts: number;
      peer?: string;
    }
  | { t: "serial-ports"; ports: PortInfo[] }
  | { t: "error"; message: string };
