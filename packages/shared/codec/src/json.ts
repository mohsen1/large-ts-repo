import { Packed } from './binary';

export interface Envelope<T> {
  id: string;
  timestamp: string;
  payload: T;
}

export interface MessageSchema {
  type: string;
  version: number;
  required: readonly string[];
}

export function serialize<T>(value: Envelope<T>): string {
  return JSON.stringify(value);
}

export function deserialize<T>(input: string): Envelope<T> {
  return JSON.parse(input) as Envelope<T>;
}

export function safeStringify<T>(value: T): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

export function fromPacked<T>(packed: Packed, reviver?: (key: string, value: unknown) => unknown): T {
  const text = new TextDecoder().decode(new Uint8Array(packed.bytes as number[]));
  return JSON.parse(text, reviver) as T;
}

export function toPacked(value: unknown): Packed {
  const bytes = Array.from(new TextEncoder().encode(JSON.stringify(value))) as number[];
  return { bytes: bytes as any, schema: 'json' };
}
