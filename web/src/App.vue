<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import AppSelect from "./components/AppSelect.vue";
import ChecksumPanel from "./components/ChecksumPanel.vue";
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

/* ---- 主题：跟随系统（默认）/ 亮 / 暗——解析结果落到 <html data-theme>，CSS 只认结果 ---- */

type ThemeChoice = "auto" | "light" | "dark";
const THEME_KEY = "commprobe.theme";
const theme = ref<ThemeChoice>((localStorage.getItem(THEME_KEY) as ThemeChoice) || "auto");
const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(): void {
  const resolved = theme.value === "auto" ? (darkMedia.matches ? "dark" : "light") : theme.value;
  document.documentElement.dataset.theme = resolved;
  // 浏览器标签页 favicon 同步跟随主题
  document.querySelector<HTMLLinkElement>("link[rel='icon']")?.setAttribute(
    "href",
    resolved === "light" ? "/icon-light.svg" : "/icon.svg",
  );
}
watch(theme, () => {
  localStorage.setItem(THEME_KEY, theme.value);
  applyTheme();
});
darkMedia.addEventListener("change", () => {
  if (theme.value === "auto") applyTheme();
});
applyTheme();

/* ---- 操作台停靠：Chrome DevTools 式 底/左/右 三选，分段图标控件 ---- */

type Dock = "bottom" | "left" | "right";
const DOCK_KEY = "commprobe.layout.dock";
const dock = ref<Dock>((localStorage.getItem(DOCK_KEY) as Dock) || "bottom");
watch(dock, () => localStorage.setItem(DOCK_KEY, dock.value));

/* ---- 校验计算器：低频工具，收进顶栏浮层，不占主界面 ---- */
const checksumOpen = ref(false);

/* ---- 可拖拽面板（业界惯例：拖动调大小 / 双击复位 / 尺寸记忆，同 VS Code） ---- */

const PANEL_KEY = "commprobe.layout.sendHeight2";
/** 操作带默认占视口 1/3——配置+组帧是主战场，不该被日志挤成一条 */
const defaultPanelHeight = () => Math.max(Math.round(window.innerHeight / 3), 240);

function loadNum(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const sendHeight = ref(loadNum(PANEL_KEY, defaultPanelHeight()));

/* 侧边停靠时的宽度（独立于底部高度） */
const SIDE_KEY = "commprobe.layout.sendWidth";
const SIDE_DEFAULT = 480;
const sendWidth = ref(loadNum(SIDE_KEY, SIDE_DEFAULT));

const resetSide = () => {
  sendWidth.value = SIDE_DEFAULT;
  localStorage.setItem(SIDE_KEY, String(SIDE_DEFAULT));
};
const dragSideLeft = (e: MouseEvent) =>
  startDrag(e, "x", {
    min: 360,
    max: Math.round(window.innerWidth * 0.6),
    invert: false, // 操作台在左：向右拖 = 变宽
    refValue: () => sendWidth.value,
    apply: (v) => (sendWidth.value = v),
    save: () => localStorage.setItem(SIDE_KEY, String(sendWidth.value)),
  });
const dragSideRight = (e: MouseEvent) =>
  startDrag(e, "x", {
    min: 360,
    max: Math.round(window.innerWidth * 0.6),
    invert: true, // 操作台在右：向左拖 = 变宽
    refValue: () => sendWidth.value,
    apply: (v) => (sendWidth.value = v),
    save: () => localStorage.setItem(SIDE_KEY, String(sendWidth.value)),
  });

/* DevTools 式收起：收起时操作带缩成一条；拖拽条也收掉；状态持久化——重开延续上次的布局习惯 */
const COLLAPSE_KEY = "commprobe.layout.sendCollapsed";
const sendCollapsed = ref(localStorage.getItem(COLLAPSE_KEY) === "1");
watch(sendCollapsed, (v) => localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"));

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

const dragSend = (e: MouseEvent) =>
  startDrag(e, "y", {
    min: 140,
    max: Math.round(window.innerHeight * 0.7),
    invert: true, // 分隔条在面板上缘：向上拖 = 变大
    refValue: () => sendHeight.value,
    apply: (v) => (sendHeight.value = v),
    save: () => localStorage.setItem(PANEL_KEY, String(sendHeight.value)),
  });

const resetSend = () => {
  sendHeight.value = defaultPanelHeight();
  localStorage.setItem(PANEL_KEY, String(sendHeight.value));
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
      <!-- 图标内联：三色走 design token，随主题切换（静态 icon.svg 仅作 favicon） -->
      <svg class="logo" viewBox="0 0 64 64" aria-label="CommProbe">
        <circle cx="32" cy="32" r="30" fill="var(--panel-2)" stroke="var(--border)" />
        <path
          d="M10 38 C 18 38, 18 22, 28 22 S 38 42, 48 42"
          stroke="var(--text-dim)"
          stroke-width="5"
          fill="none"
          stroke-linecap="round"
        />
        <circle cx="48" cy="42" r="4" fill="var(--accent)" />
      </svg>
      <span class="brand">CommProbe</span>
      <span class="badge" :class="{ ok: state.wsReady }">{{ wsBadge }}</span>
      <span v-if="state.lastError" class="error-banner">{{ state.lastError }}</span>
      <span class="spacer" />
      <!-- DevTools 式停靠位置：分段图标控件，选中项亮主题色 -->
      <div class="dock-seg" role="radiogroup" aria-label="操作台停靠位置">
        <button
          type="button"
          role="radio"
          :aria-checked="dock === 'left'"
          :class="{ on: dock === 'left' }"
          title="操作台停靠左侧"
          @click="dock = 'left'"
        >
          <svg viewBox="0 0 16 16" width="15" height="15"><rect x="1" y="2" width="14" height="12" rx="2" fill="none" stroke="currentColor" /><rect x="3" y="4" width="4" height="8" rx="1" fill="currentColor" /></svg>
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="dock === 'bottom'"
          :class="{ on: dock === 'bottom' }"
          title="操作台停靠底部"
          @click="dock = 'bottom'"
        >
          <svg viewBox="0 0 16 16" width="15" height="15"><rect x="1" y="2" width="14" height="12" rx="2" fill="none" stroke="currentColor" /><rect x="3" y="10" width="10" height="2.5" rx="1" fill="currentColor" /></svg>
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="dock === 'right'"
          :class="{ on: dock === 'right' }"
          title="操作台停靠右侧"
          @click="dock = 'right'"
        >
          <svg viewBox="0 0 16 16" width="15" height="15"><rect x="1" y="2" width="14" height="12" rx="2" fill="none" stroke="currentColor" /><rect x="9" y="4" width="4" height="8" rx="1" fill="currentColor" /></svg>
        </button>
      </div>
      <AppSelect
        v-model="theme"
        class="theme"
        title="界面主题"
        :options="[
          { value: 'auto', label: '跟随系统' },
          { value: 'dark', label: '暗色' },
          { value: 'light', label: '亮色' },
        ]"
      />
      <div class="pop-wrap">
        <button :class="{ on: checksumOpen }" @click="checksumOpen = !checksumOpen">
          校验计算器
        </button>
        <div v-if="checksumOpen" class="overlay" @click="checksumOpen = false" />
        <div v-if="checksumOpen" class="pop">
          <ChecksumPanel />
        </div>
      </div>
    </header>
    <div class="body">
      <main class="main" :class="`dock-${dock}`">
        <!-- 停靠左侧：操作台在左，日志在右 -->
        <template v-if="dock === 'left'">
          <div class="send-wrap" :style="{ width: sendWidth + 'px' }">
            <SendPanel :collapsed="false" :dock="dock" />
          </div>
          <div
            class="divider-v"
            title="拖动调宽，双击复位"
            @mousedown="dragSideLeft"
            @dblclick="resetSide"
          />
          <LogPanel />
        </template>

        <!-- 停靠右侧：日志在左，操作台在右 -->
        <template v-else-if="dock === 'right'">
          <LogPanel />
          <div
            class="divider-v"
            title="拖动调宽，双击复位"
            @mousedown="dragSideRight"
            @dblclick="resetSide"
          />
          <div class="send-wrap" :style="{ width: sendWidth + 'px' }">
            <SendPanel :collapsed="false" :dock="dock" />
          </div>
        </template>

        <!-- 停靠底部（默认）：日志在上，操作台在下，可收起 -->
        <template v-else>
          <LogPanel />
          <div
            v-if="!sendCollapsed"
            class="divider-h"
            title="拖动调高，双击复位"
            @mousedown="dragSend"
            @dblclick="resetSend"
          />
          <div
            class="send-wrap"
            :style="{ height: sendCollapsed ? '38px' : sendHeight + 'px' }"
          >
            <SendPanel
              :collapsed="sendCollapsed"
              :dock="dock"
              @expand="sendCollapsed = false"
              @collapse="sendCollapsed = true"
            />
          </div>
        </template>
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
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-s);
  padding: 2px 8px;
}
.spacer {
  flex: 1;
}
.theme {
  flex-shrink: 0;
}
.pop-wrap {
  position: relative;
}
.pop-wrap .on {
  border-color: var(--accent);
  color: var(--accent);
}
/* 弹层皮肤在全局 style.css（.pop/.overlay），这里只补定位与内边距 */
.pop {
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  padding: 8px 12px 12px;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
/* 停靠分段控件：Chrome DevTools 式图标组，选中项亮主题色 */
.dock-seg {
  display: flex;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  padding: 2px;
}
.dock-seg button {
  border: none;
  background: none;
  padding: 2px 5px;
  color: var(--text-dim);
  display: flex;
  align-items: center;
}
.dock-seg button:hover {
  border: none;
  color: var(--text);
  background: var(--panel-2);
}
.dock-seg .on {
  color: var(--accent);
}
main {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.main.dock-bottom {
  flex-direction: column;
}
.main.dock-left,
.main.dock-right {
  flex-direction: row;
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
