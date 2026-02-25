import type { NoInfer } from '@shared/type-level';
import type { PluginDefinition } from '@shared/cascade-orchestration-kernel';
import type { BlueprintManifest, RunId } from '@domain/recovery-cascade-orchestration';

export type RunState = 'idle' | 'running' | 'success' | 'failed';

export interface CascadeTelemetryPoint {
  readonly metric: string;
  readonly value: number;
  readonly unit: 'ms' | 'count' | 'ratio';
}

export interface CascadeSummary {
  readonly tenantId: string;
  readonly runId: RunId;
  readonly state: RunState;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly metrics: CascadeTelemetryPoint[];
}

export interface CascadeFilters {
  readonly tenants: ReadonlyArray<string>;
  readonly states: ReadonlyArray<RunState>;
  readonly minMetrics: number;
}

export type CascadeFiltersInput = {
  [K in keyof CascadeFilters]: CascadeFilters[K];
};

export interface CascadePluginView {
  readonly id: string;
  readonly name: string;
  readonly hasRun: boolean;
  readonly stage: string;
}

export type PluginRow<T extends readonly PluginDefinition[]> = {
  plugin: T[number];
  label: `${string}:${string}`;
};

export interface ScenarioDraft<
  TBlueprint extends BlueprintManifest = BlueprintManifest,
> {
  readonly blueprint: TBlueprint;
  readonly notes: string;
}

export interface OrchestrationWorkspace<T extends BlueprintManifest> {
  readonly blueprint: NoInfer<T>;
  readonly pluginCatalog: string[];
  readonly selected: ReadonlyArray<T['name']>;
  readonly summary: CascadeSummary;
}
