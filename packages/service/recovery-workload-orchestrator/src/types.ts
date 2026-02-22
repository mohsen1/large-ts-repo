import type {
  WorkloadRepository,
  WorkloadTrendPoint,
  WorkloadViewRow,
} from '@data/recovery-workload-store';
import type { PlanningPlan, WorkloadDependencyGraph } from '@domain/recovery-workload-intelligence';
import type { Result } from '@shared/result';

export type OrchestratorMode = 'plan-only' | 'simulate' | 'drill';

export interface OrchestrationInput {
  readonly repository: WorkloadRepository;
  readonly graph: WorkloadDependencyGraph;
  readonly mode: OrchestratorMode;
}

export interface ForecastPlan {
  readonly plan: PlanningPlan;
  readonly recommendation: string;
}

export interface ForecastResponse {
  readonly planGroups: readonly ForecastPlan[];
  readonly warnings: readonly string[];
}

export interface DashboardSignal {
  readonly views: readonly WorkloadViewRow[];
  readonly trend: readonly WorkloadTrendPoint[];
}

export interface WorkloadOrchestrator {
  readonly evaluate: () => Promise<Result<ForecastResponse, string>>;
  readonly summary: () => Promise<DashboardSignal>;
  readonly executePlan: (incidentId: string) => Promise<Result<string, string>>;
}
