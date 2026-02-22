import { useCallback, useMemo, useState } from 'react';
import type { DashboardState, DashboardIncident, DashboardRunState } from '../types';
import { useIncidentDashboard } from './useIncidentDashboard';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import {
  buildDashboardSnapshot,
  buildRunProfiles,
  type DashboardSnapshot,
} from '@service/recovery-incident-orchestrator';
import type { OrchestrationRun } from '@domain/recovery-incident-orchestration';
import type { DashboardSummary } from './useIncidentDashboard';

export interface IncidentControlState {
  readonly repository: RecoveryIncidentRepository;
  readonly snapshot?: DashboardSnapshot;
  readonly loading: boolean;
  readonly error?: string;
}

export interface IncidentControlActions {
  readonly load: (tenantId: string, includeResolved: boolean) => Promise<void>;
  readonly refreshFromState: () => Promise<void>;
}

export const useIncidentControl = (repository: RecoveryIncidentRepository) => {
  const { state, actions } = useIncidentDashboard(repository);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (tenantId: string, includeResolved: boolean) => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await buildDashboardSnapshot(repository, {
        tenantId,
        includeResolved,
        maxPlans: 300,
      });
      setSnapshot(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'failed to load dashboard snapshot');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  const refreshFromState = useCallback(async () => {
    await actions.refresh();
    const firstTenant = state.incidents.at(0)?.scope.tenantId;
    if (firstTenant) {
      await load(firstTenant, false);
    }
  }, [actions, state.incidents, load]);

  const summary: DashboardSummary = useMemo(() => ({
    incidentCount: state.incidents.length,
    approvedPlanCount: state.plans.filter((plan) => plan.approved).length,
    runningRunCount: state.runs.filter((run) => run.state === 'running').length,
    failedRunCount: state.runs.filter((run) => run.state === 'failed').length,
    recentIncidentIds: state.incidents.slice(0, 5).map((incident) => incident.id),
  }), [state.incidents, state.plans, state.runs]);

  const profileRows = useMemo(() => {
    const mappedRuns = state.runs.map<OrchestrationRun>((run) => ({
      id: run.runId,
      planId: run.planId,
      nodeId: run.nodeId,
      state: run.state,
      startedAt: run.startedAt,
      output: {},
    }));
    return buildRunProfiles(mappedRuns);
  }, [state.runs]);

  return {
    state,
    actions,
    summary,
    snapshot,
    loading,
    error,
    profileRows,
    load,
    refreshFromState,
  };
};
