import {
  asRun,
  asSession,
  asSignal,
  asTenant,
  asWindow,
  type AnalyticsWindow,
} from './identifiers';
import { asSignalAlias } from './models';
import type { PluginRunResult, PluginRunInput, PluginNode, PluginTraceId, PluginName } from './typed-plugin-types';
import { mapWithIteratorHelpers, type JsonValue } from '@shared/type-level';

export type DiagnosticLevel = 'info' | 'warn' | 'error' | 'critical';
export type SeverityMap = {
  readonly [TLevel in DiagnosticLevel]: number;
};

type EventEnvelope<TPayload extends Record<string, JsonValue> = Record<string, JsonValue>> = {
  readonly id: `event:${string}`;
  readonly at: string;
  readonly kind: `signal:${string}`;
  readonly source: PluginName;
  readonly payload: TPayload;
  readonly trace: PluginTraceId;
  readonly tenant: ReturnType<typeof asTenant>;
  readonly window: AnalyticsWindow;
};

type DiagnosticsState = {
  readonly traces: readonly string[];
  readonly levels: SeverityMap;
};

export interface DiagnosticsChunk {
  readonly plugin: PluginName;
  readonly results: readonly PluginRunResult[];
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface RunSignalMetrics {
  readonly runId: string;
  readonly signalCount: number;
  readonly acceptedCount: number;
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly score: number;
}

export interface SignalStreamEnvelope {
  readonly signal: ReturnType<typeof asSignal>;
  readonly trace: PluginTraceId;
  readonly window: AnalyticsWindow;
  readonly entries: readonly ({ readonly signal: string; readonly score: number } & { readonly event: string })[];
}

const classifySignal = (value: number): DiagnosticLevel => {
  if (value >= 90) {
    return 'info';
  }
  if (value >= 75) {
    return 'warn';
  }
  if (value >= 50) {
    return 'error';
  }
  return 'critical';
};

const toWindow = (seed: string): AnalyticsWindow => asWindow(`window:${seed}`);

export const createSignalStreamEnvelope = (
  input: PluginRunInput,
  plugins: readonly PluginNode[],
  signal: string,
): SignalStreamEnvelope => {
  const runTrace = (`trace:${input.runId}` as PluginTraceId);
  const tenant = asTenant(input.runId);
  const entries = plugins.map((plugin, index) => ({
    signal: plugin.name,
    score: plugin.weight,
    event: `${plugin.name}:${index}`,
  }));
  return {
    signal: asSignal(signal),
    trace: runTrace,
    window: toWindow(input.runId),
    entries: mapWithIteratorHelpers(entries, (entry) => ({ ...entry, event: `${entry.event}:${tenant}` })),
  };
};

export const summarizeRunDiagnostics = (results: readonly PluginRunResult[]): {
  readonly state: DiagnosticsState;
  readonly runMetrics: RunSignalMetrics;
} => {
  let severityCounts: SeverityMap = {
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
  };
  const traces = results
    .map((result) => result.diagnostics.map((entry) => `${result.plugin}:${entry.step}:${entry.latencyMs}`))
    .flat();
  let score = 0;
  for (const result of results) {
    const points = Math.max(0, result.signalCount);
    const level = classifySignal(points);
    score += points;
    severityCounts = {
      ...severityCounts,
      [level]: severityCounts[level] + 1,
    };
  }
  return {
    state: {
      traces,
      levels: severityCounts,
    },
    runMetrics: {
      runId: `run:${results[0]?.plugin ?? 'none'}`,
      signalCount: results.length,
      acceptedCount: results.filter((entry) => entry.accepted).length,
      warningCount: severityCounts.warn,
      criticalCount: severityCounts.critical,
      score: results.length === 0 ? 0 : score / results.length,
    },
  };
};

export const buildEventLog = (results: readonly PluginRunResult[]): readonly string[] =>
  mapWithIteratorHelpers(results, (result) => `${result.plugin}:${result.signalCount}`);

export const createDiagnosticsChunk = (results: readonly PluginRunResult[]): DiagnosticsChunk => ({
  plugin: `plugin:chunk-${results.length}` as PluginName,
  results,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
});

export const resolveRunIdentity = (seed: string): ReturnType<typeof asSession> => asSession(`session:${seed}`);
export const resolveRunAlias = (seed: string): ReturnType<typeof asSignalAlias> => asSignalAlias(`alias:${seed}`);

const toRunTraceId = (seed: string): PluginTraceId => (`trace:${seed}` as PluginTraceId);

const seedFromPayload = (payload: JsonValue): string =>
  typeof payload === 'object' && payload !== null && 'seed' in payload && typeof payload.seed === 'string'
    ? payload.seed
    : `seed:${Date.now()}`;

export const createEventEnvelope = <TPayload extends Record<string, JsonValue>>(payload: TPayload): EventEnvelope<TPayload> => ({
  id: `event:${Date.now()}` as EventEnvelope<TPayload>['id'],
  at: new Date().toISOString(),
  kind: `signal:${Date.now()}` as `signal:${string}`,
  source: `plugin:event-${Date.now()}` as PluginName,
  payload,
  trace: toRunTraceId(seedFromPayload(payload)),
  tenant: asTenant(`tenant:${seedFromPayload(payload)}`),
  window: toWindow(seedFromPayload(payload)),
});
