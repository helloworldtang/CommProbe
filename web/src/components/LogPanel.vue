<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { state } from "../store";
import AppSelect from "./AppSelect.vue";
import { foldByGap } from "../../../server/src/shared/frame-fold";
import { decodeText, normalizeHex, parseHex } from "../../../server/src/shared/hex";

/* 显示偏好持久化：重开延续上次的看法（过滤词是临时工作状态，不持久化） */
const PREF_KEY = "commprobe.log-prefs";
function loadPrefs(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}
const prefs = loadPrefs();

const encoding = ref<"utf-8" | "gbk">((prefs.encoding as "utf-8" | "gbk") ?? "utf-8");
const display = ref<"both" | "hex" | "text">((prefs.display as "both" | "hex" | "text") ?? "both");

/* ---- 聊天室式滚动：贴底时新帧自动跟滚；用户上翻则停住不打扰，并数着新帧 ---- */
/** 是否贴在底部（距底 < 40px 视为贴底） */
const atBottom = ref(true);
/** 上翻期间新到、还没看过的帧数 */
const unread = ref(0);

function onScroll(): void {
  const el = logEl.value;
  if (!el) return;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  if (atBottom.value) unread.value = 0;
}

function jumpToBottom(): void {
  const el = logEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  atBottom.value = true;
  unread.value = 0;
}
/** 帧过滤：hex 片段（如 "08 00"）或文本关键字，不匹配的帧隐藏 */
const filterText = ref("");
/** 方向筛选 */
const dirFilter = ref<"all" | "in" | "out">((prefs.dirFilter as "all" | "in" | "out") ?? "all");
/** 折叠重复帧：相同内容、间隔在窗口内的高频帧聚合为一行；超窗自动分段（心跳中断可见） */
const collapse = ref((prefs.collapse as boolean) ?? true);
/** 折叠窗口（秒）：相邻两帧间隔超过它就断开为新的一段 */
const foldWindowSec = ref((prefs.foldWindowSec as number) ?? 30);

watch(
  [encoding, display, dirFilter, collapse, foldWindowSec],
  () =>
    localStorage.setItem(
      PREF_KEY,
      JSON.stringify({
        encoding: encoding.value,
        display: display.value,
        dirFilter: dirFilter.value,
        collapse: collapse.value,
        foldWindowSec: foldWindowSec.value,
      }),
    ),
);
const logEl = ref<HTMLElement>();

interface Row {
  key: string;
  ts: number;
  time: string;
  firstTime: string;
  count: number;
  dir: "in" | "out";
  label: string;
  len: number;
  hexLines: string[];
  text: string;
}

function hexLinesOf(hex: string): string[] {
  if (hex === "") return [];
  const words = hex.split(" ");
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 16) {
    lines.push(words.slice(i, i + 16).join(" "));
  }
  return lines;
}

const timeOf = (ts: number) => new Date(ts).toISOString().slice(11, 23);

function parseHexSafe(hex: string): Uint8Array {
  try {
    return parseHex(hex);
  } catch {
    return new Uint8Array(0);
  }
}

/** 过滤（方向 + 关键字）后的帧；关键字同时匹配 hex（忽略分隔符）与解码文本 */
const visibleEntries = computed(() => {
  const keyword = filterText.value.trim().toLowerCase();
  const keywordHex = keyword === "" ? "" : normalizeHex(keyword);
  return state.logs.filter((entry) => {
    if (dirFilter.value !== "all" && entry.dir !== dirFilter.value) return false;
    if (keyword === "") return true;
    if (keywordHex.length >= 2 && normalizeHex(entry.hex).includes(keywordHex)) return true;
    return decodeText(parseHexSafe(entry.hex), encoding.value).toLowerCase().includes(keyword);
  });
});

/** 折叠：相同 (连接,方向,内容) 且间隔在窗口内的帧聚合；非折叠时逐帧一行 */
const rows = computed<Row[]>(() => {
  const labels = new Map<string, string>();
  for (const [id, conn] of state.connections) labels.set(id, conn.label);

  const toRow = (
    entry: (typeof state.logs)[number],
    count: number,
    firstTs: number,
    lastTs: number,
  ): Row => ({
    key: `${firstTs}-${entry.id}-${entry.dir}-${entry.hex}`,
    ts: lastTs,
    time: timeOf(lastTs),
    firstTime: timeOf(firstTs),
    count,
    dir: entry.dir,
    label: labels.get(entry.id) ?? entry.id.slice(0, 8),
    len: entry.hex === "" ? 0 : entry.hex.split(" ").length,
    hexLines: hexLinesOf(entry.hex),
    text: decodeText(parseHexSafe(entry.hex), encoding.value),
  });

  if (!collapse.value) {
    return visibleEntries.value.map((entry) => toRow(entry, 1, entry.ts, entry.ts));
  }

  const keyed = visibleEntries.value.map((entry) => ({
    ...entry,
    key: `${entry.id}|${entry.dir}|${entry.hex}`,
  }));
  return foldByGap(keyed, foldWindowSec.value * 1000).map((group) =>
    toRow(group.items[0], group.count, group.firstTs, group.lastTs),
  );
});

const totalShown = computed(() =>
  collapse.value
    ? `${rows.value.length} 种 / ${visibleEntries.value.length} 帧`
    : `${rows.value.length} 帧`,
);

watch(
  () => state.logs.length,
  (n, o) => {
    const delta = n - (o ?? n);
    if (delta <= 0) return;
    if (atBottom.value) {
      void nextTick(() => {
        if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
      });
    } else {
      unread.value += delta;
    }
  },
);

function clear(): void {
  state.logs.splice(0, state.logs.length);
}
</script>

<template>
  <section class="log">
    <div class="toolbar">
      <input v-model="filterText" class="filter" placeholder="过滤：hex 片段或文本" />
      <AppSelect
        v-model="dirFilter"
        :options="[
          { value: 'all', label: '全部方向' },
          { value: 'in', label: '仅接收' },
          { value: 'out', label: '仅发送' },
        ]"
      />
      <label><input v-model="collapse" type="checkbox" /> 折叠重复帧</label>
      <label v-if="collapse">
        窗口
        <input v-model.number="foldWindowSec" class="fold-window" type="number" min="0" step="5" />
        s
      </label>
      <label>显示</label>
      <AppSelect
        v-model="display"
        :options="[
          { value: 'both', label: 'HEX+文本' },
          { value: 'hex', label: '仅 HEX' },
          { value: 'text', label: '仅文本' },
        ]"
      />
      <label>编码</label>
      <AppSelect
        v-model="encoding"
        :options="[
          { value: 'utf-8', label: 'UTF-8' },
          { value: 'gbk', label: 'GBK' },
        ]"
      />
      <span class="dim">{{ totalShown }}</span>
      <button @click="clear">清空</button>
    </div>
    <div ref="logEl" class="entries" @scroll.passive="onScroll">
      <div v-if="rows.length === 0" class="dim placeholder">
        暂无数据：打开连接后收发帧将显示在这里（按空闲间隔自动分组）
      </div>
      <div v-for="row in rows" :key="row.key" class="entry" :class="row.dir">
        <div class="meta">
          <span class="time">{{ row.time }}</span>
          <span class="arrow">{{ row.dir === "in" ? "↓ 收" : "↑ 发" }}</span>
          <span class="peer">{{ row.label }}</span>
          <span class="dim">{{ row.len }} B</span>
          <span
            v-if="row.count > 1"
            class="fold"
            title="窗口内相同内容的高频帧已折叠，间隔超窗会分段"
          >
            ×{{ row.count }}（{{ row.firstTime }} ~ {{ row.time }}）
          </span>
        </div>
        <div v-if="display !== 'text'" class="hex">
          <div v-for="(line, i) in row.hexLines" :key="i">{{ line }}</div>
        </div>
        <div v-if="display !== 'hex'" class="text">{{ row.text }}</div>
      </div>
    </div>
    <button v-if="unread > 0" class="unread-pill" title="回到最新" @click="jumpToBottom">
      ↓ {{ unread }} 条新帧
    </button>
  </section>
</template>

<style scoped>
.log {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.unread-pill {
  position: absolute;
  right: 18px;
  bottom: 14px;
  z-index: 10;
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
  border-radius: 14px;
  padding: 4px 12px;
  font-weight: 600;
  box-shadow: var(--shadow-pop);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.toolbar .filter {
  flex: 1;
  min-width: 200px;
}
.toolbar .fold-window {
  width: 60px;
}
.toolbar .dim {
  text-align: right;
}
.entries {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
}
.placeholder {
  padding: 24px;
  text-align: center;
}
.entry {
  border-left: 3px solid transparent;
  padding: 3px 8px;
  margin-bottom: 6px;
  border-radius: 3px;
  background: var(--panel);
}
.entry.in {
  border-left-color: var(--in);
}
.entry.out {
  border-left-color: var(--out);
}
.meta {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}
.time {
  color: var(--text-dim);
  font-size: 12px;
}
.arrow {
  font-weight: 700;
}
.entry.in .arrow {
  color: var(--in);
}
.entry.out .arrow {
  color: var(--out);
}
.peer {
  color: var(--accent);
  font-size: 12px;
}
.dim {
  color: var(--text-dim);
  font-size: 12px;
}
.fold {
  color: var(--out);
  font-size: 12px;
  font-weight: 600;
}
.hex {
  white-space: pre;
  margin-top: 2px;
  letter-spacing: 0.5px;
}
.text {
  color: var(--text-dim);
  word-break: break-all;
  margin-top: 2px;
}
</style>
