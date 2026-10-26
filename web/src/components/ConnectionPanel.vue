<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import { sendMsg, state } from "../store";
import AppSelect from "./AppSelect.vue";
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

const kindOptions = Object.entries(KIND_LABELS).map(([value, label]) => ({
  value: value as TransportKind,
  label,
}));

/** 主按钮动词随类型走：客户端主动「连接」、服务端「监听」等入、UDP 绑定口「启动」、串口「打开」 */
const ACTION_LABELS: Record<TransportKind, string> = {
  "tcp-client": "连接",
  "tcp-server": "监听",
  udp: "启动",
  serial: "打开",
};

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const baudOptions = BAUD_RATES.map((b) => ({ value: b, label: String(b) }));

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

/** 串口高级参数摘要：8N1 / 8E1 / 7O2（开了流控再缀 +流控） */
const paramSummary = computed(() => {
  const p = form.parity === "none" ? "N" : form.parity === "even" ? "E" : "O";
  return `${form.dataBits}${p}${form.stopBits}${form.flowControl ? " +流控" : ""}`;
});
const paramsOpen = ref(false);

function describe(): string {
  const kind = form.kind;
  switch (kind) {
    case "tcp-client":
      return `${form.host}:${form.port}`;
    case "tcp-server":
      return `监听 :${form.listenPort}`;
    case "udp":
      return `:${form.localPort}`;
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
</script>

<template>
  <!-- 连接条：操作带的第一阶段——类型 → 参数 → 打开，从左到右就是依赖顺序 -->
  <section class="conn">
    <AppSelect v-model="form.kind" class="kind" :options="kindOptions" title="连接类型" />

    <template v-if="form.kind === 'tcp-client'">
      <input v-model="form.host" class="host" placeholder="地址" title="对端地址" />
      <input v-model.number="form.port" class="num" type="number" placeholder="端口" title="对端端口" />
    </template>
    <template v-else-if="form.kind === 'tcp-server'">
      <input
        v-model.number="form.listenPort"
        class="num"
        type="number"
        placeholder="监听端口"
        title="本地监听端口"
      />
    </template>
    <template v-else-if="form.kind === 'udp'">
      <input v-model.number="form.localPort" class="num" type="number" placeholder="本地端口" />
      <input v-model="form.remoteHost" class="host" placeholder="远端地址（可空）" />
      <input v-model.number="form.remotePort" class="num" type="number" placeholder="远端端口" />
    </template>
    <template v-else-if="form.kind === 'serial'">
      <AppSelect
        v-model="form.serialPath"
        class="port-sel"
        :options="state.serialPorts.map((p) => ({
          value: p.path,
          label: p.path + (p.manufacturer ? ` (${p.manufacturer})` : ''),
        }))"
        :placeholder="state.serialPorts.length ? '选择串口…' : '未检测到串口设备——插上后点「刷新」'"
      />
      <button title="重新枚举串口设备" @click="refreshSerialPorts">刷新</button>
      <AppSelect v-model="form.baudRate" class="num-sel" :options="baudOptions" title="波特率" />
      <div class="params-pop">
        <button
          class="params-btn"
          title="数据位 / 校验 / 停止位 / 流控"
          @click="paramsOpen = !paramsOpen"
        >
          参数 {{ paramSummary }} ▾
        </button>
        <div v-if="paramsOpen" class="overlay" @click="paramsOpen = false" />
        <div v-if="paramsOpen" class="pop">
          <label>数据位
            <AppSelect
              v-model="form.dataBits"
              :options="[
                { value: 5, label: '5' },
                { value: 6, label: '6' },
                { value: 7, label: '7' },
                { value: 8, label: '8（常用）' },
              ]"
            />
          </label>
          <label>校验
            <AppSelect
              v-model="form.parity"
              :options="[
                { value: 'none', label: '无（N）' },
                { value: 'even', label: '偶（E）' },
                { value: 'odd', label: '奇（O）' },
              ]"
            />
          </label>
          <label>停止位
            <AppSelect
              v-model="form.stopBits"
              :options="[
                { value: 1, label: '1（常用）' },
                { value: 2, label: '2' },
              ]"
            />
          </label>
          <label><input v-model="form.flowControl" type="checkbox" /> 硬件流控</label>
        </div>
      </div>
    </template>

    <label class="idle" title="空闲超过该时长即切帧，联调按帧看日志时用">
      <input v-model.number="form.idleMs" class="num" type="number" min="30" step="50" />
      <span class="dim">ms 切帧</span>
    </label>

    <button class="primary" @click="open">{{ ACTION_LABELS[form.kind] }}</button>

    <span class="spacer" />
    <span v-for="c in connections" :key="c.id" class="chip" :title="c.state">
      <span class="dot" :class="c.state" /> {{ c.label }}
      <button class="x" title="断开" @click="close(c.id)">✕</button>
    </span>
  </section>
</template>

<style scoped>
.conn {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.kind {
  flex-shrink: 0;
}
.host {
  width: 170px;
}
.num {
  width: 80px;
}
.num-sel {
  width: 90px;
}
.port-sel {
  max-width: 230px;
  min-width: 140px;
}
.idle {
  display: flex;
  align-items: center;
  gap: 4px;
}
.spacer {
  flex: 1;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2px 8px;
  background: var(--panel-2);
}
.x {
  border: none;
  background: none;
  padding: 0 0 0 2px;
  color: var(--text-dim);
  font-size: 11px;
}
.x:hover {
  color: var(--error);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-dim);
}
.dot.open {
  background: var(--in);
}
.dot.error {
  background: var(--error);
}
.params-pop {
  position: relative;
}
.params-btn {
  font-size: 12px;
}
/* 弹层皮肤在全局 style.css（.pop/.overlay），这里只补定位与内边距 */
.pop {
  top: calc(100% + 6px);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  white-space: nowrap;
}
.pop label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
</style>
