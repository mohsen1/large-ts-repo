import { NoInfer } from '@shared/type-level';
import { StreamHealthSignal } from '@domain/streaming-observability';
import {
  AnyStreamingCommandPlugin,
  CommandNamespace,
  CommandSignalEnvelope,
  CommandTenantId,
  CommandTraceId,
} from './types';

export interface TelemetryWindow {
  readonly start: number;
  readonly end: number;
  readonly severity: number;
  readonly topSignals: readonly string[];
}

export interface TelemetryProfile {
  readonly traceId: CommandTraceId;
  readonly tenantId: CommandTenantId;
  readonly namespace: CommandNamespace;
  readonly avgLatencyMs: number;
  readonly peakLatencyMs: number;
  readonly failureRate: number;
  readonly emittedSignals: number;
}

export interface TraceRow {
  readonly pluginId: string;
  readonly pluginName: string;
  readonly namespace: CommandNamespace;
  readonly latencyMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
}

const normalizeSeverity = (score: number): number =>
  Number(Math.max(0, Math.min(1, score / 5)).toFixed(3));

const average = <T>(values: readonly T[], get: (value: T) => number): number => {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + get(value), 0) / values.length;
};

export const averageSeverity = (signals: readonly StreamHealthSignal[]): number =>
  average(signals, (signal) => normalizeSeverity(signal.score * 5));

export const summarizeSeverityBuckets = (
  signals: readonly StreamHealthSignal[],
): Record<'low' | 'medium' | 'high', number> =>
  signals.reduce(
    (acc, signal) => {
      if (signal.score >= 0.8) acc.high += 1;
      else if (signal.score >= 0.5) acc.medium += 1;
      else acc.low += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 },
  );

export const buildSignalDensity = (signals: readonly StreamHealthSignal[]): TelemetryWindow => {
  const ordered = [...signals].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const scoreList = ordered.map((signal) => normalizeSeverity(signal.score * 5));
  const start = Date.parse(ordered[0]?.observedAt ?? new Date().toISOString());
  const end = Date.parse(ordered.at(-1)?.observedAt ?? new Date().toISOString());

  return {
    start,
    end,
    severity: average(scoreList, (value) => value),
    topSignals: ordered.map((signal) => `${signal.streamId}:${signal.level}`).slice(0, 5),
  };
};

export const makeProfile = (
  traceId: CommandTraceId,
  tenantId: CommandTenantId,
  envelopes: readonly CommandSignalEnvelope[],
): TelemetryProfile => {
  const namespace = envelopes[0]?.namespace ?? 'ingest';
  const latencies = envelopes
    .map((envelope) => envelope.context?.latencyMs ?? envelope.signals.length * 4)
    .filter((value): value is number => value >= 0);

  return {
    traceId,
    tenantId,
    namespace,
    avgLatencyMs: average(latencies, Number),
    peakLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
    emittedSignals: envelopes.reduce((acc, envelope) => acc + envelope.signals.length, 0),
    failureRate: envelopes.filter((envelope) => envelope.context?.status === 'failed').length / Math.max(1, envelopes.length),
  };
};

const asTraceRows = (
  run: { streamId: string },
  envelopes: readonly CommandSignalEnvelope[],
): TraceRow[] =>
  envelopes.map((envelope, index) => ({
    pluginId: envelope.context?.pluginId ?? `plugin:${index}`,
    pluginName: envelope.context?.pluginName ?? `plugin:${index}`,
    namespace: envelope.namespace,
    latencyMs: envelope.context?.latencyMs ?? 0,
    startedAt: envelope.seenAt,
    finishedAt: new Date(Date.parse(envelope.seenAt) + (envelope.context?.latencyMs ?? 0)).toISOString(),
  }));

export const buildLatencyProfile = async (
  result: { streamId: string },
  envelopes: readonly CommandSignalEnvelope[],
): Promise<readonly TraceRow[]> => asTraceRows(result, envelopes);

export const flattenSignals = (
  groups: readonly {
    readonly namespace: CommandNamespace;
    readonly signals: readonly StreamHealthSignal[];
  }[],
): readonly StreamHealthSignal[] => {
  const flattened: StreamHealthSignal[] = [];
  for (const group of groups) {
    flattened.push(...group.signals);
  }
  return flattened;
};

export const summarizeByNamespace = <TInput extends readonly CommandSignalEnvelope[]>(
  envelopes: TInput,
): Record<CommandNamespace, number> => {
  const aggregate = envelopes.reduce((acc, envelope) => {
    acc[envelope.namespace] = (acc[envelope.namespace] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return aggregate as Record<CommandNamespace, number>;
};

export interface PluginLatencyDigest {
  readonly plugin: NoInfer<AnyStreamingCommandPlugin>;
  readonly p50: number;
  readonly p95: number;
  readonly samples: number;
}

const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * ratio)));
  return sorted[index] ?? 0;
};

export const buildPluginDigest = (
  rows: readonly TraceRow[],
  plugins: readonly AnyStreamingCommandPlugin[],
): readonly PluginLatencyDigest[] => {
  const byPlugin = new Map<string, number[]>();
  for (const row of rows) {
    const key = `${row.pluginId}:${row.pluginName}`;
    const bucket = byPlugin.get(key) ?? [];
    bucket.push(row.latencyMs);
    byPlugin.set(key, bucket);
  }

  return [...byPlugin.entries()].map(([key, latencies]) => {
    const [pluginId, pluginName] = key.split(':') as [string, string];
    const fallbackPlugin = plugins.find((plugin) => plugin.pluginId === pluginId);
    const plugin = fallbackPlugin ?? plugins[0] ?? {
      pluginId: pluginId as any,
      name: pluginName,
      kind: 'ingest-plugin',
      namespace: 'ingest',
      version: '1.0.0',
      consumes: [],
      emits: [],
      config: {},
      input: {},
      output: {},
      run: async () => ({ pluginName }),
    };

    return {
      plugin,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      samples: latencies.length,
    };
  });
};

export const asNoInferList = <TValues>(values: readonly TValues[]): NoInfer<TValues[]> => values as NoInfer<TValues[]>;
