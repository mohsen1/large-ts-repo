import type { CadenceId, CadencePlan, CadenceWindow, CadenceIntent, CadenceWindowForecast } from '@domain/recovery-cadence-orchestration';

export interface CadenceCoordinatorConfig {
  readonly orgId: string;
  readonly owner: string;
  readonly timezone: string;
  readonly maxActiveWindowCount: number;
}

export interface CadenceCommandResult {
  readonly planId: CadencePlan['id'];
  readonly cadenceId: CadencePlan['templateId'];
  readonly accepted: boolean;
  readonly warnings: readonly string[];
  readonly startedAt: string;
}

export interface CadenceRun {
  readonly planId: CadencePlan['id'];
  readonly windows: readonly CadenceWindow[];
  readonly intents: readonly CadenceIntent[];
  readonly forecasts: readonly CadenceWindowForecast[];
  readonly active: boolean;
}

export interface CadenceCoordinatorError {
  readonly code: 'not-found' | 'validation' | 'persist' | 'saturation' | 'constraint';
  readonly message: string;
  readonly details?: unknown;
}

export interface CadenceOrchestratorDiagnostics {
  readonly queueDepth: number;
  readonly canAcceptMore: boolean;
  readonly activeRuns: number;
}
