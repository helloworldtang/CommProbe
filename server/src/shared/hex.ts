/**
 * hex 与文本编解码的纯函数集，浏览器与 Node 通用（仅依赖 Web 标准 API）。
 */

/** 去掉分隔符（空格/冒号/逗号/换行），返回大写 hex 串；非 hex 字符一律剔除 */
export function normalizeHex(input: string): string {
  return input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/** hex 字符串 → Uint8Array；长度为奇数或含非法字符时抛错 */
export function parseHex(input: string): Uint8Array {
  const normalized = normalizeHex(input);
  if (normalized.length % 2 !== 0) {
    throw new Error(`hex 长度必须为偶数：${normalized}`);
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Uint8Array → 大写 hex，默认每字节空格分隔 */
export function toHex(bytes: Uint8Array, sep = " "): string {
  const out: string[] = [];
  for (const b of bytes) {
    out.push(b.toString(16).toUpperCase().padStart(2, "0"));
  }
  return out.join(sep);
}

/** 字节 → 可显示文本：按给定编码解码，不可打印字符替换为 · */
export function decodeText(bytes: Uint8Array, encoding: "utf-8" | "gbk"): string {
  const decoded = new TextDecoder(encoding).decode(bytes);
  let out = "";
  for (const ch of decoded) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 0x20 && code !== 0x7f ? ch : "·";
  }
  return out;
}

/**
 * 文本 → 字节。GBK 编码无 Web 标准 API，统一走服务端 encode.ts（iconv-lite）；
 * 本函数仅支持 UTF-8，供 web 侧本地预览用。
 */
export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
