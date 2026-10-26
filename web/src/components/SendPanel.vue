<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

import { sendMsg, state } from "../store";
import type { TextEncoding } from "../../../server/src/shared/protocol";
import ConnectionPanel from "./ConnectionPanel.vue";
import { analyzeHex, fixCrcTail, sanitizeHexInput, type HexAnalysis } from "../hex-status";

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

/* ---- HEX 实时反馈：输入即解析，错误在发送前就看见 ---- */

/** 字节芯片最多展示的个数，超出的折叠成计数——长帧不刷屏 */
const CHIP_LIMIT = 32;

const quickAnalysis = computed<HexAnalysis | null>(() =>
  quickMode.value === "hex" ? analyzeHex(quickContent.value) : null,
);

function fixQuickCrc(): void {
  quickContent.value = fixCrcTail(quickContent.value);
}

/** HEX 框敲入即清洗：非法字符当场剔除，不留到发送时才发现 */
function onQuickInput(e: Event): void {
  if (quickMode.value !== "hex") return;
  const cleaned = sanitizeHexInput((e.target as HTMLInputElement).value);
  if (cleaned !== quickContent.value) quickContent.value = cleaned;
}

function onItemInput(item: SendItem, e: Event): void {
  if (item.mode !== "hex") return;
  const cleaned = sanitizeHexInput((e.target as HTMLInputElement).value);
  if (cleaned !== item.content) item.content = cleaned;
}

/** Enter 发送 / Shift+Enter 换行；输入法组字中的 Enter 只上屏不发送 */
function onQuickEnter(e: KeyboardEvent): void {
  if (e.isComposing) return;
  if (!e.shiftKey) {
    e.preventDefault();
    quickSend();
  }
}

interface ItemStatus {
  text: string;
  kind: "error" | "ok" | "warn";
  fixable: boolean;
}

function itemStatus(item: SendItem): ItemStatus | null {
  if (item.mode !== "hex") return null;
  const a = analyzeHex(item.content);
  if (!a) return null;
  if (a.danglingNibble) return { text: "缺半字节", kind: "error", fixable: false };
  if (a.crcTail) {
    return a.crcTail.match
      ? { text: `${a.bytes.length}B CRC✓`, kind: "ok", fixable: false }
      : { text: `${a.bytes.length}B CRC≠`, kind: "warn", fixable: true };
  }
  return { text: `${a.bytes.length}B`, kind: "ok", fixable: false };
}

function fixItemCrc(item: SendItem): void {
  item.content = fixCrcTail(item.content);
}

/** 常用条目（持久化） */
const items = ref<SendItem[]>(loadItems());
watch(items, (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)), { deep: true });

/** 序列发送帧间隔；默认 200ms——下位机按空闲切帧时的常见硬约束 */
const gapMs = ref(200);

const openConnections = computed(() =>
  [...state.connections.values()].filter((c) => c.state === "open"),
);

/* 目标联动：左侧一打开连接就自动选中——用户不必跨半个屏幕去下拉里找一遍 */
watch(openConnections, (list) => {
  if (list.length === 0) {
    quickTarget.value = "";
    return;
  }
  if (!list.some((c) => c.id === quickTarget.value)) quickTarget.value = list[0].id;
});

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
  if (p.mode === "hex") {
    const a = analyzeHex(p.content);
    if (a?.danglingNibble) {
      state.lastError = "帧不完整：多出半个字节，补一位或删一位";
      return;
    }
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
    <!-- 操作带：①连接（正上方）→ ②组帧发送 → ③常用，从左到右=依赖顺序 -->
    <ConnectionPanel />
    <!-- 快捷发送区：控件一行 + 内容一框，敲完即发 -->
    <div class="quick">
      <div class="quick-controls">
        <select v-model="quickTarget" class="target">
          <option value="" disabled>
            {{ openConnections.length ? "目标连接…" : "先在上方打开一条连接（自动选中）" }}
          </option>
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
        <span class="spacer" />
        <button class="primary send-btn" @click="quickSend">发送</button>
        <label class="loop-label" title="循环间隔（毫秒）">
          <input v-model.number="quickLoopMs" class="loop-ms" type="number" min="50" step="50" />
        </label>
        <button :class="{ looping: quickLooping }" @click="toggleQuickLoop">
          {{ quickLooping ? "停循环" : "循环" }}
        </button>
        <button title="把当前内容存为常用条目" @click="saveQuickAsItem">存</button>
      </div>
      <textarea
        v-model="quickContent"
        class="quick-editor"
        rows="3"
        :placeholder="quickMode === 'hex' ? '01 03 00 00 00 02 C4 0B' : '要发送的文本'"
        title="Enter 发送 · Shift+Enter 换行"
        @input="onQuickInput"
        @keydown.enter="onQuickEnter"
      />
      <div v-if="quickAnalysis" class="feedback">
        <span
          v-for="(b, i) in quickAnalysis.bytes.slice(0, CHIP_LIMIT)"
          :key="i"
          class="chip"
        >{{ b }}</span>
        <span v-if="quickAnalysis.bytes.length > CHIP_LIMIT" class="dim">
          +{{ quickAnalysis.bytes.length - CHIP_LIMIT }} 字节
        </span>
        <span v-if="quickAnalysis.danglingNibble" class="chip bad">
          {{ quickAnalysis.danglingNibble }}_
        </span>
        <span class="spacer" />
        <span v-if="quickAnalysis.danglingNibble" class="err">缺半个字节</span>
        <template v-else-if="quickAnalysis.crcTail">
          <span v-if="quickAnalysis.crcTail.match" class="ok">CRC ✓</span>
          <button v-else class="link" title="用正确的 CRC 尾缀替换末 2 字节" @click="fixQuickCrc">
            CRC 应为 {{ quickAnalysis.crcTail.expected }}，点此修正
          </button>
        </template>
        <span class="dim">{{ quickAnalysis.bytes.length }} 字节</span>
      </div>
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
          @input="onItemInput(item, $event)"
        />
        <span
          v-if="itemStatus(item)"
          class="hex-status"
          :class="itemStatus(item)?.kind"
          :title="itemStatus(item)?.fixable ? '点击用正确的 CRC 尾缀替换末 2 字节' : undefined"
          @click="itemStatus(item)?.fixable && fixItemCrc(item)"
        >{{ itemStatus(item)?.text }}</span>
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
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.quick-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.quick .target {
  max-width: 200px;
  flex-shrink: 0;
}
.quick .mode {
  flex-shrink: 0;
}
/* 主操作按钮：高频路径，明显大于同排控件才好点 */
.quick-controls .send-btn {
  padding: 8px 26px;
  font-size: 15px;
  font-weight: 700;
  border-radius: 6px;
}
.quick-editor {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  font-size: 15px;
  line-height: 1.6;
  padding: 6px 8px;
}
.quick-editor:focus {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
}
.feedback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.chip {
  font-size: 12px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--panel-2);
}
.chip.bad {
  color: var(--error);
  border-color: var(--error);
}
.spacer {
  flex: 1;
}
.ok {
  color: var(--in);
}
.err {
  color: var(--error);
}
.link {
  color: var(--accent);
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
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
.hex-status {
  flex-shrink: 0;
  font-size: 11px;
}
.hex-status.ok {
  color: var(--in);
}
.hex-status.warn {
  color: var(--out);
  cursor: pointer;
}
.hex-status.error {
  color: var(--error);
}
.loop-ms {
  width: 64px;
}
.loop-label {
  display: flex;
}
.dim {
  color: var(--text-dim);
}
</style>
