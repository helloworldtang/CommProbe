import { createWriteStream, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WriteStream } from "node:fs";

import type { TransportKind } from "../shared/protocol.js";

export interface SessionRecord {
  ts: number;
  id: string;
  kind: TransportKind;
  dir: "in" | "out";
  hex: string;
  peer?: string;
}

/**
 * 会话录制：整场联调的每帧收发追加到 JSONL 文件，便于事后分析。
 * 默认目录 ~/.commprobe/sessions/，每次服务启动开一个新文件。
 */
export class SessionRecorder {
  private stream?: WriteStream;
  private _file?: string;

  constructor(enabled: boolean) {
    if (!enabled) return;
    const dir = join(homedir(), ".commprobe", "sessions");
    mkdirSync(dir, { recursive: true });
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");
    const clock = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join("");
    this._file = join(dir, `session-${stamp}-${clock}.jsonl`);
    this.stream = createWriteStream(this._file, { flags: "a" });
  }

  get file(): string | undefined {
    return this._file;
  }

  append(record: SessionRecord): void {
    if (!this.stream) return;
    this.stream.write(`${JSON.stringify(record)}\n`);
  }

  close(): void {
    this.stream?.end();
    this.stream = undefined;
  }
}
