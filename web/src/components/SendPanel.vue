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

/** 快捷发送条：最高频路径——选目标、敲内容、回车即发 */
const quickTarget = ref("");
const quickMode = ref<"hex" | "text">("hex");
const quickEncoding = ref<TextEncoding>("utf-8");
const quickContent = ref("");
const quickLoopMs = ref(1000);
const quickLooping = ref(false);

/** 常用条目（持久化） */
const items = ref<SendItem[]>(loadItems());
watch(items, (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)), { deep: true });

/** 序列发送帧间隔；默认 200ms——下位机按空闲切帧时的常见硬约束 */
const gapMs = ref(200);

const openConnections = computed(() =>
  [...state.connections.values()].filter((c) => c.state === "open"),
);

const loops = new Map<string, ReturnType<typeof setInterval>>();

interface Payload {
  mode: "hex" | "text";
  content: string;
  encoding: TextEncoding;
}

function doSend(target: string, p: Payload): void {
  if (!target) {
    state.lastError = "请先选择目标连接";
    return;
  }
  sendMsg({
    t: "send",
    id: target,
    hex: p.mode === "hex" ? p.content : undefined,
    text: p.mode === "text" ? p.content : undefined,
    encoding: p.mode === "text" ? p.encoding : undefined,
  });
}

function stopLoop(key: string): void {
  const timer = loops.get(key);
  if (timer) {
    clearInterval(timer);
    loops.delete(key);
  }
}

function startLoop(key: string, target: string, p: Payload, intervalMs: number): void {
  if (intervalMs < MIN_LOOP_MS) {
    state.lastError = `循环间隔需 ≥${MIN_LOOP_MS}ms`;
    return;
  }
  doSend(target, p);
  loops.set(
    key,
    setInterval(() => doSend(target, p), intervalMs),
  );
}

/** 快捷条：发送（首次点击发送；若在循环中先停） */
function quickSend(): void {
  if (quickContent.value.trim() === "") {
    state.lastError = "发送内容为空";
    return;
  }
  if (quickLooping.value) {
    quickLooping.value = false;
    stopLoop("quick");
    return;
  }
  doSend(quickTarget.value, {
    mode: quickMode.value,
    content: quickContent.value,
    encoding: quickEncoding.value,
  });
}

function toggleQuickLoop(): void {
  if (quickLooping.value) {
    quickLooping.value = false;
    stopLoop("quick");
    return;
  }
  if (quickContent.value.trim() === "") {
    state.lastError = "发送内容为空";
    return;
  }
  quickLooping.value = true;
  startLoop(
    "quick",
    quickTarget.value,
    { mode: quickMode.value, content: quickContent.value, encoding: quickEncoding.value },
    quickLoopMs.value,
  );
}

/** 快捷条内容存为常用条目 */
function saveQuickAsItem(): void {
  if (quickContent.value.trim() === "") {
    state.lastError = "内容为空，无法保存";
    return;
  }
  items.value.push({
    id: crypto.randomUUID(),
    label: "",
    mode: quickMode.value,
    content: quickContent.value,
    encoding: quickEncoding.value,
    loopMs: 0,
  });
}

function sendItem(item: SendItem): void {
  doSend(quickTarget.value, {
    mode: item.mode,
    content: item.content,
    encoding: item.encoding,
  });
}

function toggleItemLoop(item: SendItem): void {
  if (loops.has(item.id)) {
    stopLoop(item.id);
    return;
  }
  startLoop(
    item.id,
    quickTarget.value,
    { mode: item.mode, content: item.content, encoding: item.encoding },
    item.loopMs,
  );
}

function isLooping(id: string): boolean {
  return loops.has(id);
}

async function sendSequence(): Promise<void> {
  for (const item of items.value) {
    doSend(quickTarget.value, {
      mode: item.mode,
      content: item.content,
      encoding: item.encoding,
    });
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
  if (removed) stopLoop(removed.id);
}

onUnmounted(() => {
  for (const key of [...loops.keys()]) stopLoop(key);
});
</script>

<template>
  <section class="send">
    <!-- 快捷发送条：敲完即发 -->
    <div class="quick">
      <select v-model="quickTarget" class="target">
        <option value="" disabled>目标连接…</option>
        <option v-for="c in openConnections" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <select v-model="quickMode" class="mode">
        <option value="hex">HEX</option>
        <option value="text">文本</option>
      </select>
      <select v-if="quickMode === 'text'" v-model="quickEncoding" class="mode">
        <option value="utf-8">UTF-8</option>
        <option value="gbk">GBK</option>
      </select>
      <input
        v-model="quickContent"
        class="content"
        :placeholder="quickMode === 'hex' ? '01 03 00 00 00 02 C4 0B' : '要发送的文本'"
        @keydown.enter="quickSend"
      />
      <button class="primary" @click="quickSend">发送</button>
      <label class="loop-label" title="循环间隔（毫秒）">
        <input v-model.number="quickLoopMs" class="loop-ms" type="number" min="50" step="50" />
      </label>
      <button :class="{ looping: quickLooping }" @click="toggleQuickLoop">
        {{ quickLooping ? "停循环" : "循环" }}
      </button>
      <button title="把当前内容存为常用条目" @click="saveQuickAsItem">存</button>
    </div>

    <!-- 常用条目 -->
    <div class="items-head">
      <span class="dim">常用（{{ items.length }}）</span>
      <label>序列间隔</label>
      <input v-model.number="gapMs" class="gap" type="number" min="0" step="50" />
      <span class="dim">ms</span>
      <button class="primary" @click="sendSequence">按顺序全部发送</button>
      <button @click="addItem">+ 新增</button>
    </div>
    <div class="items">
      <div v-for="(item, i) in items" :key="item.id" class="item">
        <span class="badge" :class="item.mode">{{ item.mode === "hex" ? "HEX" : "文" }}</span>
        <input v-model="item.label" class="label" placeholder="备注" />
        <input
          v-model="item.content"
          class="content"
          :placeholder="item.mode === 'hex' ? '01 03 …' : '文本内容'"
        />
        <input
          v-model.number="item.loopMs"
          class="loop-ms"
          type="number"
          min="0"
          placeholder="循环ms"
          title="循环间隔（毫秒），0 表示不用循环"
        />
        <button class="primary" @click="sendItem(item)">发送</button>
        <button :class="{ looping: isLooping(item.id) }" @click="toggleItemLoop(item)">
          {{ isLooping(item.id) ? "停" : "循环" }}
        </button>
        <button @click="removeItem(i)">✕</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.send {
  background: var(--panel);
  height: 100%;
  display: flex;
  flex-direction: column;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.quick .target {
  max-width: 200px;
  flex-shrink: 0;
}
.quick .mode {
  flex-shrink: 0;
}
.quick .content {
  flex: 1;
  min-width: 120px;
}
.items-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
}
.items-head .dim:first-child {
  flex: 1;
}
.items-head .gap {
  width: 60px;
}
.items {
  overflow-y: auto;
  padding: 0 10px 8px;
}
.item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.badge {
  flex-shrink: 0;
  width: 30px;
  text-align: center;
  font-size: 11px;
  border-radius: 3px;
  padding: 1px 0;
}
.badge.hex {
  color: var(--in);
  border: 1px solid var(--in);
}
.badge.text {
  color: var(--out);
  border: 1px solid var(--out);
}
.item .label {
  width: 110px;
  flex-shrink: 0;
}
.item .content {
  flex: 1;
  min-width: 0;
}
.loop-ms {
  width: 64px;
}
.loop-label {
  display: flex;
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
.dim {
  color: var(--text-dim);
}
</style>
