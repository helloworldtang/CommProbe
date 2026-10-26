<script setup lang="ts">
import { computed, ref } from "vue";

import {
  CHECKSUM_ALGORITHMS,
  checksumHex,
  type ChecksumAlgorithm,
} from "../../../server/src/shared/checksum";
import AppSelect from "./AppSelect.vue";

const algoOptions = Object.entries(CHECKSUM_ALGORITHMS).map(([value, spec]) => ({
  value: value as ChecksumAlgorithm,
  label: spec.label,
}));
import { encodeUtf8, parseHex } from "../../../server/src/shared/hex";

const algo = ref<ChecksumAlgorithm>("crc16-modbus");
const inputMode = ref<"hex" | "text">("hex");
const input = ref("");

const result = computed(() => {
  if (input.value.trim() === "") return "";
  try {
    const bytes = inputMode.value === "hex" ? parseHex(input.value) : encodeUtf8(input.value);
    return checksumHex(algo.value, bytes);
  } catch (err) {
    return `⚠ ${(err as Error).message}`;
  }
});

/** Modbus 线上序：CRC 低字节在前。数值序 0BC4 对应线上 C4 0B */
const wireOrder = computed(() => {
  if (algo.value !== "crc16-modbus") return "";
  const v = result.value;
  if (v.length !== 4) return "";
  return `${v.slice(2)} ${v.slice(0, 2)}`;
});

async function copy(): Promise<void> {
  if (result.value && !result.value.startsWith("⚠")) {
    await navigator.clipboard.writeText(result.value);
  }
}
</script>

<template>
  <section>
    <h2>校验计算器</h2>
    <div class="row">
      <AppSelect v-model="algo" :options="algoOptions" />
    </div>
    <div class="row">
      <AppSelect
        v-model="inputMode"
        :options="[
          { value: 'hex', label: 'HEX' },
          { value: 'text', label: '文本(UTF-8)' },
        ]"
      />
    </div>
    <div class="row">
      <textarea
        v-model="input"
        rows="3"
        :placeholder="inputMode === 'hex' ? '01 03 00 00 …' : '待校验文本'"
      ></textarea>
    </div>
    <div class="result-row">
      <code class="result">{{ result || "—" }}</code>
      <button @click="copy">复制</button>
    </div>
    <p v-if="wireOrder" class="dim">Modbus 线上序（低字节在前）：{{ wireOrder }}</p>
    <p class="dim">{{ CHECKSUM_ALGORITHMS[algo].detail }}</p>
  </section>
</template>

<style scoped>
h2 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--accent);
}
.row {
  margin-bottom: 6px;
}
.row .app-select {
  width: 100%;
}
textarea {
  width: 100%;
  resize: vertical;
}
.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
.result {
  flex: 1;
  font-size: 16px;
  font-weight: 700;
  color: var(--in);
  word-break: break-all;
}
.dim {
  color: var(--text-dim);
  font-size: 12px;
  margin: 4px 0 0;
}
</style>
