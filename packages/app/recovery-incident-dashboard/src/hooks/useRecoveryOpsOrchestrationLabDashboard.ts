import { useCallback, useEffect, useMemo, useState } from 'react';
import { OrchestrationLabEngine, type OrchestrationLabWorkspaceView } from '@service/recovery-incident-orchestrator';
import { RecoveryOpsOrchestrationLabStore } from '@data/recovery-ops-orchestration-lab-store';
import type { OrchestrationLab, LabPlan, LabExecution, OrchestrationPolicy, LabRunId } from '@domain/recovery-ops-orchestration-lab';
import { buildRecoveryForecast, summarizeLab, bucketizeSignals } from '@domain/recovery-ops-orchestration-lab';

interface DashboardState {
  readonly loading: boolean;
  readonly workspace?: OrchestrationLabWorkspaceView;
  readonly selectedPlanId?: LabPlan['id'];
  readonly summaryLine: string;
  readonly forecastLine: string;
  readonly signalBuckets?: ReturnType<typeof bucketizeSignals>['byTier'];
  readonly errors: string[];
}

const createPolicy = (): OrchestrationPolicy => ({
  id: 'recovery-dashboard-policy' as OrchestrationPolicy['id'],
  tenantId: 'tenant',
  maxParallelSteps: 10,
  minConfidence: 0.2,
  allowedTiers: ['signal', 'warning', 'critical'],
  minWindowMinutes: 12,
  timeoutMinutes: 240,
});

const buildRunner = (policy: OrchestrationPolicy) => ({
  runPlan: async (plan: LabPlan): Promise<LabExecution> => ({
    id: `${plan.id}:${Date.now()}` as LabRunId,
    planId: plan.id,
    labId: plan.labId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'succeeded',
    stepCount: plan.steps.length,
    logs: ['start', `plan=${plan.id}`, policy.id],
    metadata: {},
  }),
});

export const useRecoveryOpsOrchestrationLabDashboard = (lab: OrchestrationLab) => {
  const policy = createPolicy();
  const [engine] = useState(() => new OrchestrationLabEngine({ policy, runner: buildRunner(policy) }));
  const [store] = useState(() => new RecoveryOpsOrchestrationLabStore());
  const [state, setState] = useState<DashboardState>({
    loading: false,
    summaryLine: 'uninitialized',
    forecastLine: 'uninitialized',
    errors: [],
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, errors: [] }));
    try {
      const workspace = await engine.openWorkspace(lab);
      await store.upsertEnvelope(workspace.envelope);
      const summary = summarizeLab(lab, [], workspace.envelope.plans[0]);
      const forecast = buildRecoveryForecast(lab, 4);
      const buckets = bucketizeSignals(lab.signals);
      setState((current) => ({
        ...current,
        loading: false,
        workspace,
        summaryLine: `signals=${summary.totalSignals} critical=${summary.criticalSignals}`,
        forecastLine: forecast.recommendation,
        selectedPlanId: workspace.envelope.plans[0]?.id,
        signalBuckets: buckets.byTier,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        errors: [...current.errors, error instanceof Error ? error.message : 'dashboard-refresh'],
      }));
    }
  }, [engine, lab, store]);

  const selectPlan = useCallback(async (planId: LabPlan['id']) => {
    try {
      await engine.selectPlan(lab, planId);
      await refresh();
      setState((current) => ({ ...current, selectedPlanId: planId }));
    } catch (error) {
      setState((current) => ({
        ...current,
        errors: [...current.errors, error instanceof Error ? error.message : 'dashboard-select'],
      }));
    }
  }, [engine, lab, refresh]);

  const runPlan = useCallback(async () => {
    if (!state.selectedPlanId) {
      return;
    }
    try {
      await engine.runPlan(lab, state.selectedPlanId);
      await refresh();
    } catch (error) {
      setState((current) => ({
        ...current,
        errors: [...current.errors, error instanceof Error ? error.message : 'dashboard-run'],
      }));
    }
  }, [engine, lab, refresh, state.selectedPlanId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const diagnostics = useMemo(() => {
    const allRuns = state.workspace ? state.workspace.candidateCount : 0;
    return {
      timelineWindows: allRuns,
      totalSnapshots: 1 + allRuns,
    };
  }, [state.workspace]);

  return {
    state,
    refresh,
    selectPlan,
    runPlan,
    diagnostics,
  };
};
