<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { sendMsg, state } from "../store";
import type { TextEncoding } from "../../../server/src/shared/protocol";

interface SendItem {
  id: string;
  label: string;
  mode: "hex" | "text";
  content: string;
  encoding: TextEncoding;
  loopMs: number;
}

const STORAGE_KEY = "commprobe.send-items";
const MIN_LOOP_MS = 50;

function defaultItems(): SendItem[] {
  return [
    {
      id: crypto.randomUUID(),
      label: "示例：Modbus 读保持寄存器",
      mode: "hex",
      content: "01 03 00 00 00 02 C4 0B",
      encoding: "utf-8",
      loopMs: 0,
    },
  ];
}

function loadItems(): SendItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultItems();
    const parsed = JSON.parse(raw) as SendItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultItems();
    return parsed;
  } catch {
    return defaultItems();
  }
}

const items = ref<SendItem[]>(loadItems());
watch(items, (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)), { deep: true });

const target = ref("");
/** 序列发送帧间隔；默认 200ms——下位机按空闲切帧时的常见硬约束 */
const gapMs = ref(200);

const openConnections = computed(() =>
  [...state.connections.values()].filter((c) => c.state === "open"),
);

const loops = new Map<string, ReturnType<typeof setInterval>>();

function doSend(item: SendItem): void {
  if (!target.value) {
    state.lastError = "请先在下方选择目标连接";
    return;
  }
  sendMsg({
    t: "send",
    id: target.value,
    hex: item.mode === "hex" ? item.content : undefined,
    text: item.mode === "text" ? item.content : undefined,
    encoding: item.mode === "text" ? item.encoding : undefined,
  });
}

function toggleLoop(item: SendItem): void {
  const existing = loops.get(item.id);
  if (existing) {
    clearInterval(existing);
    loops.delete(item.id);
    return;
  }
  if (item.loopMs < MIN_LOOP_MS) {
    state.lastError = "循环间隔过小，先填一个 ≥50ms 的间隔";
    return;
  }
  doSend(item);
  loops.set(
    item.id,
    setInterval(() => doSend(item), item.loopMs),
  );
}

function isLooping(id: string): boolean {
  return loops.has(id);
}

async function sendSequence(): Promise<void> {
  for (const item of items.value) {
    doSend(item);
    await new Promise((r) => setTimeout(r, Math.max(gapMs.value, 0)));
  }
}

function addItem(): void {
  items.value.push({
    id: crypto.randomUUID(),
    label: "",
    mode: "hex",
    content: "",
    encoding: "utf-8",
    loopMs: 0,
  });
}

function removeItem(index: number): void {
  const [removed] = items.value.splice(index, 1);
  if (removed) {
    const timer = loops.get(removed.id);
    if (timer) {
      clearInterval(timer);
      loops.delete(removed.id);
    }
  }
}

onUnmounted(() => {
  for (const timer of loops.values()) clearInterval(timer);
  loops.clear();
});
</script>

<template>
  <section class="send">
    <div class="toolbar">
      <label>目标</label>
      <select v-model="target">
        <option value="" disabled>选择连接…</option>
        <option v-for="c in openConnections" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <label>序列间隔</label>
      <input v-model.number="gapMs" type="number" min="0" step="50" />
      <span class="dim">ms</span>
      <button class="primary" @click="sendSequence">按顺序全部发送</button>
      <button @click="addItem">+ 新增</button>
    </div>
    <div class="items">
      <div v-for="(item, i) in items" :key="item.id" class="item">
        <input v-model="item.label" class="label" placeholder="备注" />
        <select v-model="item.mode">
          <option value="hex">HEX</option>
          <option value="text">文本</option>
        </select>
        <select v-if="item.mode === 'text'" v-model="item.encoding">
          <option value="utf-8">UTF-8</option>
          <option value="gbk">GBK</option>
        </select>
        <input
          v-model="item.content"
          class="content"
          :placeholder="item.mode === 'hex' ? '01 03 00 00 …' : '要发送的文本'"
        />
        <input
          v-model.number="item.loopMs"
          class="loop"
          type="number"
          min="0"
          placeholder="循环ms"
        />
        <button class="primary" @click="doSend(item)">发送</button>
        <button :class="{ looping: isLooping(item.id) }" @click="toggleLoop(item)">
          {{ isLooping(item.id) ? "停止" : "循环" }}
        </button>
        <button @click="removeItem(i)">✕</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.send {
  border-top: 1px solid var(--border);
  background: var(--panel);
  max-height: 240px;
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.toolbar select {
  min-width: 160px;
}
.toolbar input[type="number"] {
  width: 70px;
}
.dim {
  color: var(--text-dim);
}
.items {
  overflow-y: auto;
  padding: 6px 10px;
}
.item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.item .label {
  width: 110px;
  flex-shrink: 0;
}
.item .content {
  flex: 1;
  min-width: 0;
}
.item .loop {
  width: 70px;
}
.primary {
  background: var(--accent);
  color: #08121d;
  border-color: var(--accent);
  font-weight: 600;
}
.looping {
  background: var(--out);
  color: #241300;
  border-color: var(--out);
}
</style>
