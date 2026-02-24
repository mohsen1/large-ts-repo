import { asTraceId, createRegistry, type Disposer, type PluginSnapshot, type RegistryScopeId } from '@shared/recovery-lab-kernel';
import type { LabLane, ScenarioSignal, StepOutput } from '@domain/recovery-simulation-lab-core';
import { PipelineExecution } from '@shared/recovery-lab-kernel';

export interface PluginService {
  readonly id: string;
  readonly lane: LabLane;
  readonly version: string;
}

export interface PluginMetrics {
  readonly pluginId: string;
  readonly averageLatencyMs: number;
  readonly successRate: number;
}

interface PipelineSummary {
  readonly pipeline: PipelineExecution<unknown, unknown>;
}

const defaultSnapshot: PluginSnapshot = {
  scope: asTraceId('scope:default') as unknown as RegistryScopeId,
  total: 0,
  enabled: false,
};

export class PluginRegistryState {
  readonly #snapshots = new Map<string, PluginSnapshot>();

  public update(scope: string, snapshot: PluginSnapshot): void {
    this.#snapshots.set(scope, snapshot);
  }

  public report(): ReadonlyMap<string, PluginSnapshot> {
    return new Map(this.#snapshots);
  }

  public snapshot(scope: string): PluginSnapshot {
    return this.#snapshots.get(scope) ?? defaultSnapshot;
  }

  public clear(): void {
    this.#snapshots.clear();
  }
}

export const createServiceDisposer = (scope: { [Symbol.dispose](): void }): Disposer => ({
  [Symbol.dispose]: () => {
    scope[Symbol.dispose]();
  },
});

export const serviceLabel = (service: PluginService): string => {
  return `${service.id}:${service.version}`;
};

export const reduceSignals = (signals: readonly ScenarioSignal[]): readonly string[] => {
  const bag = new Map<string, number>();
  for (const signal of signals) {
    const lane = signal.lane;
    bag.set(lane, (bag.get(lane) ?? 0) + signal.value);
  }

  return [...bag.entries()]
    .toSorted((left, right) => right[1] - left[1])
    .flatMap(([lane, score]) => [`${lane}:${score}`]);
};

export const buildPluginMetric = (stats: readonly number[], pluginId: string): PluginMetrics => {
  const averageLatencyMs = stats.reduce((acc, value) => acc + value, 0) / (stats.length || 1);
  const successRate = stats.filter((value) => value > 0).length / (stats.length || 1);
  return { pluginId, averageLatencyMs, successRate };
};

export const pipelineSummary = (pipeline: PipelineExecution<unknown, unknown>): PipelineSummary => ({
  pipeline: {
    ...pipeline,
  },
});

export const createPluginRegistry = () => {
  const registry = createRegistry({
    tenant: 'recovery-lab',
    traceId: asTraceId(`trace-${Date.now()}`),
    correlationKey: 'registry',
    startedAt: Date.now(),
    metadata: {},
  });

  const state = new PluginRegistryState();
  return {
    registry,
    state,
    summarizeSteps: (steps: readonly StepOutput[]) => steps.length,
  };
};
