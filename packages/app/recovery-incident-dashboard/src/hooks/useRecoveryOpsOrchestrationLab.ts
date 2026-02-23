import { useCallback, useEffect, useMemo, useState } from 'react';
import { OrchestrationLabEngine } from '@service/recovery-incident-orchestrator';
import { collectTimelineEvents, buildSegments } from '@domain/recovery-ops-orchestration-lab';
import type {
  RecoveryOpsOrchestrationLabState,
  OrchestrationLabTimelinePoint,
} from '../types/recoveryOpsOrchestrationLab';
import type { OrchestrationLab, LabPlan, OrchestrationPolicy, LabRunId } from '@domain/recovery-ops-orchestration-lab';

const toTimelinePoints = (lab: OrchestrationLab | undefined): readonly OrchestrationLabTimelinePoint[] => {
  if (!lab) {
    return [];
  }

  const events = collectTimelineEvents(lab);
  const segments = buildSegments(events);
  return segments.map((segment) => ({
    timestamp: segment.from,
    label: segment.label,
  }));
};

const policy: OrchestrationPolicy = {
  id: 'lab-policy' as OrchestrationPolicy['id'],
  tenantId: 'tenant',
  maxParallelSteps: 12,
  minConfidence: 0.4,
  allowedTiers: ['signal', 'warning', 'critical'] as const,
  minWindowMinutes: 20,
  timeoutMinutes: 300,
};

export const useRecoveryOpsOrchestrationLab = (lab: OrchestrationLab): RecoveryOpsOrchestrationLabState => {
  const [engine] = useState(() =>
    new OrchestrationLabEngine({
      policy,
      runner: {
        runPlan: async (plan: LabPlan) => ({
          id: `${plan.id}:${Date.now()}` as LabRunId,
          planId: plan.id,
          labId: lab.id,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'succeeded',
          stepCount: plan.steps.length,
          logs: ['runner-start', `plan:${plan.id}`],
          metadata: {},
        }),
      },
    }),
  );

  const [workspace, setWorkspace] = useState<RecoveryOpsOrchestrationLabState['workspace']>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selectedPlanId, setSelectedPlanId] = useState<LabPlan['id'] | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const opened = await engine.openWorkspace(lab);
      setWorkspace(opened);
      if (!selectedPlanId) {
        setSelectedPlanId(opened.envelope.plans[0]?.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'failed-to-open-workspace');
    } finally {
      setLoading(false);
    }
  }, [engine, lab, selectedPlanId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectPlan = useCallback(async (planId: LabPlan['id']) => {
    setLoading(true);
    try {
      await engine.selectPlan(lab, planId);
      setSelectedPlanId(planId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'failed-to-select');
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [engine, lab, refresh]);

  const runPlan = useCallback(async () => {
    if (!selectedPlanId) {
      throw new Error('no-plan-selected');
    }

    setLoading(true);
    try {
      await engine.runPlan(lab, selectedPlanId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'failed-to-run');
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [engine, lab, refresh, selectedPlanId]);

  const signalCount = workspace?.lab.signals.length ?? 0;
  const candidateCount = workspace?.candidateCount ?? 0;
  const timeline = useMemo(() => toTimelinePoints(workspace?.lab), [workspace?.lab]);

  return {
    workspace,
    loading,
    error,
    signalCount,
    candidateCount,
    timeline,
    selectedPlanId,
    selectPlan,
    runPlan,
  };
};
