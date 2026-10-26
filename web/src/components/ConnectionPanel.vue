<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import { sendMsg, state } from "../store";
import type {
  SerialParams,
  TcpClientParams,
  TcpServerParams,
  TransportKind,
  TransportParams,
  UdpParams,
} from "../../../server/src/shared/protocol";

const KIND_LABELS: Record<TransportKind, string> = {
  "tcp-client": "TCP 客户端",
  "tcp-server": "TCP 服务端",
  udp: "UDP",
  serial: "串口",
};

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const form = reactive({
  kind: "tcp-client" as TransportKind,
  host: "192.168.1.100",
  port: 9000,
  listenPort: 9000,
  localPort: 9001,
  remoteHost: "",
  remotePort: 9000,
  serialPath: "",
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: false,
  idleMs: 300,
});

const connections = computed(() => [...state.connections.values()]);

function describe(): string {
  const kind = form.kind;
  switch (kind) {
    case "tcp-client":
      return `${form.host}:${form.port}`;
    case "tcp-server":
      return `listen :${form.listenPort}`;
    case "udp":
      return `udp :${form.localPort}`;
    case "serial":
      return `${form.serialPath} @${form.baudRate}`;
  }
}

function buildParams(): TransportParams {
  const kind = form.kind;
  switch (kind) {
    case "tcp-client":
      return {
        host: form.host,
        port: Number(form.port),
        idleMs: form.idleMs,
      } satisfies TcpClientParams;
    case "tcp-server":
      return { port: Number(form.listenPort), idleMs: form.idleMs } satisfies TcpServerParams;
    case "udp":
      return {
        localPort: Number(form.localPort),
        remoteHost: form.remoteHost.trim() || undefined,
        remotePort: form.remotePort ? Number(form.remotePort) : undefined,
        idleMs: form.idleMs,
      } satisfies UdpParams;
    case "serial":
      return {
        path: form.serialPath,
        baudRate: Number(form.baudRate),
        dataBits: form.dataBits as 5 | 6 | 7 | 8,
        stopBits: form.stopBits as 1 | 2,
        parity: form.parity as "none" | "even" | "odd",
        flowControl: form.flowControl,
        idleMs: form.idleMs,
      } satisfies SerialParams;
  }
}

function open(): void {
  if (form.kind === "serial" && !form.serialPath) {
    state.lastError = "请先选择串口";
    return;
  }
  const id = crypto.randomUUID();
  state.connections.set(id, {
    id,
    kind: form.kind,
    label: `${KIND_LABELS[form.kind]} ${describe()}`,
    state: "connecting",
  });
  sendMsg({ t: "open", id, kind: form.kind, params: buildParams() });
}

function close(id: string): void {
  sendMsg({ t: "close", id });
  state.connections.delete(id);
}

function refreshSerialPorts(): void {
  sendMsg({ t: "serial-list" });
}

/* 切到串口类型时自动枚举一次——省掉「先点刷新才知道有没有设备」 */
watch(
  () => form.kind,
  (k) => {
    if (k === "serial") refreshSerialPorts();
  },
);

/* 「去打开连接」引导：发送区点一下，这里闪两下告诉用户配置在哪 */
const pulsing = ref(false);
let pulseTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => state.pulseConnections,
  () => {
    pulsing.value = false;
    requestAnimationFrame(() => (pulsing.value = true));
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => (pulsing.value = false), 1700);
  },
);
</script>

<template>
  <section :class="{ pulse: pulsing }">
    <h2>连接</h2>
    <div class="row">
      <select v-model="form.kind">
        <option v-for="(label, kind) in KIND_LABELS" :key="kind" :value="kind">
          {{ label }}
        </option>
      </select>
      <button class="primary" @click="open">打开</button>
    </div>

    <template v-if="form.kind === 'tcp-client'">
      <div class="row">
        <label>地址</label><input v-model="form.host" placeholder="192.168.1.100" />
      </div>
      <div class="row"><label>端口</label><input v-model.number="form.port" type="number" /></div>
    </template>

    <template v-else-if="form.kind === 'tcp-server'">
      <div class="row">
        <label>监听端口</label><input v-model.number="form.listenPort" type="number" />
      </div>
    </template>

    <template v-else-if="form.kind === 'udp'">
      <div class="row">
        <label>本地端口</label><input v-model.number="form.localPort" type="number" />
      </div>
      <div class="row">
        <label>远端地址</label><input v-model="form.remoteHost" placeholder="留空则回发最近对端" />
      </div>
      <div class="row">
        <label>远端端口</label><input v-model.number="form.remotePort" type="number" />
      </div>
    </template>

    <template v-else>
      <div class="row">
        <select v-model="form.serialPath">
          <option value="" disabled>
            {{ state.serialPorts.length ? "选择串口…" : "未检测到串口设备——插上后点「刷新」" }}
          </option>
          <option v-for="p in state.serialPorts" :key="p.path" :value="p.path">
            {{ p.path }}{{ p.manufacturer ? ` (${p.manufacturer})` : "" }}
          </option>
        </select>
        <button @click="refreshSerialPorts">刷新</button>
      </div>
      <div class="row">
        <label>波特率</label>
        <select v-model.number="form.baudRate">
          <option v-for="b in BAUD_RATES" :key="b" :value="b">{{ b }}</option>
        </select>
      </div>
      <div class="row3">
        <select v-model.number="form.dataBits">
          <option :value="5">5 位</option>
          <option :value="6">6 位</option>
          <option :value="7">7 位</option>
          <option :value="8">8 位</option>
        </select>
        <select v-model.number="form.stopBits">
          <option :value="1">1 停止</option>
          <option :value="2">2 停止</option>
        </select>
        <select v-model="form.parity">
          <option value="none">无校验</option>
          <option value="even">偶校验</option>
          <option value="odd">奇校验</option>
        </select>
      </div>
      <div class="row">
        <label><input v-model="form.flowControl" type="checkbox" /> 硬件流控</label>
      </div>
    </template>

    <div class="row">
      <label>空闲切帧</label>
      <input v-model.number="form.idleMs" type="number" min="30" step="50" />
      <span class="dim">ms</span>
    </div>

    <h3>活动连接</h3>
    <div v-if="connections.length === 0" class="dim empty">暂无连接</div>
    <div v-for="c in connections" :key="c.id" class="conn">
      <span class="dot" :class="c.state"></span>
      <span class="conn-label">{{ c.label }}</span>
      <span v-if="c.detail" class="dim">{{ c.detail }}</span>
      <button @click="close(c.id)">断开</button>
    </div>
  </section>
</template>

<style scoped>
.pulse {
  animation: conn-pulse 0.8s ease-in-out 2;
  border-radius: 6px;
}
@keyframes conn-pulse {
  0%,
  100% {
    box-shadow: none;
  }
  50% {
    box-shadow: 0 0 0 3px var(--accent);
  }
}
h2 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--accent);
}
h3 {
  margin: 12px 0 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.row label {
  width: 60px;
  flex-shrink: 0;
}
.row3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  margin-bottom: 6px;
}
.row input[type="number"] {
  width: 90px;
}
.row input:not([type="number"]):not([type="checkbox"]) {
  flex: 1;
  min-width: 0;
}
.row select {
  flex: 1;
  min-width: 0;
}
.primary {
  background: var(--accent);
  color: #08121d;
  border-color: var(--accent);
  font-weight: 600;
}
.dim {
  color: var(--text-dim);
  font-size: 12px;
}
.empty {
  margin-bottom: 6px;
}
.conn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.conn-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-dim);
}
.dot.open {
  background: var(--in);
}
.dot.connecting {
  background: var(--out);
}
.dot.error {
  background: var(--error);
}
</style>
