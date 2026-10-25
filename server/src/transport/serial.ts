import type { PortInfo, SerialParams } from "../shared/protocol.js";
import type { Transport, TransportEvents } from "./types.js";

/**
 * 串口传输：依赖原生模块 serialport，**懒加载 + 可选依赖**——
 * 安装失败时 TCP/UDP 功能不受影响，仅串口连接时提示。
 */

interface SerialPortLike {
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  write(data: Buffer, callback?: (err?: Error | null) => void): unknown;
  close(callback?: (err?: Error | null) => void): unknown;
}

type SerialPortCtor = new (options: Record<string, unknown>) => SerialPortLike;

interface SerialPortModule {
  SerialPort: SerialPortCtor & { list(): Promise<PortInfo[]> };
}

let serialportModule: SerialPortModule | undefined;

async function loadSerialport(): Promise<SerialPortModule> {
  if (serialportModule) return serialportModule;
  try {
    const mod = (await import("serialport")) as unknown as SerialPortModule;
    serialportModule = mod;
    return mod;
  } catch (err) {
    throw new Error(
      "串口模块 serialport 未安装或当前平台无预编译二进制；TCP/UDP 功能不受影响。可执行 npm install serialport 补装。",
      { cause: err },
    );
  }
}

/** 枚举系统串口；串口模块缺失时抛出可读错误 */
export async function listSerialPorts(): Promise<PortInfo[]> {
  const mod = await loadSerialport();
  return mod.SerialPort.list();
}

export class SerialTransport implements Transport {
  readonly kind = "serial" as const;

  private port?: SerialPortLike;

  constructor(
    readonly id: string,
    private readonly params: SerialParams,
    private readonly events: TransportEvents,
  ) {}

  async open(): Promise<void> {
    const { SerialPort } = await loadSerialport();
    this.events.onState("connecting", `${this.params.path} @${this.params.baudRate}`);
    const port = new SerialPort({
      path: this.params.path,
      baudRate: this.params.baudRate,
      dataBits: this.params.dataBits ?? 8,
      stopBits: this.params.stopBits ?? 1,
      parity: this.params.parity ?? "none",
      flowControl: this.params.flowControl ?? false,
      autoOpen: true,
    });
    await new Promise<void>((resolve, reject) => {
      let opened = false;
      port.on("error", (err: Error) => {
        if (!opened) {
          reject(new Error(`打开串口 ${this.params.path} 失败：${err.message}`, { cause: err }));
        } else {
          this.events.onState("error", err.message);
        }
      });
      // serialport autoOpen 立即打开；error 未触发即视为成功
      setImmediate(() => {
        opened = true;
        this.events.onState("open", `${this.params.path} @${this.params.baudRate}`);
        resolve();
      });
    });
    port.on("data", (chunk: Buffer) => this.events.onData(chunk, this.params.path));
    port.on("close", () => this.events.onState("closed", this.params.path));
    this.port = port;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.port) return resolve();
      this.port.close(() => resolve());
    });
    this.port = undefined;
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.port) throw new Error("串口未打开");
    await new Promise<void>((resolve, reject) => {
      this.port!.write(Buffer.from(data), (err) => (err ? reject(err) : resolve()));
    });
  }
}
