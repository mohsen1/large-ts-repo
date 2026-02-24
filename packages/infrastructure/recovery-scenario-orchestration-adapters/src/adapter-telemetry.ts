import { toTrace } from './telemetry.js';
import type { AdapterEvent, AdapterRegistry, AdapterRegistryKey } from './adapter-registry.js';
import type { PluginStage, TimeMs } from '@domain/recovery-horizon-engine';
import type { RuntimeMetrics, ScenarioDecision, ScenarioId, IncidentId, IncidentContext } from '@domain/recovery-scenario-engine';

export interface TraceWindow {
  readonly tenantId: string;
  readonly from: TimeMs;
  readonly to: TimeMs;
  readonly verbs: readonly string[];
}

export type RegistryTelemetryEntry =
  | { readonly kind: 'install'; readonly message: string; readonly at: TimeMs }
  | { readonly kind: 'remove'; readonly message: string; readonly at: TimeMs }
  | { readonly kind: 'run'; readonly message: string; readonly at: TimeMs };

export interface RegistryTelemetry {
  readonly events: readonly RegistryTelemetryEntry[];
  readonly summary: {
    readonly byVerb: Record<string, number>;
    readonly stageCoverage: Record<PluginStage, number>;
    readonly topKeys: readonly AdapterRegistryKey[];
  };
}

const traceMap = (events: readonly AdapterEvent[]): Record<string, number> =>
  events.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.verb] = (acc[entry.verb] ?? 0) + 1;
    return acc;
  }, {});

const stageCoverage = (events: readonly AdapterEvent[]): Record<PluginStage, number> =>
  events.reduce<Record<PluginStage, number>>((acc, event) => {
    acc[event.stage] = (acc[event.stage] ?? 0) + 1;
    return acc;
  }, {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  });

const uniqueKeys = (events: readonly AdapterEvent[]): readonly string[] =>
  [...new Set(events.map((event) => `${event.tenantId}:${event.stage}:${event.contractId}`))];

const collectWindowed = (events: readonly AdapterEvent[], window: TraceWindow): readonly AdapterEvent[] =>
  events.filter((entry) => entry.at >= window.from && entry.at <= window.to);

const toDecision = (entry: AdapterEvent): ScenarioDecision<IncidentContext> => ({
  scenarioId: `${entry.contractId}` as ScenarioId,
  incidentContext: {
    incidentId: `${entry.tenantId}` as IncidentId,
    scenarioId: `${entry.contractId}` as ScenarioId,
    tenantId: `${entry.tenantId}` as any,
    service: entry.stage,
    region: 'registry',
    detectedAt: new Date(Number(entry.at)).toISOString(),
    signals: [],
    rawMetadata: {
      verb: entry.verb,
      signalId: entry.signalId,
    },
  },
  confidence: entry.verb === 'install' ? 1 : entry.verb === 'remove' ? 0.5 : 0.75,
  rationale: [`${entry.verb}:${entry.stage}`],
  actions: [],
});

const metricsFromVerb = (entry: AdapterEvent): RuntimeMetrics => ({
  windowStart: new Date(Number(entry.at)).toISOString(),
  windowEnd: new Date(Number(entry.at) + 1).toISOString(),
  matchedSignals: entry.signalId.length,
  meanSignalValue: Math.max(0, entry.payload as unknown as number),
  maxSignalValue: Math.max(0, entry.payload as unknown as number),
  uniqueDimensions: 1,
});

export const createTelemetryFromRegistry = async (
  tenantId: string,
  registry: AdapterRegistry,
  window?: TraceWindow,
): Promise<RegistryTelemetry> => {
  const raw = registry.eventLog(tenantId);
  const events = window ? collectWindowed(raw, window) : raw;
  const verbSummary = traceMap(events);
  const coverage = stageCoverage(events);
  const top = uniqueKeys(events);

  const summaryEntries = events.map((entry): RegistryTelemetryEntry => {
    const message = toTrace({
      scenarioId: entry.contractId,
      incidentId: entry.tenantId,
      decision: toDecision(entry),
      metrics: metricsFromVerb(entry),
      emittedAt: new Date(Number(entry.at)).toISOString(),
    });
    if (entry.verb === 'install') {
      return { kind: 'install', message, at: entry.at };
    }
    if (entry.verb === 'remove') {
      return { kind: 'remove', message, at: entry.at };
    }
    return { kind: 'run', message, at: entry.at };
  });

  return {
    events: summaryEntries,
    summary: {
      byVerb: verbSummary,
      stageCoverage: coverage,
      topKeys: top as readonly AdapterRegistryKey[],
    },
  };
};

export const summarizeByTenant = async (
  tenantIds: readonly string[],
  registry: AdapterRegistry,
): Promise<Map<string, RegistryTelemetry>> => {
  const map = new Map<string, RegistryTelemetry>();
  for (const tenantId of tenantIds) {
    map.set(tenantId, await createTelemetryFromRegistry(tenantId, registry));
  }
  return map;
};

export const formatTelemetry = (telemetry: RegistryTelemetry): readonly string[] =>
  telemetry.events.map((entry) => `${entry.kind}:${entry.message.split('\n')[0]}`);
