<script setup lang="ts">
import { computed, watch } from "vue";

import ChecksumPanel from "./components/ChecksumPanel.vue";
import ConnectionPanel from "./components/ConnectionPanel.vue";
import LogPanel from "./components/LogPanel.vue";
import SendPanel from "./components/SendPanel.vue";
import { state } from "./store";

const wsBadge = computed(() =>
  state.wsReady ? `内核已连接 v${state.serverVersion}` : "内核连接中…",
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
</script>

<template>
  <div class="app">
    <header class="topbar">
      <span class="brand">CommProbe</span>
      <span class="badge" :class="{ ok: state.wsReady }">{{ wsBadge }}</span>
      <span v-if="state.lastError" class="error-banner">{{ state.lastError }}</span>
    </header>
    <div class="body">
      <aside>
        <ConnectionPanel />
        <ChecksumPanel />
      </aside>
      <main>
        <LogPanel />
        <SendPanel />
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
  display: grid;
  grid-template-columns: 300px 1fr;
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
}
main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
</style>
