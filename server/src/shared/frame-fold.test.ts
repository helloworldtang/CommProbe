import assert from "node:assert/strict";
import { test } from "node:test";

import { foldByGap } from "./frame-fold.js";

const WINDOW = 30_000;
const e = (key: string, ts: number) => ({ key, ts });

test("间隔在窗口内的相同帧合并为一组", () => {
  const groups = foldByGap([e("hb", 0), e("hb", 3000), e("hb", 6000)], WINDOW);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].firstTs, 0);
  assert.equal(groups[0].lastTs, 6000);
});

test("夹杂其它帧不打断合并（时间维度才是判据）", () => {
  const groups = foldByGap([e("hb", 0), e("biz", 1500), e("hb", 3000)], WINDOW);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.key === "hb")?.count, 2);
});

test("间隔超窗自动断开新组（心跳中断可见）", () => {
  const groups = foldByGap([e("hb", 0), e("hb", 3000), e("hb", 60_000)], WINDOW);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.firstTs),
    [0, 60_000],
  );
});

test("不同 key 互不影响分组", () => {
  const groups = foldByGap([e("a", 0), e("b", 1000), e("a", 2000), e("b", 3000)], WINDOW);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.key === "a")?.count, 2);
  assert.equal(groups.find((g) => g.key === "b")?.count, 2);
});

test("windowMs <= 0 时每帧独立成组（不折叠）", () => {
  const groups = foldByGap([e("hb", 0), e("hb", 1000)], 0);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 1);
});
