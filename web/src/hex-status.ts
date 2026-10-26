/**
 * 发送输入的实时分析：字节视图与 CRC16 尾缀核对。纯函数，供发送面板复用。
 */

import { checksumHex } from "../../server/src/shared/checksum";
import { normalizeHex } from "../../server/src/shared/hex";

export interface HexAnalysis {
  /** 完整字节（两位大写，按序） */
  bytes: string[];
  /** 悬空半字节：非空说明帧不完整（缺半个字节） */
  danglingNibble: string;
  /** 末 2 字节与 CRC16-Modbus 线上序（低字节在前）的比对；帧不完整或不足 3 字节时为 null */
  crcTail: { match: boolean; expected: string } | null;
}

/** 分析一段 HEX 输入；无有效字符时返回 null */
export function analyzeHex(content: string): HexAnalysis | null {
  const normalized = normalizeHex(content);
  if (!normalized) return null;
  const complete = normalized.length % 2 === 0;
  const usable = complete ? normalized : normalized.slice(0, -1);
  const bytes: string[] = [];
  for (let i = 0; i < usable.length; i += 2) bytes.push(usable.slice(i, i + 2));

  let crcTail: HexAnalysis["crcTail"] = null;
  if (complete && bytes.length >= 3) {
    const body = Uint8Array.from(bytes.slice(0, -2), (h) => Number.parseInt(h, 16));
    const value = checksumHex("crc16-modbus", body);
    const expected = `${value.slice(2)} ${value.slice(0, 2)}`;
    crcTail = { match: expected === `${bytes.at(-2)} ${bytes.at(-1)}`, expected };
  }
  return {
    bytes,
    danglingNibble: complete ? "" : normalized.slice(-1),
    crcTail,
  };
}

/** 用正确的 CRC 尾缀替换末 2 字节；帧不完整或不足 3 字节时原样返回 */
export function fixCrcTail(content: string): string {
  const a = analyzeHex(content);
  if (!a || a.danglingNibble || !a.crcTail || a.crcTail.match) return content;
  return `${a.bytes.slice(0, -2).join(" ")} ${a.crcTail.expected}`.trim();
}

/**
 * 敲入/粘贴即清洗：0x 前缀与各类分隔符归一为空格，其余字符（全角、中文等）当场剔除。
 * 清洗后只剩 hex 字符与单空格——输入框里永远不存在"看不见的坑"。
 */
export function sanitizeHexInput(v: string): string {
  return v
    .replace(/[\s,，、;；:：\-_.　]+/g, " ")
    .replace(/0[xX](?=[0-9a-fA-F])/g, "")
    .replace(/[^0-9a-fA-F ]/g, "")
    .replace(/ +/g, " ");
}
