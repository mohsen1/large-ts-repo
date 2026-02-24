import type { NoInfer } from '@shared/type-level';
import { PluginByKind, PluginEnvelope, PluginKind } from './plugin';
import { withBrand } from '@shared/core';
import type { BrandedTimestamp } from './ids';

export type AdapterKind = 'json' | 'avro' | 'protobuf' | 'eventbridge';
export type AdapterTransport = `transport:${AdapterKind}`;

export interface LatticeRecord<T = unknown> {
  readonly tenant: string;
  readonly streamId: string;
  readonly at: BrandedTimestamp;
  readonly payload: T;
}

export interface AdapterContext {
  readonly adapterId: string;
  readonly region: string;
  readonly transport: AdapterTransport;
}

export interface AdapterCodec<TInput = unknown, TOutput = unknown> {
  readonly kind: AdapterKind;
  encode(input: TInput, context: AdapterContext): Promise<string>;
  decode(raw: string, context: AdapterContext): Promise<TOutput>;
}

export interface AdapterSpec<TInput = unknown, TOutput = unknown> {
  readonly codec: AdapterCodec<TInput, TOutput>;
  readonly plugin?: PluginByKind<readonly PluginEnvelope<unknown, unknown, PluginKind>[], 'transform'>;
  readonly options: Readonly<Record<string, string>>;
}

export const normalizeTransport = (kind: AdapterKind): AdapterTransport => `transport:${kind}`;

export const makeAdapterRecord = <T>(
  tenant: string,
  streamId: string,
  payload: T,
): LatticeRecord<T> => {
  return {
    tenant,
    streamId,
    at: withBrand(new Date().toISOString(), 'lattice-timestamp') as BrandedTimestamp,
    payload,
  };
};

export const createAdapter = <
  TInput,
  TOutput,
  TKind extends AdapterKind,
>(
  kind: TKind,
  codec: AdapterCodec<TInput, TOutput>,
  options: Readonly<Record<string, string>> = {},
  plugin?: PluginByKind<readonly PluginEnvelope<unknown, unknown, PluginKind>[], 'transform'>,
): AdapterSpec<TInput, TOutput> => ({
  codec,
  plugin,
  options: { ...options, kind },
});

export const runAdapter = async <
  TInput,
  TOutput,
>(
  adapter: AdapterSpec<TInput, TOutput>,
  input: NoInfer<TInput>,
  context: AdapterContext,
): Promise<{ readonly encoded: string; readonly output: TOutput }> => {
  const encoded = await adapter.codec.encode(input, context);
  const output = await adapter.codec.decode(encoded, context);
  return {
    encoded,
    output,
  };
};

export const transformRecords = async <TInput, TOutput>(
  records: readonly LatticeRecord<TInput>[],
  adapter: AdapterSpec<TInput, TOutput>,
): Promise<readonly LatticeRecord<TOutput>[]> => {
  const context = {
    adapterId: `adapter:${adapter.options.kind}`,
    region: 'us-east-1',
    transport: normalizeTransport(adapter.options.kind as AdapterKind),
  };

  const output: LatticeRecord<TOutput>[] = [];
  for (const record of records) {
    const transformed = await runAdapter(adapter, record.payload, context);
    output.push({
      tenant: record.tenant,
      streamId: record.streamId,
      at: record.at,
      payload: transformed.output,
    });
  }
  return output;
};

export const codecCatalog: Readonly<Record<AdapterKind, AdapterTransport>> = {
  json: 'transport:json',
  avro: 'transport:avro',
  protobuf: 'transport:protobuf',
  eventbridge: 'transport:eventbridge',
};

export const supportedKinds = Object.keys(codecCatalog) as AdapterKind[];

export const isSupportedKind = (kind: string): kind is AdapterKind => {
  return supportedKinds.includes(kind as AdapterKind);
};
