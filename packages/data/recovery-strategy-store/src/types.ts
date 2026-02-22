import type {
  StrategyPlan,
  StrategyDraft,
  StrategyRun,
  StrategyRunId,
  OrchestrationTemplateId,
  StrategyTemplate,
} from '@domain/recovery-orchestration-planning';
import type { Result } from '@shared/result';

export interface StrategyStoreQuery {
  readonly tenantIds: readonly string[];
  readonly includeCompleted: boolean;
  readonly templateId?: OrchestrationTemplateId;
}

export interface StrategyStoreRecord {
  readonly tenantId: string;
  readonly plan: StrategyPlan;
  readonly draft: StrategyDraft;
  readonly template: StrategyTemplate;
  readonly windows: ReadonlyArray<StrategyPlan['windows'][number]>;
  readonly commandLog: ReadonlyArray<string>;
  readonly updatedAt: string;
}

export interface StrategyStoreEvent {
  readonly tenantId: string;
  readonly type: 'plan-created' | 'run-created' | 'run-updated' | 'command-added';
  readonly planId: string;
  readonly createdAt: string;
}

export interface StrategyStoreMetrics {
  readonly totalPlans: number;
  readonly totalDrafts: number;
  readonly averageCommandCount: number;
  readonly eventCount: number;
}

export interface StrategyStore extends OrchestrationStore {
  readonly templates: (tenantId: string) => Promise<ReadonlyArray<StrategyTemplate>>;
  readonly events: (tenantId: string, limit?: number) => Promise<ReadonlyArray<StrategyStoreEvent>>;
  readonly metrics: (tenantId: string) => Promise<StrategyStoreMetrics>;
}

export interface StrategyStoreRepository {
  readonly upsertPlan: (tenantId: string, plan: StrategyStoreRecord) => Promise<Result<void, string>>;
  readonly getPlan: (tenantId: string, planId: string) => Promise<Result<StrategyStoreRecord | undefined, string>>;
  readonly listPlans: (query: StrategyStoreQuery) => Promise<ReadonlyArray<StrategyStoreRecord>>;
  readonly upsertRun: (tenantId: string, run: StrategyRun) => Promise<Result<void, string>>;
  readonly getRun: (tenantId: string, runId: StrategyRunId) => Promise<Result<StrategyRun | undefined, string>>;
}

export interface OrchestrationStore {
  readonly upsertPlan: (tenantId: string, record: StrategyStoreRecord) => Promise<Result<void, string>>;
  readonly getPlan: (tenantId: string, planId: string) => Promise<Result<StrategyStoreRecord | null, string>>;
  readonly listPlans: (query: StrategyStoreQuery) => Promise<ReadonlyArray<StrategyStoreRecord>>;
  readonly upsertRun: (tenantId: string, run: StrategyRun) => Promise<Result<void, string>>;
  readonly appendCommandLog: (tenantId: string, planId: string, commandSummary: string) => Promise<Result<void, string>>;
  readonly latestCommand: (tenantId: string, planId: string) => Promise<Result<string | undefined, string>>;
}

export interface StrategyAuditEntry {
  readonly tenantId: string;
  readonly planId: string;
  readonly command: string;
  readonly status: 'ok' | 'error';
  readonly at: string;
}
