import type { Result } from '@shared/result';
import type {
  CadenceCommandResult,
  CadenceCoordinatorConfig,
  CadenceCoordinatorError,
  CadenceRun,
  CadenceOrchestratorDiagnostics,
} from './types';
import type {
  CadenceIntent,
  CadencePlan,
  CadenceWindow,
  CadenceWindowForecast,
} from '@domain/recovery-cadence-orchestration';

export interface CadenceEventPublisher {
  publish(eventName: string, payload: unknown): Promise<void>;
}

export interface CadencePlanBuilder {
  craftPlan(config: CadenceCoordinatorConfig): Promise<Result<CadencePlan, CadenceCoordinatorError>>;
  persistPlan(plan: CadencePlan): Promise<Result<CadencePlan, CadenceCoordinatorError>>;
  expandPlan(planId: CadencePlan['id'], windows: readonly Omit<WindowBlueprint, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Result<readonly CadenceWindow[], CadenceCoordinatorError>>;
}

export interface WindowBlueprint {
  readonly channel: CadenceWindow['channel'];
  readonly name: string;
  readonly owner: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly leadMinutes: number;
  readonly lagMinutes: number;
}

export interface CadenceIntentProcessor {
  collectIntents(planId: CadencePlan['id']): Promise<Result<readonly CadenceIntent[], CadenceCoordinatorError>>;
  applyIntents(planId: CadencePlan['id'], intents: readonly CadenceIntent[]): Promise<Result<readonly CadenceIntent[], CadenceCoordinatorError>>;
}

export interface CadenceForecastEngine {
  forecast(plan: CadencePlan): Promise<Result<readonly CadenceWindowForecast[], CadenceCoordinatorError>>;
  diagnose(plan: CadencePlan): Promise<Result<CadenceOrchestratorDiagnostics, CadenceCoordinatorError>>;
}

export interface CadenceLifecycle {
  bootstrap(planId: CadencePlan['id']): Promise<Result<CadenceCommandResult, CadenceCoordinatorError>>;
  activateWindows(planId: CadencePlan['id'], windowIds: readonly CadenceWindow['id'][]): Promise<Result<readonly CadenceWindow[], CadenceCoordinatorError>>;
  decommission(planId: CadencePlan['id']): Promise<Result<CadenceCommandResult, CadenceCoordinatorError>>;
  fetchRun(planId: CadencePlan['id']): Promise<Result<CadenceRun | undefined, CadenceCoordinatorError>>;
}
