<script setup lang="ts">
import { computed, ref } from "vue";

import {
  CHECKSUM_ALGORITHMS,
  checksumHex,
  type ChecksumAlgorithm,
} from "../../../server/src/shared/checksum";
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
      <select v-model="algo">
        <option v-for="(spec, key) in CHECKSUM_ALGORITHMS" :key="key" :value="key">
          {{ spec.label }}
        </option>
      </select>
    </div>
    <div class="row">
      <select v-model="inputMode">
        <option value="hex">HEX</option>
        <option value="text">文本(UTF-8)</option>
      </select>
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
.row select {
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
