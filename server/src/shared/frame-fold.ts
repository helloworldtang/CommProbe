/**
 * 帧折叠的纯函数内核：按"内容 + 时间间隔窗口"聚合。
 * 相同 key 的帧，相邻两次的间隔 <= windowMs 才并进同组；超窗自动断开新组。
 * 这样高频心跳折叠成一行，而心跳中断/恢复（间隔超窗）会产生新组，时间维度保留。
 */

export interface FoldEntry {
  key: string;
  ts: number;
}

export interface FoldGroup<T extends FoldEntry> {
  key: string;
  firstTs: number;
  lastTs: number;
  count: number;
  items: T[];
}

/**
 * 输入必须按 ts 升序（帧流天然如此）。
 * windowMs <= 0 时退化为"每帧独立成组"（不折叠）。
 */
export function foldByGap<T extends FoldEntry>(entries: T[], windowMs: number): FoldGroup<T>[] {
  const groups: FoldGroup<T>[] = [];
  const open = new Map<string, FoldGroup<T>>();
  for (const entry of entries) {
    const existing = open.get(entry.key);
    if (existing && entry.ts - existing.lastTs <= windowMs) {
      existing.lastTs = entry.ts;
      existing.count += 1;
      existing.items.push(entry);
    } else {
      const group: FoldGroup<T> = {
        key: entry.key,
        firstTs: entry.ts,
        lastTs: entry.ts,
        count: 1,
        items: [entry],
      };
      groups.push(group);
      open.set(entry.key, group);
    }
  }
  return groups;
}
