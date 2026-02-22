import type { Brand } from '@shared/core';
import type { Result } from '@shared/result';
import type {
  ContinuityForecast,
  ContinuityForecastRequest,
  ContinuityWorkspaceSummary,
  ContinuitySignal,
  ContinuityTenantId,
  ContinuityWorkspace,
} from '@domain/continuity-lens';

export type ContinuityRunId = Brand<string, 'ContinuityRunId'>;

export interface ContinuityLensContext {
  readonly tenantId: ContinuityTenantId;
  readonly correlationMode: 'auto' | 'manual';
  readonly maxSignalsPerRun: number;
}

export interface ContinuityIngestionBatch {
  readonly tenantId: ContinuityTenantId;
  readonly signals: readonly ContinuitySignal[];
}

export interface ContinuityOrchestrationResult {
  readonly runId: ContinuityRunId;
  readonly workspace: ContinuityWorkspace;
}

export type { ContinuityWorkspaceSummary } from '@domain/continuity-lens';

export interface OrchestratorAdapters {
  emitTelemetry(event: string, tenantId: ContinuityTenantId, message: string): void;
}

export interface ForecastInput extends ContinuityForecastRequest {}

export interface OrchestratorCommands {
  loadDefaults(): Promise<void>;
  ingestBatch(batch: ContinuityIngestionBatch): Promise<Result<ContinuityOrchestrationResult, Error>>;
  forecast(input: ForecastInput): Promise<Result<ContinuityForecast, Error>>;
  workspace(): Promise<Result<ContinuityWorkspace, Error>>;
  workspaceSummary(): Promise<Result<ContinuityWorkspaceSummary, Error>>;
  resetWorkspace(): Promise<void>;
  resetTenant(tenantId: ContinuityTenantId): Promise<void>;
}
