import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ReadinessSimulationState,
  type ReadinessSimulationControls,
  summarizeSignals,
} from '../types/readinessSimulationConsole';
import { createReadinessSimulationDashboard } from '@service/recovery-readiness-orchestrator';
import type {
  ReadinessPolicy,
  RecoveryReadinessPlanDraft,
  ReadinessSignal,
} from '@domain/recovery-readiness';
import { withBrand } from '@shared/core';

type DashboardState = ReturnType<typeof createReadinessSimulationDashboard>;

export interface UseReadinessSimulationConsoleInput {
  readonly tenant: string;
  readonly policy: ReadinessPolicy;
  readonly draft: RecoveryReadinessPlanDraft;
  readonly signals: readonly ReadinessSignal[];
}

const severityToWeight = (severity: ReadinessSignal['severity']): number => {
  switch (severity) {
    case 'critical':
      return 6;
    case 'high':
      return 4;
    case 'medium':
      return 2;
    default:
      return 1;
  }
};

const buildProjection = (signals: readonly ReadinessSignal[]) =>
  signals.map((signal) => ({
    minute: new Date(signal.capturedAt).getUTCMinutes(),
    signals: 1,
    weightedSeverity: severityToWeight(signal.severity),
  }));

export const useReadinessSimulationConsole = ({
  tenant,
  policy,
  draft,
  signals,
}: UseReadinessSimulationConsoleInput) => {
  const [state, setState] = useState<ReadinessSimulationState | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly string[]>([]);
  const [dashboard] = useState<DashboardState>(() => createReadinessSimulationDashboard());

  const command = useMemo(
    () => ({
      tenant,
      runId: withBrand(`${tenant}:default`, 'ReadinessRunId').toString(),
      seed: draft.targetIds.length,
      targetIds: draft.targetIds,
    }),
    [tenant, draft.targetIds],
  );

  const controls: ReadinessSimulationControls = useMemo(
    () => ({
      canStart: activeRunId === null,
      canStep: activeRunId !== null,
      canCancel: activeRunId !== null,
    }),
    [activeRunId],
  );

  const launch = useCallback(async () => {
    const nextRunId = withBrand(`${tenant}:${history.length}`, 'ReadinessRunId');
    const page = await dashboard.launch(
      tenant,
      nextRunId,
      {
        draft,
        policy,
        signals,
      },
    );

    const currentRunId = nextRunId.toString();
    setActiveRunId(currentRunId);
    setHistory((current) => [...current, currentRunId]);

    setState((current) => {
      const projection = buildProjection(signals);
      const nodes = draft.targetIds.map((targetId) => ({
        id: targetId,
        owner: 'platform',
        criticality: 3,
      }));

      return {
        tenant,
        runId: currentRunId,
        command,
        nodes,
        projection,
        snapshots: [],
        runs: current?.runs ?? [],
        active: page.state === 'running',
        note: `launch:${page.state}`,
      };
    });
  }, [tenant, draft, policy, signals, history.length, command, dashboard]);

  const step = useCallback(async () => {
    if (!activeRunId) {
      return;
    }

    const result = await dashboard.stepAndReport(withBrand(activeRunId, 'ReadinessRunId'));
    if (!result.ok) {
      return;
    }

    setState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        active: result.value.state !== 'completed',
        note: `step:${result.value.completedSignals ?? 0}`,
      };
    });

    if (result.value.state === 'completed') {
      setActiveRunId(null);
    }
  }, [activeRunId, dashboard]);

  const cancel = useCallback(() => {
    setActiveRunId(null);
    setState((current) => (current ? { ...current, active: false, note: 'cancelled' } : current));
  }, []);

  const summary = useMemo(() => (state ? summarizeSignals(state.projection) : { totalSignals: 0, avgSeverity: 0 }), [state]);

  useEffect(() => {
    void launch();
  }, [launch]);

  return {
    controls,
    state,
    activeRunId,
    command,
    launch,
    step,
    cancel,
    summary,
    history,
  };
};
