import type { Brand, NoInfer, KeyPaths, PathValue, Prettify, RecursivePath } from '@shared/type-level';
import { type RecursiveTuple } from '@shared/typed-orchestration-core';

export type ObserverNamespace = Brand<string, 'ObserverNamespace'>;
export type ObserverAgentId = Brand<string, 'ObserverAgentId'>;
export type ObserverWindowId = Brand<string, 'ObserverWindowId'>;
export type Severity = 'critical' | 'error' | 'warn' | 'info' | 'trace';
export type MetricName = `metric:${string}`;
export type EventName = `event:${string}`;

export const observerNamespace = (value: string): ObserverNamespace =>
  value.trim().toLowerCase().replace(/[^a-z0-9:._-]/g, '-') as ObserverNamespace;

export const observerAgent = (namespace: string): ObserverAgentId =>
  `agent:${namespace}:${Date.now().toString(36)}` as ObserverAgentId;

export const observerWindow = (window: string): ObserverWindowId => window.trim() as ObserverWindowId;

export const asWindowPriority = (value: number): WindowPriority => {
  const safe = Math.max(1, Math.min(9, Math.floor(value)));
  return safe as WindowPriority;
};

export interface MetricRecord<TPayload extends Record<string, unknown>> {
  readonly timestamp: string;
  readonly namespace: ObserverNamespace;
  readonly metric: MetricName;
  readonly payload: TPayload;
  readonly severity: Severity;
}

export type WindowMode = 'realtime' | 'snapshot' | 'backfill' | 'simulation';
export type WindowPriority = Brand<number, 'WindowPriority'>;

export interface WindowPolicy {
  readonly namespace: ObserverNamespace;
  readonly window: ObserverWindowId;
  readonly mode: WindowMode;
  readonly ttlMs: number;
  readonly priority: WindowPriority;
}

export const defaultWindowPolicy: WindowPolicy = {
  namespace: observerNamespace('observer:default'),
  window: observerWindow('window:default'),
  mode: 'realtime',
  ttlMs: 15_000,
  priority: asWindowPriority(5),
};

export type EventToken<T extends string> = `event:${T}`;
export type EventPayloadByToken<TEventMap extends Record<string, unknown>, TKey extends keyof TEventMap & string> =
  TEventMap[TKey] & { readonly kind: EventToken<TKey> };

export type RouteCatalog<TMap extends Record<string, unknown>> = {
  [K in keyof TMap & string]: `route:${K}`;
};

export type CatalogPaths<TMap extends Record<string, unknown>> = {
  readonly [K in keyof TMap & string]: KeyPaths<{ readonly [P in K]: TMap[K] }>;
};

export type PathPayload<TMap extends Record<string, unknown>, TPath extends string> =
  TPath extends keyof TMap & string ? TMap[TPath] : PathValue<TMap, Extract<TPath, string>>;

export type SeverityAware<T> = T extends { severity: infer TSeverity }
  ? TSeverity extends Severity
    ? T
    : never
  : never;

export type TopologyHistory<TDepth extends number> = RecursiveTuple<readonly MetricRecord<Record<string, unknown>>[], TDepth>;

export type MetricTuple<TPayload extends Record<string, unknown>> = [MetricRecord<TPayload>, ...MetricRecord<TPayload>[]];

export const makeMetricName = <const TSeed extends string>(seed: TSeed): `metric:${TSeed}` => `metric:${seed}`;

export const foldMetrics = <TPayload extends Record<string, unknown>, TState>(
  metrics: readonly MetricRecord<TPayload>[],
  seed: NoInfer<TState>,
  fold: (state: TState, point: MetricRecord<TPayload>, index: number, total: number) => TState,
): TState => {
  let output = seed;
  for (let index = 0; index < metrics.length; index += 1) {
    output = fold(output, metrics[index], index, metrics.length);
  }
  return output;
};

export const classifyPayloadKeys = <TPayload extends Record<string, unknown>>(
  point: MetricRecord<TPayload>,
): KeyPaths<TPayload> => {
  if (point.payload && typeof point.payload === 'object') {
    return 'payload' as KeyPaths<TPayload>;
  }
  return 'payload' as KeyPaths<TPayload>;
};

export const samplePath = <TRecord extends Record<string, unknown>, TPath extends KeyPaths<TRecord>>(
  record: TRecord,
  path: NoInfer<TPath>,
): PathValue<TRecord, Extract<TPath, string>> => {
  const segments = (path as string).split('.');
  let output: any = record;
  for (const segment of segments) {
    if (output === undefined || output === null || typeof output !== 'object') {
      return output as PathValue<TRecord, Extract<TPath, string>>;
    }
    output = output[segment];
  }
  return output as PathValue<TRecord, Extract<TPath, string>>;
};

export const normalizeRoute = <TName extends string>(namespace: ObserverNamespace, name: TName): `namespace:${TName}` =>
  `namespace:${String(name).replace(/[^a-z0-9-]/g, '-')}` as `namespace:${TName}`;

export type RecursiveNamespace<T> = T extends string | number | boolean | bigint | symbol | null | undefined
  ? never
  : T extends object
    ? { [K in keyof T & string]: T[K] extends object ? RecursivePath<T[K]> : K }[keyof T & string]
    : never;

export const isCritical = (severity: Severity): boolean => severity === 'critical' || severity === 'error';

export const metricDigest = <TPayload extends Record<string, unknown>>(
  metric: MetricRecord<TPayload>,
): Prettify<{ readonly key: `metric:${TPayload & { [key: string]: unknown } extends never ? never : string}`; readonly size: number }> => ({
  key: `metric:${metric.metric}` as any,
  size: JSON.stringify(metric.payload).length,
});
