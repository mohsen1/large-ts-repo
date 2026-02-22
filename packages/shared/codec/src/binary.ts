export type Byte = number & { readonly __byte: true };

export interface Packed {
  bytes: readonly Byte[];
  schema: string;
}

export function toHex(bytes: readonly Byte[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(input: string): readonly Byte[] {
  const out: Byte[] = [];
  for (let i = 0; i + 1 < input.length; i += 2) {
    const hex = input.slice(i, i + 2);
    out.push((Number.parseInt(hex, 16) as Byte));
  }
  return out;
}

export function encodeBool(value: boolean): readonly Byte[] {
  return [value ? (1 as Byte) : (0 as Byte)];
}

export function encodeNumber(value: number): readonly Byte[] {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return Array.from(new Uint8Array(buffer)) as Byte[];
}

export function encodeString(value: string): readonly Byte[] {
  const bytes = Array.from(new TextEncoder().encode(value)) as Byte[];
  const len = encodeNumber(bytes.length);
  return [...len, ...bytes];
}

export function decodeBool(bytes: readonly Byte[], offset = 0): [boolean, number] {
  return [bytes[offset] !== 0, offset + 1];
}

export function decodeNumber(bytes: readonly Byte[], offset = 0): [number, number] {
  const buffer = new ArrayBuffer(8);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < 8; i += 1) view[i] = bytes[offset + i];
  const out = new DataView(buffer).getFloat64(0, true);
  return [out, offset + 8];
}

export function decodeString(bytes: readonly Byte[], offset = 0): [string, number] {
  const [size, afterSize] = decodeNumber(bytes, offset);
  const end = afterSize + size;
  const slice = bytes.slice(afterSize, end);
  return [new TextDecoder().decode(Uint8Array.from(slice)), end];
}
