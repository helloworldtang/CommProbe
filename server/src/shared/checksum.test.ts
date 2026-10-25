import assert from "node:assert/strict";
import { test } from "node:test";

import { checksumHex } from "./checksum.js";
import { parseHex } from "./hex.js";

test("crc16-modbus 与标准测试向量一致", () => {
  // "123456789" 的 Modbus CRC = 0x4B37
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(checksumHex("crc16-modbus", bytes), "4B37");
});

test("crc16-ccitt-false 与标准测试向量一致", () => {
  // "123456789" 的 CRC-16/CCITT-FALSE = 0x29B1
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(checksumHex("crc16-ccitt-false", bytes), "29B1");
});

test("crc16-xmodem 与标准测试向量一致", () => {
  // "123456789" 的 CRC-16/XMODEM = 0x31C3
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(checksumHex("crc16-xmodem", bytes), "31C3");
});

test("sum8 与 xor8", () => {
  const bytes = parseHex("01 02 03 04");
  assert.equal(checksumHex("sum8", bytes), "0A");
  assert.equal(checksumHex("xor8", bytes), "04");
});

test("空输入的 crc 初值语义", () => {
  assert.equal(checksumHex("crc16-modbus", new Uint8Array(0)), "FFFF");
  assert.equal(checksumHex("crc16-xmodem", new Uint8Array(0)), "0000");
});
