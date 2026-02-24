import { signalLayers, signalKinds, type AnySignalEnvelope, type SignalRunId } from '@domain/recovery-cockpit-cognitive-core';
import type {
  CockpitPluginManifest,
  PluginExecutionContext,
  PluginResult,
  PluginScope,
} from '@domain/recovery-cockpit-cognitive-core';

export interface OrchestratorRunEvent {
  readonly runId: SignalRunId;
  readonly pluginId: string;
  readonly stage: string;
  readonly accepted: boolean;
  readonly warnings: readonly string[];
  readonly latencyMs: number;
}

export interface OrchestratorDashboardRow {
  readonly kind: string;
  readonly count: number;
  readonly latestAt: string;
}

export interface OrchestratorResultEnvelope {
  readonly runId: SignalRunId;
  readonly executedAt: string;
  readonly totals: {
    readonly signals: number;
    readonly outputs: number;
  };
  readonly layers: Readonly<Record<string, number>>;
  readonly events: readonly OrchestratorRunEvent[];
}

export const buildDashboardRows = (runId: SignalRunId, events: readonly OrchestratorRunEvent[]): OrchestratorResultEnvelope => {
  const counts = [...signalKinds, ...signalLayers].reduce((acc, kind) => {
    acc[kind] = events.filter((event) => event.stage === kind).length;
    return acc;
  }, {} as Record<string, number>);
  return {
    runId,
    executedAt: new Date().toISOString(),
    totals: {
      signals: events.length,
      outputs: events.reduce((acc, event) => acc + event.warnings.length, 0),
    },
    layers: counts,
    events,
  };
};

export interface PluginExecutionEnvelope<TOut = unknown> {
  readonly plugin: CockpitPluginManifest<string, PluginScope, unknown, TOut>;
  readonly input: unknown;
  readonly output: PluginResult<TOut>;
}

export const normalizeResult = <TIn, TOut>(result: {
  plugin: CockpitPluginManifest<string, PluginScope, TIn, TOut>;
  input: TIn;
  output: PluginResult<TOut>;
  context: PluginExecutionContext;
}): PluginExecutionEnvelope<TOut> => ({
  plugin: result.plugin as unknown as CockpitPluginManifest<string, PluginScope, unknown, TOut>,
  input: result.input,
  output: result.output,
});

export const summarizeForDashboard = (signals: readonly AnySignalEnvelope[]): readonly OrchestratorRunEvent[] => {
  return signals.toSorted((left, right) => right.emittedAt.localeCompare(left.emittedAt)).map((signal) => ({
    runId: signal.runId,
    pluginId: signal.id,
    stage: signal.kind,
    accepted: true,
    warnings: signal.tags['warning'] ?? [],
    latencyMs: 0,
  }));
};
