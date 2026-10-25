/**
 * 空闲切帧（idle-gap framing）：把字节流按「静默 ≥ idleMs」切成帧。
 * 适配无长度域、无定界符的下位机协议（按空闲边界组帧的通用形态）。
 */

const MAX_PENDING_BYTES = 64 * 1024;

export class IdleGrouper {
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private peer?: string;
  private timer?: NodeJS.Timeout;
  private disposed = false;

  constructor(
    private readonly idleMs: number,
    private readonly onFlush: (frame: Buffer, peer?: string) => void,
  ) {}

  push(chunk: Buffer, peer?: string): void {
    if (this.disposed) return;
    this.pending.push(chunk);
    this.pendingBytes += chunk.length;
    // 同一帧内多个分片到达时，peer 以首个非空为准，不被后续 undefined 覆盖
    if (peer !== undefined) this.peer = peer;
    if (this.pendingBytes >= MAX_PENDING_BYTES) {
      this.flushNow();
      return;
    }
    this.timer?.refresh();
    if (!this.timer) {
      this.timer = setTimeout(() => this.flushNow(), this.idleMs);
      this.timer.unref?.();
    }
  }

  flushNow(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.length === 0) return;
    const frame = Buffer.concat(this.pending);
    const peer = this.peer;
    this.pending = [];
    this.pendingBytes = 0;
    this.peer = undefined;
    this.onFlush(frame, peer);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.length > 0) this.flushNow();
  }
}
