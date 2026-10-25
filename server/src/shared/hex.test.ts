import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeText, normalizeHex, parseHex, toHex } from "./hex.js";

test("normalizeHex 剔除空格冒号逗号换行", () => {
  assert.equal(normalizeHex("08 00:02,15\naa"), "08000215AA");
});

test("parseHex 奇数长度抛错", () => {
  assert.throws(() => parseHex("0A0"), /偶数/);
});

test("parseHex/toHex 往返一致", () => {
  const bytes = parseHex("01 03 00 00");
  assert.deepEqual([...bytes], [0x01, 0x03, 0x00, 0x00]);
  assert.equal(toHex(bytes), "01 03 00 00");
});

test("decodeText 不可打印字符替换为 ·", () => {
  const bytes = parseHex("41 00 42"); // A \0 B
  assert.equal(decodeText(bytes, "utf-8"), "A·B");
});

test("decodeText GBK 中文", () => {
  // “通信” 的 GBK 编码
  const bytes = parseHex("CD A8 D0 C5");
  assert.equal(decodeText(bytes, "gbk"), "通信");
});
