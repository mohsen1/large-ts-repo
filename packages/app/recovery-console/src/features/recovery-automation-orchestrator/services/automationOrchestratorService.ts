import type { StageName } from '@shared/automation-orchestration-runtime';
import type { AutomationExecutionConfig, AutomationSummary, AutomationTenantId } from '@domain/recovery-automation-orchestrator';
import { RecoveryAutomationOrchestrator } from '@domain/recovery-automation-orchestrator';
import { catalogEntries, getCatalog } from '@domain/recovery-automation-orchestrator';
import type {
  AutomationDashboardCommand,
  AutomationTelemetryDatum,
} from '../types';

const GLOBAL_TENANT: AutomationTenantId = 'tenant:global' as AutomationTenantId;

const initialConfig: AutomationExecutionConfig = {
  tenant: GLOBAL_TENANT,
  timeoutMs: 30_000,
  includeTelemetry: true,
  concurrency: 2,
  dryRun: false,
};

const toCommands = (planId: string): readonly AutomationDashboardCommand[] => {
  const stageNames: StageName[] = ['stage:intake', 'stage:analysis', 'stage:execute', 'stage:verify'];
  return stageNames.map((stage, index) => ({
    id: `command:${planId}:${index}`,
    title: `Automation step ${index + 1}`,
    stage,
    enabled: true,
    priority: index < 2 ? 'critical' : index === 2 ? 'high' : 'medium',
    tenant: GLOBAL_TENANT,
  }));
};

const metricSeries = (planId: string): readonly AutomationTelemetryDatum[] => {
  const base = 42;
  return Array.from({ length: 12 }).map((_, index) => ({
    metric: `${planId}-metric-${index}`,
    value: base + index,
    at: new Date(Date.now() - (11 - index) * 60_000).toISOString(),
  }));
};

const parseTenant = (tenant: string): AutomationTenantId => tenant as AutomationTenantId;

export const createOrchestrator = (tenant: AutomationTenantId) => new RecoveryAutomationOrchestrator({ tenant, config: initialConfig });

export interface ExecuteResult {
  readonly summary?: AutomationSummary;
  readonly errorMessage?: string;
}

export const executePlan = async (tenant: string, planId: string): Promise<ExecuteResult> => {
  const orchestrator = createOrchestrator(parseTenant(tenant));
  if (!(await hasCatalog(planId, tenant))) {
    return { errorMessage: `missing plan ${planId}` };
  }

  const summary = await orchestrator.run(planId, {
    scenarioId: `scenario:${planId}`,
    templateId: planId,
  });
  return { summary };
};

export const hasCatalog = async (planId: string, tenant: string): Promise<boolean> => {
  const catalog = getCatalog(parseTenant(tenant));
  return catalog?.plans.some((plan) => plan.id === planId) ?? false;
};

export const catalogPlans = (tenant: string) => {
  const entry = getCatalog(parseTenant(tenant));
  return (entry?.plans ?? []).map((plan) => ({ ...plan, tenant }));
};

export const bootstrapPlan = async (
  _tenant: string,
  planId: string,
): Promise<readonly AutomationDashboardCommand[]> => toCommands(planId);

export const loadCatalog = (): readonly { tenant: string; planCount: number }[] =>
  catalogEntries().map((entry) => ({
    tenant: entry.tenant,
    planCount: entry.plans.length,
  }));

export const loadTelemetry = async (_planId: string, tenant: string): Promise<readonly AutomationTelemetryDatum[]> =>
  metricSeries(`tenant:${tenant}`);

export const evaluateCommandBatch = (commands: readonly AutomationDashboardCommand[]): {
  readonly commandCount: number;
  readonly blockedCount: number;
  readonly criticalCount: number;
} => ({
  commandCount: commands.length,
  blockedCount: commands.filter((command) => !command.enabled).length,
  criticalCount: commands.filter((command) => command.priority === 'critical').length,
});

export const runOrchestratorPlan = async (tenant: string, planId: string): Promise<AutomationSummary> => {
  const result = await executePlan(tenant, planId);
  if (!result.summary) {
    throw new Error(result.errorMessage ?? 'orchestrator failed');
  }
  return result.summary;
};

export const availableTenants = (): readonly string[] => catalogEntries().map((entry) => entry.tenant);

export const useAutomationService = () =>
  ({
    executePlan,
    hasCatalog,
    catalogPlans,
    loadCatalog,
    loadTelemetry,
    runOrchestratorPlan,
  }) satisfies {
    executePlan: typeof executePlan;
    hasCatalog: typeof hasCatalog;
    catalogPlans: typeof catalogPlans;
    loadCatalog: typeof loadCatalog;
    loadTelemetry: typeof loadTelemetry;
    runOrchestratorPlan: typeof runOrchestratorPlan;
  };
