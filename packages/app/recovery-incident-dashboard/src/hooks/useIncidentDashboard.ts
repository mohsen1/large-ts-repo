import { useMemo } from 'react';
import { useDashboardState } from '../state';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { DashboardRunState, DashboardState, DashboardIncident, DashboardPlanState } from '../types';
import type { IncidentId, IncidentPlan } from '@domain/recovery-incident-orchestration';

export interface DashboardSummary {
  readonly incidentCount: number;
  readonly approvedPlanCount: number;
  readonly runningRunCount: number;
  readonly failedRunCount: number;
  readonly recentIncidentIds: readonly IncidentId[];
}

export const useIncidentDashboard = (repo: RecoveryIncidentRepository): {
  summary: DashboardSummary;
  state: DashboardState;
  actions: {
    refresh: () => Promise<void>;
    execute: (incidentId: IncidentId) => Promise<void>;
    promote: (planId: IncidentPlan['id']) => Promise<void>;
  };
} => {
  const { state, actions } = useDashboardState(repo);

  const summary = useMemo<DashboardSummary>(() => ({
    incidentCount: state.incidents.length,
    approvedPlanCount: state.plans.filter((plan) => plan.approved).length,
    runningRunCount: state.runs.filter((run) => run.state === 'running').length,
    failedRunCount: state.runs.filter((run) => run.state === 'failed').length,
    recentIncidentIds: [...state.incidents]
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, 5)
      .map((incident) => incident.id),
  }), [state.incidents, state.plans, state.runs]);

  return {
    summary,
    state,
    actions,
  };
};

export const summarizeState = ({ incidents, plans, runs }: DashboardState): string => {
  const runRatio = runs.length === 0 ? 0 : Math.round((runs.filter((run) => run.state === 'done').length / runs.length) * 100);
  const planRatio = plans.length === 0 ? 0 : Math.round((plans.filter((plan) => plan.approved).length / plans.length) * 100);

  return [
    `incidents:${incidents.length}`,
    `plans:${plans.length}`,
    `runs:${runs.length}`,
    `done:${runRatio}%`,
    `approved:${planRatio}%`,
  ].join(' | ');
};

export const flattenForView = (
  incidents: readonly DashboardIncident[],
  plans: readonly DashboardPlanState[],
): Array<{ incident: DashboardIncident; plan?: DashboardPlanState }> =>
  incidents.map((incident) => ({
    incident,
    plan: plans.find((entry) => entry.incidentId === incident.id),
  }));

export const filterRunsByState = (
  runs: readonly DashboardRunState[],
  target: DashboardRunState['state'],
): DashboardRunState[] => runs.filter((run) => run.state === target);
