import { Packed, toHex, fromHex } from './binary';

export type ProtocolVersion = 1 | 2 | 3;

export interface MessageHeader {
  correlationId: string;
  version: ProtocolVersion;
  schema: string;
}

export interface Message<T = unknown> {
  header: MessageHeader;
  body: T;
  signature?: string;
}

export interface Codec<T> {
  pack(value: Message<T>): Packed;
  unpack(raw: Packed): Message<T>;
}

export class JsonCodec<T> implements Codec<T> {
  pack(value: Message<T>): Packed {
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(value)));
    return { bytes: bytes as any, schema: value.header.schema };
  }

  unpack(raw: Packed): Message<T> {
    const text = new TextDecoder().decode(Uint8Array.from(raw.bytes as number[]));
    return JSON.parse(text) as Message<T>;
  }
}

export function sign(value: string, salt: string): string {
  return toHex(Array.from(new TextEncoder().encode(value + salt)) as any);
}

export function verify(value: string, salt: string, signature: string): boolean {
  return sign(value, salt) === signature;
}

export function parseSignature(raw: string): number[] {
  return Array.from(fromHex(raw)).map((byte) => byte * 1);
}
