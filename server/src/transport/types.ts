import type { ConnectionState, TransportKind } from "../shared/protocol.js";

export interface TransportEvents {
  onState: (state: ConnectionState, detail?: string) => void;
  onData: (data: Uint8Array, peer?: string) => void;
}

/** 所有传输的统一接口：内核与 UI 只面向它编程 */
export interface Transport {
  readonly id: string;
  readonly kind: TransportKind;
  open(): Promise<void>;
  close(): Promise<void>;
  send(data: Uint8Array): Promise<void>;
}
