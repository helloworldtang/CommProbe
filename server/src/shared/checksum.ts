/**
 * 常用校验算法的纯函数实现：CRC16（Modbus / CCITT-FALSE / XMODEM）、SUM8、XOR8。
 * 输入 Uint8Array，输出数值与 hex 表示。
 */

export type ChecksumAlgorithm =
  "crc16-modbus" | "crc16-ccitt-false" | "crc16-xmodem" | "sum8" | "xor8";

export interface ChecksumSpec {
  label: string;
  widthBits: 8 | 16;
  /** 供联调对照的算法参数描述 */
  detail: string;
}

export const CHECKSUM_ALGORITHMS: Record<ChecksumAlgorithm, ChecksumSpec> = {
  "crc16-modbus": {
    label: "CRC16-Modbus",
    widthBits: 16,
    detail: "poly=0x8005(反射0xA001) init=0xFFFF refin/refout=true xorout=0",
  },
  "crc16-ccitt-false": {
    label: "CRC16-CCITT-FALSE",
    widthBits: 16,
    detail: "poly=0x1021 init=0xFFFF refin/refout=false xorout=0",
  },
  "crc16-xmodem": {
    label: "CRC16-XMODEM",
    widthBits: 16,
    detail: "poly=0x1021 init=0x0000 refin/refout=false xorout=0",
  },
  sum8: { label: "SUM8 累加和", widthBits: 8, detail: "所有字节求和取低 8 位" },
  xor8: { label: "XOR8 异或", widthBits: 8, detail: "所有字节异或" },
};

function crc16(bytes: Uint8Array, poly: number, init: number, reflected: boolean): number {
  let crc = init;
  for (const b of bytes) {
    if (reflected) {
      crc ^= b;
      for (let i = 0; i < 8; i++) {
        crc = crc & 1 ? (crc >> 1) ^ poly : crc >> 1;
      }
    } else {
      crc ^= b << 8;
      for (let i = 0; i < 8; i++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ poly) & 0xffff : (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/** 计算校验值；crc16-modbus 内部按反射多项式 0xA001 处理 */
export function checksum(algorithm: ChecksumAlgorithm, bytes: Uint8Array): number {
  switch (algorithm) {
    case "crc16-modbus":
      return crc16(bytes, 0xa001, 0xffff, true);
    case "crc16-ccitt-false":
      return crc16(bytes, 0x1021, 0xffff, false);
    case "crc16-xmodem":
      return crc16(bytes, 0x1021, 0x0000, false);
    case "sum8": {
      let sum = 0;
      for (const b of bytes) sum = (sum + b) & 0xff;
      return sum;
    }
    case "xor8": {
      let v = 0;
      for (const b of bytes) v ^= b;
      return v;
    }
  }
}

/** 校验值 → 大写 hex（16 位 4 字符，8 位 2 字符） */
export function checksumHex(algorithm: ChecksumAlgorithm, bytes: Uint8Array): string {
  const value = checksum(algorithm, bytes);
  const width = CHECKSUM_ALGORITHMS[algorithm].widthBits === 16 ? 4 : 2;
  return value.toString(16).toUpperCase().padStart(width, "0");
}
