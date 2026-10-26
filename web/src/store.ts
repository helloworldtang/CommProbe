import { reactive } from "vue";

import type {
  ClientMessage,
  ConnectionState,
  PortInfo,
  ServerMessage,
  TransportKind,
} from "../../server/src/shared/protocol";

export interface LogEntry {
  ts: number;
  id: string;
  kind: TransportKind;
  dir: "in" | "out";
  hex: string;
  peer?: string;
}

export interface ConnectionInfo {
  id: string;
  kind: TransportKind;
  label: string;
  state: ConnectionState;
  detail?: string;
}

const MAX_LOGS = 2000;

export const state = reactive({
  wsReady: false,
  serverVersion: "",
  logs: [] as LogEntry[],
  connections: new Map<string, ConnectionInfo>(),
  serialPorts: [] as PortInfo[],
  lastError: "",
  /** 「去打开连接」引导信号：时间戳变化时左侧连接面板闪一下 */
  pulseConnections: 0,
});

let ws: WebSocket | null = null;

export function connectWs(): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    state.wsReady = true;
  };
  ws.onclose = () => {
    state.wsReady = false;
    setTimeout(connectWs, 1500);
  };
  ws.onmessage = (ev) => {
    try {
      handleServerMessage(JSON.parse(String(ev.data)) as ServerMessage);
    } catch {
      state.lastError = "收到无法解析的服务端消息";
    }
  };
}

export function sendMsg(msg: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    state.lastError = "与内核的连接未就绪";
    return;
  }
  ws.send(JSON.stringify(msg));
}

function handleServerMessage(msg: ServerMessage): void {
  if (msg.t === "hello") {
    state.serverVersion = msg.version;
    return;
  }
  if (msg.t === "error") {
    state.lastError = msg.message;
    return;
  }
  if (msg.t === "serial-ports") {
    state.serialPorts = msg.ports;
    return;
  }
  if (msg.t === "status") {
    if (msg.state === "closed") {
      state.connections.delete(msg.id);
      return;
    }
    const existing = state.connections.get(msg.id);
    if (existing) {
      existing.state = msg.state;
      existing.detail = msg.detail;
    } else {
      state.connections.set(msg.id, {
        id: msg.id,
        kind: msg.kind,
        label: msg.detail ?? msg.kind,
        state: msg.state,
        detail: msg.detail,
      });
    }
    return;
  }
  if (msg.t === "frame") {
    state.logs.push({
      ts: msg.ts,
      id: msg.id,
      kind: msg.kind,
      dir: msg.dir,
      hex: msg.hex,
      peer: msg.peer,
    });
    if (state.logs.length > MAX_LOGS) {
      state.logs.splice(0, state.logs.length - MAX_LOGS);
    }
    state.lastError = "";
  }
}
