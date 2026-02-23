import type {
  ForecastResponse,
  ForecastPlan,
  OrchestrationInput,
} from './types';
import type { WorkloadStoreQuery } from '@data/recovery-workload-store';
import type { WorkloadNode } from '@domain/recovery-workload-intelligence';

export interface OrchestratorHealth {
  readonly status: 'green' | 'yellow' | 'red';
  readonly planCount: number;
  readonly nodes: number;
  readonly criticalWarnings: readonly string[];
  readonly topRiskNode?: WorkloadNode['id'];
}

export interface AuditRecord {
  readonly at: string;
  readonly level: 'info' | 'warn' | 'error';
  readonly message: string;
}

interface InternalPlanState {
  readonly plans: readonly ForecastPlan[];
  readonly warnings: readonly string[];
  readonly query: WorkloadStoreQuery;
}

const audit = (level: AuditRecord['level'], message: string): AuditRecord => ({
  at: new Date().toISOString(),
  level,
  message,
});

export const auditFromForecast = (forecast: ForecastResponse): readonly AuditRecord[] =>
  forecast.planGroups.length === 0
    ? [
      audit('error', 'forecast contained no plan groups'),
    ]
    : [
      audit('info', `forecast generated ${forecast.planGroups.length} plans`),
      ...forecast.warnings.map((warning) => audit('warn', warning)),
    ];

const highestRiskNode = (plans: readonly ForecastPlan[]): WorkloadNode['id'] | undefined => {
  if (plans.length === 0) {
    return undefined;
  }
  let selected = plans[0];
  for (const current of plans.slice(1)) {
    const currentRisk = current.plan.riskProfiles[0]?.riskScore ?? 0;
    const bestRisk = selected.plan.riskProfiles[0]?.riskScore ?? 0;
    if (currentRisk > bestRisk) {
      selected = current;
    }
  }
  return selected.plan.node.id;
};

export const evaluateHealth = async (input: OrchestrationInput): Promise<OrchestratorHealth> => {
  const records = await input.repository.query({ nodeIds: [], includeDependencies: true });
  const summary: InternalPlanState = {
    plans: [],
    warnings: [],
    query: {
      nodeIds: records.map((record) => record.node.id),
      includeDependencies: true,
    },
  };

  const status = records.length > 12 ? 'green' : records.length > 6 ? 'yellow' : 'red';
  const criticalWarnings = summary.warnings.length > 2 ? summary.warnings : [];
  const topRiskNode = highestRiskNode(summary.plans);
  return {
    status,
    planCount: summary.plans.length,
    nodes: records.length,
    criticalWarnings,
    topRiskNode,
  };
};
