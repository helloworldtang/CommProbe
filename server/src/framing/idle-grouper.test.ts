import assert from "node:assert/strict";
import { test } from "node:test";

import { IdleGrouper } from "./idle-grouper.js";

function setup(idleMs = 20) {
  const frames: { data: Buffer; peer?: string }[] = [];
  const grouper = new IdleGrouper(idleMs, (data, peer) => frames.push({ data, peer }));
  return { grouper, frames };
}

test("静默超时后吐出一帧（含对端）", async () => {
  const { grouper, frames } = setup(20);
  grouper.push(Buffer.from([0x08]), "peer:1");
  grouper.push(Buffer.from([0x00, 0x02]));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(frames.length, 1);
  assert.deepEqual([...frames[0].data], [0x08, 0x00, 0x02]);
  assert.equal(frames[0].peer, "peer:1");
});

test("间隔到达的字节被切成多帧", async () => {
  const { grouper, frames } = setup(20);
  grouper.push(Buffer.from([0x01]));
  await new Promise((r) => setTimeout(r, 50));
  grouper.push(Buffer.from([0x02]));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(frames.length, 2);
});

test("dispose 立即吐出未静默的残留", () => {
  const { grouper, frames } = setup(1000);
  grouper.push(Buffer.from([0xaa]));
  grouper.dispose();
  assert.equal(frames.length, 1);
  // dispose 后不再接收
  grouper.push(Buffer.from([0xbb]));
  assert.equal(frames.length, 1);
});
