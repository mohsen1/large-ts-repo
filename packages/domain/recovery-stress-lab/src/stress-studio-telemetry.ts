import {
  buildIteratorFingerprint,
  collectIterable,
  filterIterable,
  mapIterable,
  pairwise,
  zipLongest,
} from '@shared/stress-lab-runtime/src/iterator-utils';
import { createTenantId, RecoverySignal, RecoverySimulationResult, TenantId } from './models';
import { PluginEvent } from '@shared/stress-lab-runtime';

export interface TelemetrySample {
  readonly tenantId: TenantId;
  readonly at: string;
  readonly kind: string;
  readonly payload: unknown;
}

export interface TelemetryDigest {
  readonly tenantId: TenantId;
  readonly sampleCount: number;
  readonly kindCount: Record<string, number>;
  readonly signature: string;
}

export const normalizeKind = (value: string): string => value.replace('stress-lab/', '').toUpperCase();

export const collectSignalSamples = (signals: readonly RecoverySignal[]): readonly TelemetrySample[] => {
  const telemetryTenant = createTenantId('tenant:stress-lab:telemetry');
  const samples = mapIterable(signals, (signal, index) => ({
    tenantId: telemetryTenant,
    at: signal.createdAt,
    kind: `signal:${signal.class}`,
    payload: {
      severity: signal.severity,
      value: signal.id,
      index,
    },
  }));

  return collectIterable(samples);
};

export const collectSimulationSamples = (simulation: RecoverySimulationResult): readonly TelemetrySample[] => {
  return simulation.ticks.map((tick) => ({
    tenantId: simulation.tenantId,
    at: tick.timestamp,
    kind: 'simulation/tick',
    payload: {
      confidence: tick.confidence,
      blockedCount: tick.blockedWorkloads.length,
      activeWorkloads: tick.activeWorkloads,
    },
  }));
};

export const summarizeTelemetryEvents = (tenantId: TenantId, events: readonly PluginEvent[]): TelemetryDigest => {
  const signatures = collectIterable(filterIterable(events, (event) => typeof event.name === 'string')).map((event) => `${event.name}:${event.pluginId}`);

  const counts = signatures.reduce<Record<string, number>>((acc, entry) => {
    const [name] = entry.split(':', 2);
    const key = normalizeKind(name ?? 'unknown');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    tenantId,
    sampleCount: signatures.length,
    kindCount: counts,
    signature: buildIteratorFingerprint(signatures),
  };
};

const pairKinds = (left: readonly string[], right: readonly string[]): readonly [string, string][] => {
    const output: [string, string][] = [];
    for (const [leftValue, rightValue] of collectIterable(zipLongest(left, right))) {
      if (leftValue !== undefined && rightValue !== undefined) {
        output.push([String(leftValue), String(rightValue)]);
      }
    }
  return output;
};

export const compareDigests = (left: TelemetryDigest, right: TelemetryDigest): string => {
  const deltas: string[] = [];
  for (const [kindLeft, kindRight] of pairKinds(Object.keys(left.kindCount), Object.keys(right.kindCount))) {
    const key = kindLeft;
    const delta = (right.kindCount[key] ?? 0) - (left.kindCount[key] ?? 0);
    deltas.push(`${key}:${delta}`);
  }

  return `tenant=${left.tenantId} ${deltas.join('; ')}`;
};

export const flattenManifestEvents = async () => {
  const left = collectSignalSamples([]);
  const right = collectTelemetryPairs([]);
  const pairs = pairwise(right.map(([, value]) => (value === '' ? 'none' : value)));
  return collectIterable(pairs).map(([leftItem]) => leftItem);
};

export const collectTelemetryPairs = (events: readonly PluginEvent[]): ReadonlyArray<readonly [string, string]> => {
  const payload = mapIterable(events, (event) => [event.at, event.name] as const);
  return collectIterable(payload);
};

export const buildManifestSummary = (value: string): { readonly summary: string; readonly length: number } => ({
  summary: value.slice(0, 40),
  length: value.length,
});

export const normalizeSignalsForTelemetry = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  const filtered = collectIterable(filterIterable(signals, (signal) => signal.severity !== 'low'));
  return filtered.map((signal, index) => ({
    ...signal,
    createdAt: signal.createdAt ?? new Date(Date.now() - index * 1000).toISOString(),
  }));
};
