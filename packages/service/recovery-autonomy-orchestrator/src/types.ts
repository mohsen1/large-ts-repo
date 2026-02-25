import type { NoInfer } from '@shared/type-level';
import type {
  AutonomyScope,
  AutonomySignalInput,
  AutonomySignalEnvelope,
  AutonomyExecutionOutput,
  AutonomyRunId,
  AutonomyGraphId,
  AutonomyPlan,
} from '@domain/recovery-autonomy-graph';
import type { AutonomyRunStore } from '@data/recovery-autonomy-store';

export interface RunExecutionRequest<TScope extends AutonomyScope = AutonomyScope, TPayload = unknown> {
  readonly tenantId: string;
  readonly graphId: AutonomyGraphId;
  readonly scope: TScope;
  readonly payload: TPayload;
  readonly seed: string;
  readonly owner: string;
  readonly tags?: readonly string[];
}

export interface OrchestratorOptions {
  readonly failFast?: boolean;
  readonly dryRun?: boolean;
  readonly maxRetries?: NoInfer<number>;
}

export interface RunExecutionMetrics {
  readonly requestId: string;
  readonly runId: AutonomyRunId;
  readonly durationMs: number;
  readonly pluginCount: number;
  readonly signalCount: number;
  readonly peakScope: AutonomyScope;
}

export interface OrchestrationRunState {
  readonly completed: boolean;
  readonly plan: AutonomyPlan;
  readonly signals: readonly AutonomySignalEnvelope[];
  readonly outputs: readonly AutonomyExecutionOutput[];
  readonly metrics?: RunExecutionMetrics;
}

export interface OrchestratorDeps {
  readonly store: AutonomyRunStore;
  readonly failFast?: boolean;
}

export interface OrchestratorSummary {
  readonly planId: string;
  readonly durations: readonly {
    scope: AutonomyScope;
    startedAt: string;
    durationMs: number;
    signalCount: number;
  }[];
  readonly health: string;
}

export type OrchestrationResult =
  | { ok: true; value: OrchestrationRunState; summary: OrchestratorSummary }
  | { ok: false; error: Error; summary: OrchestrationRunState };

export type StageTimeline<TScope extends AutonomyScope = AutonomyScope> = {
  readonly scope: TScope;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly signalCount: number;
};

export const defaultRequestClock = (): string => new Date().toISOString();

export interface ServiceContract {
  run<TPayload extends object>(request: RunExecutionRequest<AutonomyScope, TPayload>): Promise<OrchestrationResult>;
  runWithSummary<TPayload extends object>(
    request: RunExecutionRequest<AutonomyScope, TPayload>,
  ): Promise<{
    ok: true;
    value: {
      state: OrchestrationRunState;
      summary: OrchestratorSummary;
    };
  }>;
}

export interface PipelineDependencies {
  readonly registry?: unknown;
}
