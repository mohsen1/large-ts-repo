import type { NoInfer } from '@shared/type-level';
import type { ExperimentContext, ExperimentIntent, ExperimentPlan, ExperimentPayload, ExperimentRunId } from '@domain/recovery-autonomy-experiment';
import type { ResultState } from '@shared/core';
import type { Brand } from '@shared/core';

export type SchedulerRunId = ExperimentRunId;
export type PluginId = Brand<string, 'PluginId'>;

export interface PluginContext {
  readonly runId: SchedulerRunId;
  readonly tenant: string;
  readonly phase: string;
  readonly correlation: string;
}

export interface PluginDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: PluginId;
  readonly kind: `plugin:${string}`;
  readonly phase: string;
  readonly priority: number;
  readonly transform: (input: NoInfer<TInput>, context: PluginContext) => Promise<NoInfer<TOutput>>;
}

export interface SchedulerRequest<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  readonly intent: ExperimentIntent;
  readonly context: ExperimentContext;
  readonly payload: NoInfer<ExperimentPayload<TMeta>>;
  readonly plan: NoInfer<ExperimentPlan<TMeta>>;
}

export interface OrchestratorConfig {
  readonly tenantAlias: string;
  readonly maxCycles: number;
  readonly cycleDelayMs: number;
}

export interface OrchestratorState {
  readonly runId: SchedulerRunId;
  readonly running: boolean;
  readonly completed: boolean;
  readonly phase: string;
}

export interface OrchestrationResult<T = unknown> {
  readonly ok: boolean;
  readonly outputs: readonly T[];
  readonly state: OrchestratorState;
  readonly error?: Error;
  readonly pluginCount: number;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface MetricsPoint {
  readonly runId: string;
  readonly outputCount: number;
  readonly success: boolean;
  readonly durationMs: number;
  readonly pluginCount: number;
}

export type AsyncOrchestrationResult<T> = Promise<ResultState<OrchestrationResult<T>, Error>>;

export interface SchedulerRuntime {
  bootstrap(): Promise<readonly string[]>;
  run<TMeta extends Record<string, unknown>>(request: SchedulerRequest<TMeta>): Promise<OrchestrationResult>;
  readonly state: OrchestratorState;
}
