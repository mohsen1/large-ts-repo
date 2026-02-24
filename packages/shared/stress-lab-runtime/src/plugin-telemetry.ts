import { canonicalizeNamespace, type PluginId, type PluginKind, type PluginNamespace } from './ids';
import { collectIterable } from './iterator-utils';

type NoInfer<T> = [T][T extends any ? 0 : never];

export type MetricDimensions<T extends Record<string, string | number>> = {
  [K in keyof T as K extends string ? `dimension:${K}` : never]: T[K];
};

export type RecursiveTupleFlat<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveTupleFlat<Tail>]
  : readonly [];

export interface TelemetryEnvelope<TPayload extends object> {
  readonly namespace: PluginNamespace;
  readonly pluginId: PluginId;
  readonly runId: string;
  readonly payload: TPayload;
  readonly generatedAt: string;
}

export interface TelemetrySample {
  readonly pluginId: string;
  readonly at: string;
  readonly level: 'trace' | 'warn' | 'error' | 'info';
  readonly message: string;
  readonly values: readonly number[];
}

export type TelemetryDigest = `${string}:${string}:${number}`;

export interface TelemetryStoreConfig {
  readonly tenantId: string;
  readonly namespace: string;
  readonly capacity: number;
}

const namespaceSeed = canonicalizeNamespace('recovery:stress:lab:telemetry');

export const emptyTelemetryDigest = 'recovery:stress:lab:telemetry:empty' as TelemetryDigest;

const toSafeNumber = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const buildLevelLabel = (value: number): TelemetrySample['level'] => {
  if (value >= 0.85) return 'error';
  if (value >= 0.6) return 'warn';
  if (value >= 0.3) return 'info';
  return 'trace';
};

const normalizeValues = (values: readonly number[]): readonly number[] => values.map((entry) => toSafeNumber(entry));

export class PluginTelemetryStore<TContext extends string = string> {
  readonly tenantId: string;
  readonly namespace: string;
  readonly #namespace: PluginNamespace;
  readonly #buffer: TelemetrySample[] = [];
  readonly #byContext = new Map<TContext, TelemetrySample[]>();
  readonly #cleanup: Array<() => void> = [];
  readonly #context: TContext;

  constructor(tenantId: string, context: NoInfer<TContext> = 'default' as TContext, private readonly config: TelemetryStoreConfig = {
    tenantId,
    namespace: 'default',
    capacity: 512,
  }) {
    this.#context = context;
    this.tenantId = tenantId;
    this.namespace = `${namespaceSeed}:${String(context)}:${config.capacity}`;
    this.#namespace = canonicalizeNamespace(this.namespace);
    this.#cleanup.push(() => {
      this.#buffer.length = 0;
      this.#byContext.clear();
    });
  }

  [Symbol.dispose](): void {
    for (const cleaner of this.#cleanup.splice(0)) {
      cleaner();
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }

  emit(level: TelemetrySample['level'], pluginId: PluginId, message: string, values: readonly number[] = []): void {
    const sample: TelemetrySample = {
      pluginId,
      at: new Date().toISOString(),
      level,
      message,
      values: normalizeValues(values),
    };

    const bucket = this.#byContext.get(this.#context) ?? [];
    bucket.push(sample);
    this.#byContext.set(this.#context, bucket);
    this.#buffer.push(sample);

    if (this.#buffer.length > this.config.capacity) {
      this.#buffer.shift();
    }
  }

  emitIf(predicate: (sample: TelemetrySample) => boolean, sample: TelemetrySample): void {
    if (predicate(sample)) {
      this.emit(sample.level, sample.pluginId as PluginId, sample.message, sample.values);
    }
  }

  snapshot(): readonly TelemetrySample[] {
    return [...this.#buffer];
  }

  clear(): void {
    this.#buffer.length = 0;
    this.#byContext.clear();
  }

  levels(): readonly TelemetrySample['level'][] {
    return [...new Set(this.#buffer.map((entry) => entry.level))];
  }

  toEnvelope<TPayload extends object>(
    pluginId: PluginId,
    runId: string,
    payload: TPayload,
  ): TelemetryEnvelope<TPayload> {
    return {
      namespace: this.#namespace,
      pluginId,
      runId,
      payload,
      generatedAt: new Date().toISOString(),
    };
  }

  countByLevel(): Record<'trace' | 'warn' | 'error' | 'info', number> {
    return {
      trace: this.#buffer.filter((entry) => entry.level === 'trace').length,
      warn: this.#buffer.filter((entry) => entry.level === 'warn').length,
      error: this.#buffer.filter((entry) => entry.level === 'error').length,
      info: this.#buffer.filter((entry) => entry.level === 'info').length,
    };
  }
}

type PluginTelemetryStoreAlias = PluginTelemetryStore<string>;

export const createPluginTelemetryStore = (
  tenantId: string,
  namespace: PluginKind,
): PluginTelemetryStore<PluginKind> => {
  return new PluginTelemetryStore(tenantId, namespace, {
    tenantId,
    namespace: String(namespace),
    capacity: 2048,
  });
};

export const traceSamples = <TKind extends PluginKind>(
  kind: TKind,
  ...samples: readonly TelemetrySample[]
): readonly TelemetrySample[] =>
  samples.map((sample) => ({
    ...sample,
    pluginId: `${kind}:${sample.pluginId}`,
    values: [sample.values.length, ...sample.values],
  }));

const collectSamples = (records: Iterable<TelemetrySample>): readonly TelemetrySample[] => {
  return collectIterable(records);
};

export const compressSamples = (records: Iterable<TelemetrySample>): readonly TelemetrySample[] => {
  const entries = collectSamples(records);
  const grouped = new Map<string, { sample: TelemetrySample; score: number }[]>();
  for (const record of entries) {
    const key = `${record.level}:${record.pluginId}`;
    const bucket = grouped.get(key) ?? [];
    const score = record.values.reduce((acc, value) => acc + toSafeNumber(value), 0);
    bucket.push({ sample: record, score });
    grouped.set(key, bucket);
  }

  const output: TelemetrySample[] = [];
  for (const [key, bucket] of grouped) {
    const sum = bucket.reduce((acc, entry) => acc + entry.score, 0);
    const base = bucket[0]?.sample;
    if (!base) continue;
    const level = buildLevelLabel(sum / Math.max(1, bucket.length));
    output.push({
      ...base,
      message: `${key}#${sum}`,
      level,
      values: [...base.values, sum],
    });
  }

  return output.sort((left, right) => right.at.localeCompare(left.at));
};

export const summarizeStore = (store: PluginTelemetryStoreAlias): string => {
  const digest = buildTelemetryFingerprint(store.snapshot());
  return `${store.tenantId}@${store.namespace}:${digest.length}`;
};

export const buildTelemetryFingerprint = (records: Iterable<TelemetrySample>): string => {
  return collectSamples(records)
    .map((entry) => `${entry.level}:${entry.message}:${entry.values.length}`)
    .join('|');
};

export const splitRecords = <T extends readonly TelemetrySample[]>(records: T, size: number): readonly (readonly TelemetrySample[])[] => {
  const output: TelemetrySample[][] = [];
  const chunk = Math.max(1, size);
  for (let index = 0; index < records.length; index += chunk) {
    output.push(records.slice(index, index + chunk));
  }
  return output;
};
