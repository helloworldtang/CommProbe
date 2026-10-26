import assert from "node:assert/strict";
import { test } from "node:test";

import { isNoisePort } from "./serial.js";

test("识别 macOS 内置噪声口", () => {
  assert.equal(isNoisePort("/dev/tty.Bluetooth-Incoming-Port"), true);
  assert.equal(isNoisePort("/dev/tty.debug-console"), true);
});

test("真实 USB 串口设备不误伤", () => {
  assert.equal(isNoisePort("/dev/tty.usbserial-1420"), false);
  assert.equal(isNoisePort("/dev/cu.usbmodem2101"), false);
  assert.equal(isNoisePort("/dev/ttyUSB0"), false);
  assert.equal(isNoisePort("COM3"), false);
});
