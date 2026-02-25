import type { JsonValue } from '@shared/type-level';
import { parseEnvelope } from './events';
import { createHash } from 'node:crypto';

export interface Bundle<TValue extends JsonValue> {
  readonly version: `v${number}`;
  readonly payload: TValue;
  readonly checksum: string;
}

const checksumOf = (value: JsonValue): string => {
  const valueHash = createHash('sha256');
  valueHash.update(JSON.stringify(value));
  return valueHash.digest('hex').slice(0, 16);
};

export const encodeBundle = <TValue extends JsonValue>(value: TValue): Bundle<TValue> => ({
  version: 'v1',
  payload: value,
  checksum: checksumOf(value),
});

export const encodePayload = <TValue extends JsonValue>(value: TValue): string => JSON.stringify(encodeBundle(value), null, 2);

export const parseBundle = <TValue extends JsonValue>(value: string): Bundle<TValue> => {
  const parsed = parseEnvelope<TValue>(JSON.parse(value));
  return parsed;
};

export const decodePayload = <TValue extends JsonValue>(raw: string): TValue => {
  const envelope = parseBundle<TValue>(raw);
  return envelope.payload;
};

export const roundTrip = async (value: JsonValue): Promise<JsonValue> => {
  const encoded = encodePayload(value);
  const decoded = decodePayload(encoded);
  return decoded;
};
