import { Result, ok, fail } from '@shared/result';
import { PlanId, RecoveryPlan, RuntimeRun, RecoveryAction, UtcIsoTimestamp, RunId } from '@domain/recovery-cockpit-models';
import { RecoveryCockpitOrchestrator } from './orchestrator';
import { createInMemoryWorkspace } from './ports';
import { InMemoryCockpitStore, createAuditRun } from '@data/recovery-cockpit-store';
import { InMemoryCockpitInsightsStore } from '@data/recovery-cockpit-insights';
import { buildDependencyInsight } from '@domain/recovery-cockpit-intelligence';

export type IncidentWindow = {
  readonly runId: RunId;
  readonly startedAt: UtcIsoTimestamp;
  readonly endedAt?: UtcIsoTimestamp;
  readonly affectedActions: ReadonlyArray<RecoveryAction['id']>;
  readonly status: 'running' | 'done' | 'failed';
};

export type ResponseSummary = {
  readonly planId: PlanId;
  readonly windows: ReadonlyArray<IncidentWindow>;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly actionCoverage: number;
};

export type IncidentOrchestrator = {
  start(plan: RecoveryPlan): Promise<Result<ResponseSummary, string>>;
  pause(runId: string): Promise<Result<boolean, string>>;
  resume(plan: RecoveryPlan): Promise<Result<ResponseSummary, string>>;
};

const toRisk = (windows: number): ResponseSummary['riskLevel'] =>
  windows > 5 ? 'high' : windows > 2 ? 'medium' : 'low';

const coverage = (plan: RecoveryPlan, run: RuntimeRun | undefined): number => {
  if (!run) return 0;
  const total = plan.actions.length || 1;
  return Math.round((run.completedActions.length / total) * 100 * 100) / 100;
};

const now = (): UtcIsoTimestamp => new Date().toISOString() as UtcIsoTimestamp;

const wrapWindow = (run: RuntimeRun, status: 'running' | 'done' | 'failed'): IncidentWindow => ({
  runId: run.runId,
  startedAt: run.startedAt,
  endedAt: status === 'running' ? undefined : now(),
  affectedActions: run.completedActions.map((action) => action.id),
  status,
});

  const planToSummary = (plan: RecoveryPlan, run: RuntimeRun | undefined, mode: 'done' | 'failed'): ResponseSummary => {
  const snapshot = buildDependencyInsight(plan);
  const windows = run ? [wrapWindow(run, mode === 'done' ? 'done' : 'failed')] : [];
  return {
    planId: plan.planId,
    windows,
    riskLevel: toRisk(windows.length),
    actionCoverage: coverage(plan, run),
  };
};

export const createIncidentOrchestrator = (store = new InMemoryCockpitStore(), insights = new InMemoryCockpitInsightsStore()): IncidentOrchestrator => {
  const orchestrator = new RecoveryCockpitOrchestrator(createInMemoryWorkspace(store), undefined, {});
  const active = new Map<string, RuntimeRun>();
  const snapshots = new Map<string, IncidentWindow>();

  const start = async (plan: RecoveryPlan): Promise<Result<ResponseSummary, string>> => {
    const runResult = await orchestrator.start(plan);
    if (!runResult.ok) {
      return fail(runResult.error);
    }
    const planRuns = await store.listRuns(plan.planId);
    if (!planRuns.ok) return fail(planRuns.error);
    const run = planRuns.value.at(-1);
    if (!run) return fail('run-not-found');
    active.set(plan.planId, run);
    const seed = createAuditRun(plan.planId, {
      id: 'system:incident' as RecoveryAction['id'],
      kind: 'operator',
    });
    active.set(plan.planId, { ...seed, ...run, state: 'active' } as RuntimeRun);
    await insights.upsertInsight({
      planId: plan.planId,
      summary: `incident window started ${run.runId}`,
      createdAt: now(),
      runCount: planRuns.value.length,
      latestRunState: run.state,
      forecastSummary: 0,
      score: {
        planId: plan.planId,
        risk: 10,
        readiness: 100,
        policy: 100,
        health: 'green',
        reasons: ['incident-start'],
      },
    });
    return ok(planToSummary(plan, run, 'done'));
  };

  const pause = async (runId: string): Promise<Result<boolean, string>> => {
    const aborted = await orchestrator.abort(runId);
    if (!aborted.ok) return fail(aborted.error);
    snapshots.delete(runId);
    return ok(aborted.value);
  };

  const resume = async (plan: RecoveryPlan): Promise<Result<ResponseSummary, string>> => {
    const current = active.get(plan.planId);
    if (!current) {
      return fail('run-not-found');
    }
    const dependency = buildDependencyInsight(plan);
    const summary: ResponseSummary = {
      planId: plan.planId,
      windows: [
        {
          runId: current.runId,
          startedAt: current.startedAt,
          endedAt: now(),
          affectedActions: current.completedActions.map((action) => action.id),
          status: 'running',
        },
      ],
      riskLevel: dependency.health === 'healthy' ? 'low' : dependency.health === 'fragile' ? 'medium' : 'high',
      actionCoverage: coverage(plan, current),
    };
    await start(plan);
    return ok(summary);
  };

  return { start, pause, resume };
};
