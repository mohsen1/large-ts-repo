import type {
  ConvergenceStudioId,
  ConvergenceRunId,
  ConvergencePlanId,
  ConvergenceSummary,
  ConvergencePluginDescriptor,
  ConvergenceLifecycle,
  ConvergenceStage,
} from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';

export type ConvergenceRunMode = 'live' | 'dry-run' | 'replay';

export interface ConvergenceRunEnvelope {
  readonly studioId: ConvergenceStudioId;
  readonly runId: ConvergenceRunId;
  readonly mode: ConvergenceRunMode;
  readonly requestedBy: string;
  readonly createdAt: string;
}

export interface ConvergenceRunPayload {
  readonly runId: ConvergenceRunId;
  readonly summary: ConvergenceSummary;
  readonly lifecycle: ConvergenceLifecycle;
  readonly selected: readonly ConvergencePluginDescriptor[];
  readonly activeStages: readonly ConvergenceStage[];
}

export interface ConvergenceRunOutput {
  readonly envelope: ConvergenceRunEnvelope;
  readonly payload: ConvergenceRunPayload;
  readonly report: {
    readonly elapsedMs: number;
    readonly stageCount: number;
    readonly pluginCount: number;
    readonly planId: ConvergencePlanId;
    readonly status: 'ok' | 'partial' | 'failed';
  };
}

export type RuntimeListener<TState extends object = object> = (state: TState) => void;

export interface RuntimeCheckpoint {
  readonly runId: ConvergenceRunId;
  readonly label: string;
  readonly value: unknown;
}

export interface RuntimeSeries {
  readonly runId: ConvergenceRunId;
  readonly samples: readonly RuntimeCheckpoint[];
}
