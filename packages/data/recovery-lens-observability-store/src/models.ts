import type { Brand, NoInfer, Prettify } from '@shared/type-level';
import type { LensTopology } from '@domain/recovery-lens-observability-models';
import type { MetricRecord, WindowPolicy, ObserverNamespace, ObserverAgentId } from '@domain/recovery-lens-observability-models';

export type StoreRecordState = 'open' | 'sealed' | 'closed';
export type StoreRecordId = Brand<string, 'StoreRecordId'>;

export interface StoreRecord<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: StoreRecordId;
  readonly namespace: ObserverNamespace;
  readonly state: StoreRecordState;
  readonly path: string;
  readonly policy: WindowPolicy;
  readonly createdAt: string;
  readonly payload: TPayload;
}

export interface StoreSnapshot {
  readonly namespace: ObserverNamespace;
  readonly schema: 1;
  readonly records: readonly StoreRecord[];
  readonly topology?: LensTopology;
}

export interface MetricStoreQuery<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly namespace: ObserverNamespace;
  readonly metric?: `metric:${string}`;
  readonly policy?: WindowPolicy['mode'];
  readonly limit?: number;
  readonly namespaceFilter?: string;
  readonly seed?: TPayload;
}

export const makeRecord = <TPayload extends Record<string, unknown>>(
  namespace: ObserverNamespace,
  payload: NoInfer<TPayload>,
  policy: WindowPolicy,
  override: Partial<Pick<StoreRecord<TPayload>, 'path' | 'state' | 'id'>> = {},
): Prettify<StoreRecord<TPayload>> => ({
  id: (override.id ?? `${namespace}:${Date.now()}:${Math.random().toString(36).slice(2)}`) as StoreRecordId,
  namespace,
  path: override.path ?? `path:${namespace}`,
  state: override.state ?? 'open',
  policy,
  createdAt: new Date().toISOString(),
  payload,
});

export const recordKey = (record: StoreRecord): string => `${record.namespace}:${record.id}`;

export const isOpen = (record: StoreRecord): boolean => record.state === 'open';

export const sortRecords = <TPayload extends Record<string, unknown>>(records: readonly StoreRecord<TPayload>[]): readonly StoreRecord<TPayload>[] =>
  [...records].toSorted((left, right) => left.id.localeCompare(right.id));

export const mapPayloads = <TPayload extends Record<string, unknown>, TOutput>(
  records: readonly StoreRecord<TPayload>[],
  mapper: (payload: TPayload, index: number, namespace: ObserverNamespace) => TOutput,
): readonly TOutput[] => records.map((entry, index) => mapper(entry.payload, index, entry.namespace));

export const aggregateRecordCounts = <TPayload extends Record<string, unknown>>(records: readonly StoreRecord<TPayload>[]) => {
  const out = new Map<StoreRecordState, number>();
  for (const record of records) {
    out.set(record.state, (out.get(record.state) ?? 0) + 1);
  }
  return out;
};
