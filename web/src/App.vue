<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import ChecksumPanel from "./components/ChecksumPanel.vue";
import ConnectionPanel from "./components/ConnectionPanel.vue";
import LogPanel from "./components/LogPanel.vue";
import SendPanel from "./components/SendPanel.vue";
import { state } from "./store";

const wsBadge = computed(() =>
  state.wsReady ? `v${state.serverVersion} · 运行中` : "服务启动中…",
);

// 错误横幅 5s 自动消退
watch(
  () => state.lastError,
  (msg) => {
    if (!msg) return;
    setTimeout(() => {
      if (state.lastError === msg) state.lastError = "";
    }, 5000);
  },
);

/* ---- 可拖拽面板（业界惯例：拖动调大小 / 双击复位 / 尺寸记忆，同 VS Code） ---- */

const ASIDE_KEY = "commprobe.layout.asideWidth";
const PANEL_KEY = "commprobe.layout.sendHeight";
const ASIDE_DEFAULT = 300;
const PANEL_DEFAULT = 240;

function loadNum(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const asideWidth = ref(loadNum(ASIDE_KEY, ASIDE_DEFAULT));
const sendHeight = ref(loadNum(PANEL_KEY, PANEL_DEFAULT));

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function startDrag(
  e: MouseEvent,
  axis: "x" | "y",
  opts: {
    min: number;
    max: number;
    invert: boolean;
    refValue: () => number;
    apply: (v: number) => void;
    save: () => void;
  },
): void {
  e.preventDefault();
  const startPos = axis === "x" ? e.clientX : e.clientY;
  const startVal = opts.refValue();
  const onMove = (ev: MouseEvent) => {
    const delta = (axis === "x" ? ev.clientX : ev.clientY) - startPos;
    opts.apply(clamp(startVal + (opts.invert ? -delta : delta), opts.min, opts.max));
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    opts.save();
  };
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

const dragAside = (e: MouseEvent) =>
  startDrag(e, "x", {
    min: 220,
    max: 560,
    invert: false,
    refValue: () => asideWidth.value,
    apply: (v) => (asideWidth.value = v),
    save: () => localStorage.setItem(ASIDE_KEY, String(asideWidth.value)),
  });

const dragSend = (e: MouseEvent) =>
  startDrag(e, "y", {
    min: 140,
    max: Math.round(window.innerHeight * 0.7),
    invert: true, // 分隔条在面板上缘：向上拖 = 变大
    refValue: () => sendHeight.value,
    apply: (v) => (sendHeight.value = v),
    save: () => localStorage.setItem(PANEL_KEY, String(sendHeight.value)),
  });

const resetAside = () => {
  asideWidth.value = ASIDE_DEFAULT;
  localStorage.setItem(ASIDE_KEY, String(ASIDE_DEFAULT));
};
const resetSend = () => {
  sendHeight.value = PANEL_DEFAULT;
  localStorage.setItem(PANEL_KEY, String(PANEL_DEFAULT));
};

onMounted(() => {
  // 窗口过小时收紧钳制
  window.addEventListener("resize", () => {
    sendHeight.value = clamp(sendHeight.value, 140, Math.round(window.innerHeight * 0.7));
  });
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <img class="logo" src="/icon.svg" alt="CommProbe" />
      <span class="brand">CommProbe</span>
      <span class="badge" :class="{ ok: state.wsReady }">{{ wsBadge }}</span>
      <span v-if="state.lastError" class="error-banner">{{ state.lastError }}</span>
    </header>
    <div class="body">
      <aside :style="{ width: asideWidth + 'px' }">
        <ConnectionPanel />
        <ChecksumPanel />
      </aside>
      <div
        class="divider-v"
        title="拖动调宽，双击复位"
        @mousedown="dragAside"
        @dblclick="resetAside"
      />
      <main>
        <LogPanel />
        <div
          class="divider-h"
          title="拖动调高，双击复位"
          @mousedown="dragSend"
          @dblclick="resetSend"
        />
        <div class="send-wrap" :style="{ height: sendHeight + 'px' }">
          <SendPanel />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.logo {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.brand {
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.5px;
}
.badge {
  color: var(--text-dim);
}
.badge.ok {
  color: var(--in);
}
.error-banner {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, transparent);
  border: 1px solid var(--error);
  border-radius: 4px;
  padding: 2px 8px;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
aside {
  background: var(--panel);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex-shrink: 0;
}
.divider-v {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}
.divider-v:hover {
  background: var(--accent);
}
main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.divider-h {
  height: 5px;
  flex-shrink: 0;
  cursor: row-resize;
  background: transparent;
  transition: background 0.15s;
  border-top: 1px solid var(--border);
}
.divider-h:hover {
  background: var(--accent);
}
.send-wrap {
  flex-shrink: 0;
  min-height: 0;
}
</style>
