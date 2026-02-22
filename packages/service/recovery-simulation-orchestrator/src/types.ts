import type { SimulationCommand, SimulationPlanId, SimulationRunId, SimulationBatchResult, SimulationRunRecord } from '@domain/recovery-simulation-core';

export interface SimulationRunRequest {
  readonly planId: SimulationPlanId;
  readonly operatorId: string;
  readonly commands: readonly SimulationCommand[];
}

export interface SimulationRunEnvelope {
  readonly runId: SimulationRunId;
  readonly requestId: string;
  readonly status: 'accepted' | 'running' | 'finished' | 'error';
  readonly startedAt: string;
}

export interface SimulationOperationSummary {
  readonly batch: SimulationBatchResult;
  readonly request: SimulationRunRequest;
  readonly startedAt: string;
}

export interface SimulationRunBundle {
  readonly run: SimulationRunRecord;
  readonly commands: readonly SimulationCommand[];
}
