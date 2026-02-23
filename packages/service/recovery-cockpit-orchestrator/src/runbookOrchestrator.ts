import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { RecoveryPlan, CommandEvent, RuntimeRun, PlanId } from '@domain/recovery-cockpit-models';
import { RecoveryCockpitOrchestrator } from './orchestrator';
import { createInMemoryWorkspace, OrchestratorConfig } from './ports';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';
import { summarizePlanHealth } from '@data/recovery-cockpit-store';

export type RunbookSlice = {
  readonly planId: PlanId;
  readonly planLabel: string;
  readonly readinessScore: number;
  readonly actionCount: number;
  readonly expectedMinutes: number;
  readonly readinessTrend: 'up' | 'flat' | 'down';
};

export type RunbookBundle = {
  readonly planId: PlanId;
  readonly run: RuntimeRun;
  readonly events: readonly CommandEvent[];
  readonly forecastScore: number;
  readonly healthReadiness: number;
  readonly trend: 'up' | 'flat' | 'down';
};

export type RunbookManifest = {
  readonly generatedAt: string;
  readonly runId: string;
  readonly plans: readonly RunbookSlice[];
};

export const asRunbookSlice = (plan: RecoveryPlan): RunbookSlice => {
  const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
  return {
    planId: plan.planId,
    planLabel: `${plan.labels.emoji} ${plan.labels.short}`,
    readinessScore: forecast.summary,
    actionCount: plan.actions.length,
    expectedMinutes: plan.slaMinutes,
    readinessTrend: forecast.summary >= 75 ? 'up' : forecast.summary >= 50 ? 'flat' : 'down',
  };
};

export const bootstrapSlices = (plans: readonly RecoveryPlan[]): readonly RunbookSlice[] =>
  [...plans].map(asRunbookSlice);

export const runPlanWithBundle = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
  config: OrchestratorConfig = {
    parallelism: 2,
    maxRuntimeMinutes: 180,
    retryPolicy: { enabled: true, maxRetries: 2 },
    policyMode: 'advisory',
  },
): Promise<RunbookBundle | undefined> => {
  const workspace = createInMemoryWorkspace(store);
  const orchestrator = new RecoveryCockpitOrchestrator(workspace, workspace.clock, config);
  const started = await orchestrator.start(plan);
  if (!started.ok) return;

  const health = await summarizePlanHealth(store, plan.planId);
  const forecast = buildPlanForecast(plan, plan.mode === 'automated' ? 'aggressive' : 'balanced');
  return {
    planId: plan.planId,
    run: started.value.run,
    events: started.value.events,
    forecastScore: forecast.summary,
    healthReadiness: health.ok ? health.value.latestReadiness : 100,
    trend: health.ok ? (health.value.trend === 'improving' ? 'up' : health.value.trend === 'degrading' ? 'down' : 'flat') : 'flat',
  };
};

export const buildRunbookManifest = (results: readonly RunbookBundle[], plans: readonly RecoveryPlan[]): RunbookManifest => ({
  generatedAt: new Date().toISOString(),
  runId: results[0]?.run.runId ?? 'none',
  plans: plans.map((plan) => asRunbookSlice(plan)),
});
