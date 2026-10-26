<script setup lang="ts" generic="T extends string | number">
import { computed, onUnmounted, ref } from "vue";

/**
 * 自绘下拉：原生 <select> 的弹出菜单由操作系统绘制，CSS（option 配色 / color-scheme）
 * 管不进去、不随主题——这里完全自绘，配色全走 design token。
 */

const props = defineProps<{
  modelValue: T | "";
  options: { value: T; label: string }[];
  /** modelValue 不在 options 里时显示的占位（如「无连接」） */
  placeholder?: string;
  title?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [T] }>();

const open = ref(false);
const rootEl = ref<HTMLElement>();

const selected = computed(() => props.options.find((o) => o.value === props.modelValue));

function onDocClick(e: MouseEvent): void {
  if (open.value && !rootEl.value?.contains(e.target as Node)) open.value = false;
}
document.addEventListener("click", onDocClick);
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div ref="rootEl" class="app-select" :title="title">
    <button
      type="button"
      class="sel-btn"
      :class="{ open, disabled }"
      :disabled="disabled"
      @click="open = !open"
    >
      <span :class="{ ph: !selected }">{{ selected?.label ?? placeholder ?? "—" }}</span>
      <span class="caret">▾</span>
    </button>
    <div v-if="open" class="menu">
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        class="opt"
        :class="{ on: o.value === modelValue }"
        @click="emit('update:modelValue', o.value); open = false"
      >
        <span class="check">{{ o.value === modelValue ? "✓" : "" }}</span>
        <span>{{ o.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-select {
  position: relative;
  display: inline-flex;
  min-width: 0;
}
.sel-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  text-align: left;
}
.sel-btn.open {
  border-color: var(--accent);
}
.caret {
  font-size: 10px;
  color: var(--text-dim);
}
.ph {
  color: var(--text-dim);
}
.menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 30;
  min-width: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  box-shadow: var(--shadow-pop);
  white-space: nowrap;
}
.opt {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 4px 8px;
  border-radius: var(--radius-s);
  text-align: left;
  color: var(--text);
}
.opt:hover {
  background: var(--panel-2);
  border-color: transparent;
}
.opt.on {
  color: var(--accent);
}
.check {
  width: 12px;
  flex-shrink: 0;
  font-size: 11px;
}
</style>
