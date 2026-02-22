import type {
  StrategyPlan,
  StrategyRun,
  StrategyRunId,
  StrategyDraft,
  StrategyTemplate,
  StrategySimulationWindow,
} from '@domain/recovery-orchestration-planning';
import type { StrategyStore } from '@data/recovery-strategy-store';
import type { Result } from '@shared/result';

export interface StrategyOrchestratorConfig {
  readonly tenantId: string;
  readonly store: StrategyStore;
  readonly owner: string;
  readonly refreshIntervalMs: number;
}

export interface OrchestrationWorkspace {
  readonly draft: StrategyDraft;
  readonly plan: StrategyPlan;
  readonly run: StrategyRun;
  readonly windows: readonly StrategySimulationWindow[];
  readonly template: StrategyTemplate;
}

export interface OrchestrationSummary {
  readonly tenantId: string;
  readonly planCount: number;
  readonly runCount: number;
  readonly activePlanId: string;
  readonly lastUpdatedAt: string;
}

export interface StrategyOrchestrator {
  readonly state: () => Promise<OrchestrationSummary>;
  readonly buildWorkspace: (template: StrategyTemplate) => Promise<Result<OrchestrationWorkspace, string>>;
  readonly startRun: (template: StrategyTemplate) => Promise<Result<StrategyRun, string>>;
  readonly appendCommand: (planId: string, commandSummary: string) => Promise<Result<void, string>>;
}
